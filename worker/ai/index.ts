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
    search: searchMode(env, s),
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

export interface FoundRecipe {
  title: string;
  url: string;
  site: string;
  summary: string;
  minutes: number | null;
}

const FoundSchema = z.object({
  options: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      site: z.string().optional().default(""),
      summary: z.string().optional().default(""),
      minutes: z.number().nullable().optional().default(null)
    })
  )
});

const FIND_SYSTEM = `You help someone find recipes on the web for a family recipe collection.
Search the web for the dish they ask for and pick about 6 good, varied options from reputable recipe sites and food writers.
Each option must be a single recipe page (not a list, roundup, video or search page) that you saw in the search results.
After searching, answer with only a JSON object in a \`\`\`json fence, shaped like:
{"options":[{"title":"...","url":"https://...","site":"Site name","summary":"One sentence on what makes this version different.","minutes":75}]}
minutes is the total time if the result shows it, otherwise null.`;

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** Pull the JSON answer out of Claude's text (fenced or bare). */
export function parseFoundText(text: string): FoundRecipe[] | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    const parsed = FoundSchema.safeParse(JSON.parse(candidate));
    if (!parsed.success) return null;
    return parsed.data.options
      .filter((o) => /^https?:\/\//.test(o.url))
      .map((o) => ({ title: o.title, url: o.url, site: o.site || hostOf(o.url), summary: o.summary, minutes: o.minutes ?? null }));
  } catch {
    return null;
  }
}

/** Search the web for recipes with Claude's web search tool. */
async function searchWithClaude(env: Env, query: string): Promise<FoundRecipe[]> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 120_000 });
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: `Find recipes for: ${query}` }];
  const seen: { title: string; url: string }[] = [];
  let response: Anthropic.Beta.BetaMessage | null = null;
  try {
    // The search runs on Anthropic's side; a long search may pause and need continuing.
    for (let turn = 0; turn < 4; turn++) {
      response = await client.beta.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 8000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system: FIND_SYSTEM,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
        messages
      });
      for (const b of response.content) {
        if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
          for (const r of b.content) seen.push({ title: r.title, url: r.url });
        }
      }
      if (response.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: response.content as Anthropic.Beta.BetaContentBlockParam[] });
    }
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("The Claude API key isn't valid. Check it in setup.", 502);
    if (e instanceof Anthropic.RateLimitError) throw new AiError("Claude is busy right now. Try again in a minute.", 502);
    if (e instanceof Anthropic.APIError) throw new AiError(`Claude couldn't search right now (${e.status ?? "network"}). Try again.`, 502);
    throw e;
  }
  if (response?.stop_reason === "refusal") throw new AiError("Claude declined this search.", 422);
  const text = (response?.content ?? []).flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const found = parseFoundText(text);
  if (found?.length) return dedupe(found);
  // Couldn't read the answer: fall back to the raw search results.
  return dedupe(seen.map((r) => ({ title: r.title, url: r.url, site: hostOf(r.url), summary: "", minutes: null })));
}

function dedupe(list: FoundRecipe[]): FoundRecipe[] {
  const urls = new Set<string>();
  return list.filter((o) => (urls.has(o.url) ? false : (urls.add(o.url), true))).slice(0, 8);
}

interface BraveResult {
  title: string;
  url: string;
  description: string;
}

const stripTags = (h: string) =>
  h.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** Web results from the Brave Search API. */
