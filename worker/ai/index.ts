import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { RecipeDraftSchema, type AiTask, type RecipeDraft } from "../../shared/ai-recipe";
import type { Env } from "../env";

export const CLAUDE_MODEL = "claude-opus-5-5";

export class AiError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 422 | 502 = 502
  ) {
    super(message);
  }
}

export interface AiImage {
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  base64: string;
}

export interface AiRequest {
  task: AiTask;
  system: string;
  text: string;
  images?: AiImage[];
}

export interface AiSettings {
  claudeEnabled: boolean;
  ollamaEnabled: boolean;
  fallbackToClaude: boolean;
  ollamaModel: string;
}

export async function readAiSettings(db: D1Database): Promise<AiSettings> {
  const { results } = await db
    .prepare("SELECT key, value FROM settings WHERE key LIKE 'ai.%'")
    .all<{ key: string; value: string }>();
  const s = Object.fromEntries(results.map((r) => [r.key, r.value]));
  return {
    claudeEnabled: (s["ai.claude_enabled"] ?? "true") === "true",
    ollamaEnabled: s["ai.ollama_enabled"] === "true",
    fallbackToClaude: (s["ai.fallback_to_claude"] ?? "true") === "true",
    ollamaModel: s["ai.ollama_model"] ?? ""
  };
}

export function aiStatus(env: Env, s: AiSettings) {
  const claudeReady = !!env.ANTHROPIC_API_KEY;
  const ollamaReady = !!env.OLLAMA_URL && !!s.ollamaModel;
  return {
    claude: { enabled: s.claudeEnabled, configured: claudeReady },
    ollama: { enabled: s.ollamaEnabled, configured: !!env.OLLAMA_URL, model: s.ollamaModel },
    fallbackToClaude: s.fallbackToClaude,
    available: (s.claudeEnabled && claudeReady) || (s.ollamaEnabled && ollamaReady)
  };
}

const schemas = new WeakMap<z.ZodType, Record<string, unknown>>();
/** JSON Schema for a zod schema, as Claude's structured outputs and Ollama's format expect. */
function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  let js = schemas.get(schema);
  if (!js) {
    js = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
    delete js.$schema;
    schemas.set(schema, js);
  }
  return js;
}

function parseAnswer<T>(text: string, schema: z.ZodType<T>): T {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new AiError("The AI's answer wasn't readable. Please try again.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new AiError("The AI's answer was incomplete. Please try again.");
  return parsed.data;
}

async function callClaude<T>(env: Env, req: AiRequest, schema: z.ZodType<T>): Promise<T> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 120_000 });
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...(req.images ?? []).map(
      (img): Anthropic.Beta.BetaImageBlockParam => ({
        type: "image",
        source: { type: "base64", media_type: img.mediaType, data: img.base64 }
      })
    ),
    { type: "text", text: req.text }
  ];
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: jsonSchema(schema) } },
      system: req.system,
      messages: [{ role: "user", content }]
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("The Claude API key isn't valid. Check it in setup.", 502);
    if (e instanceof Anthropic.RateLimitError) throw new AiError("Claude is busy right now. Try again in a minute.", 502);
    if (e instanceof Anthropic.BadRequestError) throw new AiError(`Claude couldn't take that request (${e.message}).`, 502);
    if (e instanceof Anthropic.APIError) throw new AiError(`Claude had a problem (${e.status ?? "network"}). Try again.`, 502);
    throw e;
  }
  if (response.stop_reason === "refusal") throw new AiError("Claude declined this request.", 422);
  if (response.stop_reason === "max_tokens") throw new AiError("The recipe was too long for one go. Try fewer pages.", 422);
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return parseAnswer(text, schema);
}

async function callOllama<T>(env: Env, s: AiSettings, req: AiRequest, schema: z.ZodType<T>): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // The tunnel to the home PC is protected by a Cloudflare Access service token.
  if (env.OLLAMA_ACCESS_CLIENT_ID && env.OLLAMA_ACCESS_CLIENT_SECRET) {
    headers["CF-Access-Client-Id"] = env.OLLAMA_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = env.OLLAMA_ACCESS_CLIENT_SECRET;
  }
  let res: Response;
  try {
    res = await fetch(`${env.OLLAMA_URL!.replace(/\/+$/, "")}/api/chat`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(180_000),
      body: JSON.stringify({
        model: s.ollamaModel,
        stream: false,
        format: jsonSchema(schema),
        options: { temperature: 0.2 },
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.text, images: (req.images ?? []).map((i) => i.base64) }
        ]
      })
    });
  } catch {
    throw new AiError("Couldn't reach the Ollama PC. Is it switched on?");
  }
  if (!res.ok) throw new AiError(`The Ollama PC answered with an error (${res.status}).`);
  const body = (await res.json().catch(() => null)) as { message?: { content?: string } } | null;
  return parseAnswer(body?.message?.content ?? "", schema);
}

/** Ask the AI for a structured answer, on the chosen AI, falling back to Claude when allowed. */
export async function askAi<T>(env: Env, req: AiRequest, schema: z.ZodType<T>): Promise<{ answer: T; provider: "claude" | "ollama" }> {
  const s = await readAiSettings(env.DB);
  const claudeOk = s.claudeEnabled && !!env.ANTHROPIC_API_KEY;
  const ollamaOk = s.ollamaEnabled && !!env.OLLAMA_URL && !!s.ollamaModel;
  if (!claudeOk && !ollamaOk) {
    throw new AiError(
      s.claudeEnabled || s.ollamaEnabled ? "AI isn't set up yet. See Settings." : "AI is turned off in Settings.",
      403
    );
  }
  if (ollamaOk) {
    try {
      return { answer: await callOllama(env, s, req, schema), provider: "ollama" };
    } catch (e) {
      if (!(claudeOk && s.fallbackToClaude)) throw e;
      console.warn("Ollama failed, falling back to Claude:", (e as Error).message);
    }
  }
  return { answer: await callClaude(env, req, schema), provider: "claude" };
}

/** Run a recipe task (scan or draft). */
export async function runAi(env: Env, req: AiRequest): Promise<{ draft: RecipeDraft; provider: "claude" | "ollama" }> {
  const { answer, provider } = await askAi(env, req, RecipeDraftSchema);
  return { draft: answer, provider };
}
