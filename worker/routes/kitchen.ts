import { Hono } from "hono";
import { PantryScanSchema } from "../../shared/ai-recipe";
import { askAi, AiError, type AiImage } from "../ai";
import type { Env } from "../env";
import { groceryStatus, matchItems, syncChunk } from "../grocery-sync";
import { pantryList, recipeKitchen } from "../kitchen";

/** /api/grocery: the grocery sheet sync. */
export const grocery = new Hono<{ Bindings: Env }>();

grocery.get("/status", async (c) => c.json(await groceryStatus(c.env)));

/** POST /api/grocery/sync { from? }: sync one chunk. The app calls again with `next` until done. */
grocery.post("/sync", async (c) => {
  const body = await c.req.json<{ from?: unknown }>().catch(() => ({}) as { from?: unknown });
  const from = typeof body.from === "number" && body.from >= 2 ? body.from : 2;
  try {
    return c.json(await syncChunk(c.env, from));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

/** GET /api/grocery/items: grocery item names, most recently bought first (for linking). */
grocery.get("/items", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT item, category, MAX(date) AS last FROM purchases GROUP BY item COLLATE NOCASE ORDER BY last DESC"
  ).all<{ item: string; category: string | null; last: string }>();
  return c.json(results);
});

/** GET /api/grocery/links: ingredients used in recipes and the grocery item each is bought as. */
grocery.get("/links", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT i.name, i.grocery_item, i.grocery_item_manual AS manual, COUNT(DISTINCT ri.recipe_id) AS recipes
     FROM items i JOIN recipe_ingredients ri ON ri.item_id = i.id GROUP BY i.id ORDER BY recipes DESC, i.name`
  ).all();
  return c.json(results);
});

/** PUT /api/grocery/link { ingredient, grocery_item }: say what an ingredient is bought as (null = not bought). */
grocery.put("/link", async (c) => {
  const body = await c.req.json<{ ingredient?: unknown; grocery_item?: unknown }>().catch(() => ({}) as Record<string, unknown>);
  if (typeof body.ingredient !== "string" || !body.ingredient.trim()) return c.json({ error: "Expected an ingredient" }, 400);
  if (body.grocery_item !== null && body.grocery_item !== "auto" && (typeof body.grocery_item !== "string" || body.grocery_item.length > 100)) {
    return c.json({ error: "Expected a grocery item" }, 400);
  }
  const auto = body.grocery_item === "auto";
  const res = await c.env.DB.prepare("UPDATE items SET grocery_item = ?, grocery_item_manual = ? WHERE name = ? COLLATE NOCASE RETURNING id")
    .bind(auto ? null : body.grocery_item, auto ? 0 : 1, body.ingredient.trim())
    .first<{ id: string }>();
  if (!res) return c.json({ error: "Not found" }, 404);
  if (auto) await matchItems(c.env.DB, [res.id]);
  return c.json({ ok: true });
});

/** /api/pantry: what's in the kitchen. */
export const pantry = new Hono<{ Bindings: Env }>();

pantry.get("/", async (c) => c.json(await pantryList(c.env.DB)));

/** GET /api/pantry/recipe/:id: have/need and cost per ingredient. */
pantry.get("/recipe/:id", async (c) => c.json(await recipeKitchen(c.env.DB, c.req.param("id"))));

const STATUSES = ["have", "out", "staple"];

/** PUT /api/pantry { items: [{ name, status }], source? }. status null forgets the hand-set entry. */
pantry.put("/", async (c) => {
  const body = await c.req.json<{ items?: unknown; source?: unknown }>().catch(() => null);
  const items = Array.isArray(body?.items) ? (body!.items as { name?: unknown; status?: unknown }[]) : null;
  if (!items || items.length > 200) return c.json({ error: "Expected a list of items" }, 400);
  const source = body?.source === "photo" ? "photo" : "manual";
  const stmts: D1PreparedStatement[] = [];
  for (const it of items) {
    const name = typeof it.name === "string" ? it.name.trim() : "";
    if (!name || name.length > 100) return c.json({ error: "Each item needs a name" }, 400);
    if (it.status === null) {
      stmts.push(c.env.DB.prepare("DELETE FROM pantry WHERE name = ?").bind(name));
    } else if (typeof it.status === "string" && STATUSES.includes(it.status)) {
      stmts.push(
        c.env.DB.prepare(
          `INSERT INTO pantry (name, status, source, updated_at) VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
           ON CONFLICT(name) DO UPDATE SET status = excluded.status, source = excluded.source, updated_at = excluded.updated_at`
        ).bind(name, it.status, source)
      );
    } else {
      return c.json({ error: "Status must be have, out or staple" }, 400);
    }
  }
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

const AI_TYPES = ["image/jpeg", "image/png", "image/webp"];

function toBase64(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * POST /api/pantry/scan (multipart "file" photos of the fridge or cupboard).
 * Returns what the AI sees, matched to names the app already knows. Nothing is
 * saved until the person confirms.
 */
pantry.post("/scan", async (c) => {
  const form = await c.req.formData().catch(() => null);
  const files = (form?.getAll("file") ?? []).filter((f): f is File => typeof f !== "string");
  if (!files.length || files.length > 4) return c.json({ error: "Add 1 to 4 photos" }, 400);
  const images: AiImage[] = [];
  for (const f of files) {
    if (!AI_TYPES.includes(f.type) || f.size > 8 * 1024 * 1024) return c.json({ error: "Photos must be JPEG, PNG or WebP" }, 400);
    images.push({ mediaType: f.type as AiImage["mediaType"], base64: toBase64(await f.arrayBuffer()) });
  }
  const known = (await pantryList(c.env.DB)).map((p) => p.name);
  const { results: ingredients } = await c.env.DB.prepare(
    "SELECT DISTINCT i.name FROM items i JOIN recipe_ingredients ri ON ri.item_id = i.id LIMIT 600"
  ).all<{ name: string }>();
  const names = [...new Set([...known, ...ingredients.map((i) => i.name)])];
  try {
    const { answer, provider } = await askAi(
      c.env,
      {
        task: "pantry",
        system: `You look at photos of a home fridge, freezer or pantry shelf and list the food you can identify.
List each distinct food once, in plain everyday words ("milk", "feta", "baby spinach"), not brand names. Skip things you can't identify with reasonable confidence, non-food items and empty containers.
For each, set known_name to the matching name from this list of names the household already uses (copy it exactly), or null if nothing in the list is the same food:
${names.join("; ")}`,
        text: `What food can you see in ${images.length > 1 ? "these photos" : "this photo"}?`,
        images
      },
      PantryScanSchema
    );
    const valid = new Set(names.map((n) => n.toLowerCase()));
    const items = answer.items.map((i) => ({
      name: i.name.trim(),
      known_name: i.known_name && valid.has(i.known_name.toLowerCase()) ? i.known_name : null
    }));
    return c.json({ items, provider });
  } catch (e) {
    if (e instanceof AiError) return c.json({ error: e.message }, e.status);
    throw e;
  }
});

/** /api/shopping: the shopping list. */
export const shopping = new Hono<{ Bindings: Env }>();

shopping.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.text, s.name, s.done, s.recipe_id, r.title AS recipe_title FROM shopping_items s
     LEFT JOIN recipes r ON r.id = s.recipe_id ORDER BY s.done, s.created_at`
  ).all();
  return c.json(results);
});

