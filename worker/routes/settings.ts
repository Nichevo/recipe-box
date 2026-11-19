import { Hono } from "hono";
import type { Env } from "../env";

export const settings = new Hono<{ Bindings: Env }>();

/** Only these keys can be read or changed from the app. */
const EDITABLE: Record<string, (v: string) => boolean> = {
  "ai.claude_enabled": (v) => v === "true" || v === "false",
  "ai.ollama_enabled": (v) => v === "true" || v === "false",
  "ai.fallback_to_claude": (v) => v === "true" || v === "false",
  "units.display": (v) => ["as_written", "metric", "imperial"].includes(v)
};

settings.get("/", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT key, value FROM settings").all<{
    key: string;
    value: string;
  }>();
  return c.json(
    Object.fromEntries(results.filter((r) => r.key in EDITABLE).map((r) => [r.key, r.value]))
  );
});

settings.put("/", async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || typeof body !== "object") return c.json({ error: "Expected a JSON object" }, 400);

  const updates = Object.entries(body);
  for (const [key, value] of updates) {
    const valid = EDITABLE[key];
    if (!valid || typeof value !== "string" || !valid(value)) {
      return c.json({ error: `Invalid setting: ${key}` }, 400);
    }
  }
  await c.env.DB.batch(
    updates.map(([key, value]) =>
      c.env.DB.prepare(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      ).bind(key, value as string)
    )
  );
  return c.json({ ok: true });
});
