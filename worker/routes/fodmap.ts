import { Hono } from "hono";
import { FodmapCheckSchema } from "../../shared/ai-recipe";
import type { FodmapGroup } from "../../shared/fodmap-guide";
import { askAi, AiError } from "../ai";
import type { Env } from "../env";
import { applyGuide, GROUPS, refreshRecipeRatings, setItemFodmap } from "../fodmap";

/** /api/fodmap: FODMAP ratings of the ingredients used in recipes. */
export const fodmap = new Hono<{ Bindings: Env }>();

interface ItemRow {
  id: string;
  name: string;
  fodmap_rating: "low" | "moderate" | "high" | null;
  fodmap_fructans: number;
  fodmap_gos: number;
  fodmap_lactose: number;
  fodmap_fructose: number;
  fodmap_polyols: number;
  fodmap_safe_serving: string | null;
  fodmap_swap: string | null;
  fodmap_source: string | null;
  recipes: number;
}

/** GET /api/fodmap/items: every ingredient used in a recipe, unrated ones first. Fills in from the guide first. */
fodmap.get("/items", async (c) => {
  if (await applyGuide(c.env.DB)) await refreshRecipeRatings(c.env.DB);
  const { results } = await c.env.DB.prepare(
    `SELECT i.id, i.name, i.fodmap_rating, i.fodmap_fructans, i.fodmap_gos, i.fodmap_lactose, i.fodmap_fructose, i.fodmap_polyols,
            i.fodmap_safe_serving, i.fodmap_swap, i.fodmap_source, COUNT(DISTINCT ri.recipe_id) AS recipes
     FROM items i JOIN recipe_ingredients ri ON ri.item_id = i.id GROUP BY i.id
     ORDER BY i.fodmap_rating IS NOT NULL, CASE i.fodmap_rating WHEN 'high' THEN 0 WHEN 'moderate' THEN 1 ELSE 2 END, recipes DESC, i.name`
  ).all<ItemRow>();
  return c.json(
    results.map((r) => ({
      id: r.id,
      name: r.name,
      rating: r.fodmap_rating,
      groups: GROUPS.filter((g) => r[`fodmap_${g}` as keyof ItemRow]),
      serving: r.fodmap_safe_serving,
      swap: r.fodmap_swap,
      source: r.fodmap_source,
      recipes: r.recipes
    }))
  );
});

/** PUT /api/fodmap/item/:id { rating, swap? }: set by hand. rating null clears it. */
fodmap.put("/item/:id", async (c) => {
  const body = await c.req.json<{ rating?: unknown; swap?: unknown }>().catch(() => ({}) as Record<string, unknown>);
  const rating = body.rating;
  if (rating !== null && rating !== "low" && rating !== "moderate" && rating !== "high") return c.json({ error: "Rating must be low, moderate or high" }, 400);
  const id = c.req.param("id");
  if (rating === null) {
    await c.env.DB.prepare("UPDATE items SET fodmap_rating = NULL, fodmap_source = 'manual' WHERE id = ?").bind(id).run();
  } else {
    const row = await c.env.DB.prepare("SELECT * FROM items WHERE id = ?").bind(id).first<ItemRow>();
    if (!row) return c.json({ error: "Not found" }, 404);
    const swap = typeof body.swap === "string" ? body.swap.trim().slice(0, 300) || null : row.fodmap_swap;
    await setItemFodmap(
      c.env.DB,
      id,
      { rating, groups: GROUPS.filter((g) => row[`fodmap_${g}` as keyof ItemRow]), serving: row.fodmap_safe_serving, swap },
      "manual"
    ).run();
  }
  await refreshRecipeRatings(c.env.DB);
  return c.json({ ok: true });
});

/** POST /api/fodmap/ai: ask the AI about ingredients that are still unrated (up to 80 at a time). */
fodmap.post("/ai", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT i.id, i.name FROM items i WHERE i.fodmap_rating IS NULL AND (i.fodmap_source IS NULL OR i.fodmap_source = 'guide')
       AND EXISTS (SELECT 1 FROM recipe_ingredients ri WHERE ri.item_id = i.id) ORDER BY i.name LIMIT 80`
  ).all<{ id: string; name: string }>();
  if (!results.length) return c.json({ checked: 0, rated: 0 });
  try {
    const { answer } = await askAi(
      c.env,
      {
        task: "fodmap",
        system: `You rate ingredients for a low FODMAP diet, using published low FODMAP guidance (Monash University style).
For each ingredient name (these come from recipes and may include quantities or extra words), give:
- rating at a typical recipe serving: low, moderate or high. Use unknown if it isn't a food, or you can't tell what it is.
- groups: which FODMAP groups make it moderate or high (fructans, gos, lactose, fructose, polyols); empty for low.
- safe_serving: a serving that is usually tolerated, if that helps (e.g. "¼ cup"), else null.
- swap: a low FODMAP swap for moderate or high items, else null.
Return one entry per name, with name copied exactly.`,
        text: results.map((r) => r.name).join("\n")
      },
      FodmapCheckSchema
    );
    const byName = new Map(results.map((r) => [r.name.toLowerCase(), r.id]));
    const stmts: D1PreparedStatement[] = [];
    for (const a of answer.items) {
      const id = byName.get(a.name.trim().toLowerCase());
      if (!id || a.rating === "unknown") continue;
      stmts.push(
        setItemFodmap(c.env.DB, id, { rating: a.rating, groups: a.groups as FodmapGroup[], serving: a.safe_serving, swap: a.swap }, "ai")
      );
    }
    // Items the AI couldn't rate are marked so they aren't sent again.
    const rated = new Set(answer.items.filter((a) => a.rating !== "unknown").map((a) => a.name.trim().toLowerCase()));
    for (const r of results) if (!rated.has(r.name.toLowerCase())) stmts.push(c.env.DB.prepare("UPDATE items SET fodmap_source = 'ai' WHERE id = ?").bind(r.id));
    for (let i = 0; i < stmts.length; i += 50) await c.env.DB.batch(stmts.slice(i, i + 50));
    await refreshRecipeRatings(c.env.DB);
    return c.json({ checked: results.length, rated: rated.size });
  } catch (e) {
    if (e instanceof AiError) return c.json({ error: e.message }, e.status);
    throw e;
  }
});