export async function braveSearch(env: Env, query: string): Promise<BraveResult[]> {
  let res: Response;
  try {
    res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(`${query} recipe`)}&count=20`, {
      headers: { Accept: "application/json", "X-Subscription-Token": env.BRAVE_API_KEY! },
      signal: AbortSignal.timeout(20_000)
    });
  } catch {
    throw new AiError("Couldn't reach Brave Search. Try again.");
  }
  if (res.status === 401 || res.status === 403) throw new AiError("The Brave Search key isn't valid. Check it in setup.");
  if (res.status === 429) throw new AiError("Brave Search is busy or out of searches for now. Try again later.");
  if (!res.ok) throw new AiError(`Brave Search had a problem (${res.status}). Try again.`);
  const body = (await res.json().catch(() => null)) as { web?: { results?: { title?: string; url?: string; description?: string }[] } } | null;
  return (body?.web?.results ?? [])
    .filter((r): r is { title: string; url: string; description?: string } => !!r.title && !!r.url && /^https?:\/\//.test(r.url))
    .map((r) => ({ title: stripTags(r.title), url: r.url, description: stripTags(r.description ?? "") }));
}

const PICK_SYSTEM = `You help someone choose recipes for a family recipe collection.
You get web search results. Pick up to 6 good, varied options that are each a single recipe page (skip lists, roundups, videos, shops and forum threads).
For each, copy the url exactly as given, give a clean title, the site name, and one sentence on what makes that version different. minutes is the total time if the result shows it, otherwise null.`;

/** Let the home PC's model choose the best of Brave's results. */
async function pickWithOllama(env: Env, s: AiSettings, query: string, results: BraveResult[]): Promise<FoundRecipe[]> {
  const list = results.map((r, i) => `${i + 1}. ${r.title}\n${r.url}\n${r.description}`).join("\n\n");
  const answer = await callOllama(env, s, { task: "find", system: PICK_SYSTEM, text: `The person wants: ${query}\n\nSearch results:\n\n${list}` }, FoundSchema);
  const known = new Set(results.map((r) => r.url));
  return answer.options
    .filter((o) => known.has(o.url))
    .map((o) => ({ title: o.title, url: o.url, site: o.site || hostOf(o.url), summary: o.summary, minutes: o.minutes ?? null }));
}

/** Brave's results as they come, for when no AI is available to choose. */
const plainResults = (results: BraveResult[]): FoundRecipe[] =>
  results.map((r) => ({ title: r.title, url: r.url, site: hostOf(r.url), summary: r.description, minutes: null }));

/** Which way recipe search can run with the current settings and keys. */
export function searchMode(env: Env, s: AiSettings): "ollama+brave" | "claude" | "brave" | null {
  const claudeOk = s.claudeEnabled && !!env.ANTHROPIC_API_KEY;
  const ollamaOk = s.ollamaEnabled && !!env.OLLAMA_URL && !!s.ollamaModel;
  if (ollamaOk && env.BRAVE_API_KEY) return "ollama+brave";
  if (claudeOk) return "claude";
  if (env.BRAVE_API_KEY) return "brave";
  return null;
}

/**
 * Search the web for recipes. With the home PC switched on and a Brave key,
 * Brave searches and the PC's model chooses; otherwise Claude's web search;
 * with no AI, Brave's results are listed as they are.
 */
export async function findRecipesOnline(env: Env, query: string): Promise<{ options: FoundRecipe[]; via: string }> {
  const s = await readAiSettings(env.DB);
  const mode = searchMode(env, s);
  if (!mode) {
    throw new AiError(
      s.claudeEnabled || s.ollamaEnabled ? "Searching isn't set up yet (needs Claude, or a Brave Search key). See Settings." : "Searching needs AI, which is turned off in Settings.",
      403
    );
  }
  if (mode === "claude") return { options: await searchWithClaude(env, query), via: "claude" };
  const results = await braveSearch(env, query);
  if (mode === "brave" || !results.length) return { options: dedupe(plainResults(results)), via: "brave" };
  try {
    const picked = await pickWithOllama(env, s, query, results);
    if (picked.length) return { options: dedupe(picked), via: "ollama" };
  } catch (e) {
    if (s.claudeEnabled && env.ANTHROPIC_API_KEY && s.fallbackToClaude) {
      console.warn("Ollama failed, falling back to Claude search:", (e as Error).message);
      return { options: await searchWithClaude(env, query), via: "claude" };
    }
    console.warn("Ollama failed, listing Brave results:", (e as Error).message);
  }
  return { options: dedupe(plainResults(results)), via: "brave" };
}