/** POST /api/shopping { items: [{ text, name?, recipe_id? }] }. Skips things already on the list. */
shopping.post("/", async (c) => {
  const body = await c.req.json<{ items?: unknown }>().catch(() => null);
  const items = Array.isArray(body?.items) ? (body!.items as Record<string, unknown>[]) : null;
  if (!items || !items.length || items.length > 100) return c.json({ error: "Expected a list of items" }, 400);
  const { results: open } = await c.env.DB.prepare("SELECT lower(coalesce(name, text)) AS k FROM shopping_items WHERE done = 0").all<{ k: string }>();
  const have = new Set(open.map((o) => o.k));
  const stmts: D1PreparedStatement[] = [];
  for (const it of items) {
    const text = typeof it.text === "string" ? it.text.trim().slice(0, 300) : "";
    if (!text) continue;
    const name = typeof it.name === "string" ? it.name.trim().slice(0, 100) || null : null;
    const key = (name ?? text).toLowerCase();
    if (have.has(key)) continue;
    have.add(key);
    const recipeId = typeof it.recipe_id === "string" ? it.recipe_id : null;
    stmts.push(
      c.env.DB.prepare("INSERT INTO shopping_items (id, text, name, recipe_id) VALUES (?, ?, ?, (SELECT id FROM recipes WHERE id = ?))").bind(
        crypto.randomUUID(), text, name, recipeId
      )
    );
  }
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ added: stmts.length });
});

/** PUT /api/shopping/:id { done }: tick an item. Ticking also marks it as in the pantry. */
shopping.put("/:id", async (c) => {
  const body = await c.req.json<{ done?: unknown }>().catch(() => ({}) as { done?: unknown });
  const done = body.done === true;
  const row = await c.env.DB.prepare("UPDATE shopping_items SET done = ? WHERE id = ? RETURNING name").bind(done ? 1 : 0, c.req.param("id")).first<{ name: string | null }>();
  if (!row) return c.json({ error: "Not found" }, 404);
  if (done && row.name) {
    await c.env.DB.prepare(
      `INSERT INTO pantry (name, status, source) VALUES (?, 'have', 'manual')
       ON CONFLICT(name) DO UPDATE SET status = CASE WHEN pantry.status = 'staple' THEN 'staple' ELSE 'have' END,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`
    ).bind(row.name).run();
  }
  return c.json({ ok: true });
});

shopping.delete("/done", async (c) => {
  await c.env.DB.prepare("DELETE FROM shopping_items WHERE done = 1").run();
  return c.json({ ok: true });
});

shopping.delete("/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM shopping_items WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});
