import { Hono } from "hono";
import type { Env } from "../env";

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
           r.hero_photo_id, r.source_name,
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
