import { tidyReasons } from "../../shared/tidy";
import { Hono } from "hono";
import type { Env } from "../env";
import { saveRecipe, validateRecipe, ValidationError } from "../recipe-save";

export const recipes = new Hono<{ Bindings: Env }>();

const FODMAP = ["low", "moderate", "high"] as const;

/** GET /api/recipes?q=&tag=Keto&tag=Low%20FODMAP&fodmap=low */
recipes.get("/", async (c) => {
  const q = c.req.query("q")?.trim();
  const tags = c.req.queries("tag") ?? [];
  const fodmap = c.req.query("fodmap");

  const where: string[] = ["r.status = 'published'"];
  const params: unknown[] = [];

  if (q) {
    where.push(
      "(r.title LIKE ? OR EXISTS (SELECT 1 FROM recipe_ingredients ri WHERE ri.recipe_id = r.id AND ri.original_text LIKE ?))"
    );
    params.push(`%${q}%`, `%${q}%`);
  }
  for (const tag of tags) {
    where.push(
      "EXISTS (SELECT 1 FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id WHERE rt.recipe_id = r.id AND t.name = ? COLLATE NOCASE)"
    );
    params.push(tag);
  }
  if (fodmap && (FODMAP as readonly string[]).includes(fodmap)) {
    // "low" shows low only; "moderate" shows low + moderate.
    const allowed = FODMAP.slice(0, FODMAP.indexOf(fodmap as (typeof FODMAP)[number]) + 1);
    where.push(`r.fodmap_rating IN (${allowed.map(() => "?").join(",")})`);
    params.push(...allowed);
  }

  const sql = `
    SELECT r.id, r.title, r.summary, r.prep_minutes, r.cook_minutes, r.fodmap_rating,
           r.hero_photo_id, r.source_name, r.starred_at,
           (SELECT json_group_array(t.name) FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id
             WHERE rt.recipe_id = r.id) AS tags
    FROM recipes r
    WHERE ${where.join(" AND ")}
    ORDER BY r.title COLLATE NOCASE
    LIMIT 500`;
  const { results } = await c.env.DB.prepare(sql).bind(...params).all<Record<string, unknown>>();
  return c.json(
    results.map((r) => ({ ...r, tags: JSON.parse((r.tags as string | null) ?? "[]") }))
  );
});

/** GET /api/recipes/needs-tidy: recipes whose import left clutter or gaps, with why. */
recipes.get("/needs-tidy", async (c) => {
  const db = c.env.DB;
  const [r, ings, counts] = await db.batch([
    db.prepare("SELECT id, title, notes, source_url FROM recipes WHERE status = 'published' ORDER BY title COLLATE NOCASE"),
    db.prepare("SELECT recipe_id, original_text, quantity FROM recipe_ingredients"),
    db.prepare(
      `SELECT r.id, (SELECT COUNT(*) FROM steps s WHERE s.recipe_id = r.id) AS steps,
              (SELECT COUNT(*) FROM photos p WHERE p.recipe_id = r.id) AS photos FROM recipes r`
    )
  ]);
  const byRecipe = new Map<string, { original_text: string; quantity: number | null }[]>();
  for (const i of (ings?.results ?? []) as { recipe_id: string; original_text: string; quantity: number | null }[]) {
    byRecipe.set(i.recipe_id, [...(byRecipe.get(i.recipe_id) ?? []), i]);
  }
  const n = new Map(((counts?.results ?? []) as { id: string; steps: number; photos: number }[]).map((x) => [x.id, x]));
  const out = [];
  for (const rec of (r?.results ?? []) as { id: string; title: string; notes: string | null; source_url: string | null }[]) {
    const ingredients = byRecipe.get(rec.id) ?? [];
    const k = n.get(rec.id) ?? { steps: 0, photos: 0 };
    const reasons = tidyReasons({ notes: rec.notes, ingredients, steps: k.steps, photos: k.photos });
    if (reasons.length) out.push({ id: rec.id, title: rec.title, reasons, source_url: rec.source_url, ingredients: ingredients.length, steps: k.steps, photos: k.photos });
  }
  return c.json(out);
});

