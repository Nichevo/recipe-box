import { Hono } from "hono";
import type { Env } from "../env";
import { parseRecipeHtml } from "../../shared/web-recipe";

export const webImport = new Hono<{ Bindings: Env }>();

const MAX_HTML = 5 * 1024 * 1024;

/**
 * POST /api/import/url { url }: fetch a recipe page and read the recipe from it.
 * Nothing is saved; the app shows the result in the recipe form to check first.
 */
webImport.post("/url", async (c) => {
  const body = await c.req.json<{ url?: unknown }>().catch(() => ({}) as { url?: unknown });
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!/^https?:\/\/[^\s]+$/i.test(url) || url.length > 2000) return c.json({ error: "That doesn't look like a web link" }, 400);

  const existing = await c.env.DB.prepare("SELECT id, title FROM recipes WHERE source_url = ? LIMIT 1")
    .bind(url)
    .first<{ id: string; title: string }>();

  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
      headers: {
        // Many recipe sites refuse requests that don't look like a browser.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en"
      }
    });
  } catch {
    return c.json({ error: "Couldn't reach that website" }, 502);
  }
  if (!res.ok) return c.json({ error: `The website answered with an error (${res.status})` }, 502);
  const type = res.headers.get("content-type") ?? "";
  if (!/html|xml/i.test(type)) return c.json({ error: "That link isn't a web page" }, 422);
  const html = await res.text();
  if (html.length > MAX_HTML) return c.json({ error: "That page is too large" }, 413);

  const recipe = parseRecipeHtml(html, res.url || url);
  return c.json({ recipe, existing: existing ?? null });
});