/** GET /api/recipes/import-keys: keys of recipes already imported, so the importer can skip them. */
recipes.get("/import-keys", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT import_key FROM recipes WHERE import_key IS NOT NULL").all<{
    import_key: string;
  }>();
  return c.json(results.map((r) => r.import_key));
});

/** GET /api/recipes/:id with ingredients, steps, tags and photos. */
recipes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  const recipe = await db.prepare("SELECT * FROM recipes WHERE id = ?").bind(id).first();
  if (!recipe) return c.json({ error: "Not found" }, 404);

  const [ingredients, steps, tags, photos] = await db.batch([
    db
      .prepare(
        `SELECT ri.*, i.name AS item_name, i.fodmap_rating AS item_fodmap
         FROM recipe_ingredients ri LEFT JOIN items i ON i.id = ri.item_id
         WHERE ri.recipe_id = ? ORDER BY ri.position`
      )
      .bind(id),
    db.prepare("SELECT * FROM steps WHERE recipe_id = ? ORDER BY position").bind(id),
    db
      .prepare(
        "SELECT t.name, t.kind FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id WHERE rt.recipe_id = ?"
      )
      .bind(id),
    db.prepare("SELECT id, kind, step_id, width, height FROM photos WHERE recipe_id = ?").bind(id)
  ]);

  return c.json({
    ...recipe,
    ingredients: ingredients?.results ?? [],
    steps: steps?.results ?? [],
    tags: tags?.results ?? [],
    photos: photos?.results ?? []
  });
});

async function readRecipe(c: { req: { json: () => Promise<unknown> } }) {
  const body = await c.req.json().catch(() => null);
  return validateRecipe(body);
}

/** POST /api/recipes: create a recipe. */
recipes.post("/", async (c) => {
  try {
    const input = await readRecipe(c);
    if (input.import_key) {
      const existing = await c.env.DB.prepare("SELECT id FROM recipes WHERE import_key = ?")
        .bind(input.import_key)
        .first<{ id: string }>();
      if (existing) return c.json({ id: existing.id, existing: true });
    }
    const id = crypto.randomUUID();
    await saveRecipe(c.env.DB, id, input, true);
    return c.json({ id }, 201);
  } catch (e) {
    if (e instanceof ValidationError) return c.json({ error: e.message }, 400);
    throw e;
  }
});

/** PUT /api/recipes/:id: replace a recipe's contents. */
recipes.put("/:id", async (c) => {
  const id = c.req.param("id");
  const exists = await c.env.DB.prepare("SELECT 1 FROM recipes WHERE id = ?").bind(id).first();
  if (!exists) return c.json({ error: "Not found" }, 404);
  try {
    const input = await readRecipe(c);
    await saveRecipe(c.env.DB, id, input, false);
    return c.json({ id });
  } catch (e) {
    if (e instanceof ValidationError) return c.json({ error: e.message }, 400);
    throw e;
  }
});

/** DELETE /api/recipes/:id: remove a recipe and its photos. */
/** PUT /api/recipes/:id/star { starred }: mark or unmark a recipe to make soon. */
recipes.put("/:id/star", async (c) => {
  const body = await c.req.json<{ starred?: unknown }>().catch(() => ({}) as { starred?: unknown });
  const starred = body.starred === true;
  const res = await c.env.DB.prepare(
    `UPDATE recipes SET starred_at = ${starred ? "strftime('%Y-%m-%dT%H:%M:%fZ','now')" : "NULL"} WHERE id = ?`
  )
    .bind(c.req.param("id"))
    .run();
  if (!res.meta.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true, starred });
});

recipes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const { results } = await c.env.DB.prepare("SELECT r2_key FROM photos WHERE recipe_id = ?")
    .bind(id)
    .all<{ r2_key: string }>();
  await c.env.DB.prepare("DELETE FROM recipes WHERE id = ?").bind(id).run();
  if (results.length) await c.env.PHOTOS.delete(results.map((r) => r.r2_key));
  return c.json({ ok: true });
});
