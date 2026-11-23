import { Hono } from "hono";
import { addDays, combineShopping, type PlannedIngredient } from "../../shared/plan";
import type { Env } from "../env";
import { kitchenFor, whatCanIMake } from "../kitchen";

/** /api/plan: the weekly meal plan, its shopping list, and "what can I make?". */
export const plan = new Hono<{ Bindings: Env }>();

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const IN_KITCHEN = new Set(["have", "likely", "staple"]);

interface PlanEntry {
  id: string;
  day: string;
  recipe_id: string;
  servings: number | null;
  title: string;
  hero_photo_id: string | null;
  recipe_servings: number | null;
}

function range(c: { req: { query: (k: string) => string | undefined } }) {
  const from = c.req.query("from") ?? "";
  const days = Math.min(Math.max(Number(c.req.query("days") ?? 7) || 7, 1), 31);
  return DAY.test(from) ? { from, to: addDays(from, days - 1) } : null;
}

async function entries(db: D1Database, from: string, to: string) {
  const { results } = await db
    .prepare(
      `SELECT m.id, m.day, m.recipe_id, m.servings, r.title, r.hero_photo_id, r.servings AS recipe_servings
       FROM meal_plan m JOIN recipes r ON r.id = m.recipe_id WHERE m.day BETWEEN ? AND ? ORDER BY m.day, m.created_at`
    )
    .bind(from, to)
    .all<PlanEntry>();
  return results;
}

/** GET /api/plan?from=YYYY-MM-DD&days=7 */
plan.get("/", async (c) => {
  const r = range(c);
  if (!r) return c.json({ error: "Expected from=YYYY-MM-DD" }, 400);
  return c.json(await entries(c.env.DB, r.from, r.to));
});

/** GET /api/plan/suggest: recipes ranked by how much is already in the kitchen. */
plan.get("/suggest", async (c) => c.json((await whatCanIMake(c.env.DB)).slice(0, 40)));

/** The ingredients still needed for the planned meals, combined. */
async function neededLines(db: D1Database, from: string, to: string) {
  const list = await entries(db, from, to);
  const kitchen = await kitchenFor(db, [...new Set(list.map((e) => e.recipe_id))]);
  const items: PlannedIngredient[] = [];
  for (const e of list) {
    const factor = e.servings && e.recipe_servings ? e.servings / e.recipe_servings : 1;
    for (const { row, k } of kitchen.get(e.recipe_id) ?? []) {
      if (!k.name || IN_KITCHEN.has(k.state)) continue;
      const label = k.grocery_item ?? k.name;
      items.push({
        key: label,
        label,
        metric_amount: row.metric_amount,
        metric_unit: row.metric_unit,
        quantity: row.quantity,
        unit: row.unit,
        original_text: row.original_text,
        factor,
        recipe: e.title
      });
    }
  }
  return combineShopping(items);
}

/** GET /api/plan/shopping?from&days: what to buy for the planned meals (not yet added). */
plan.get("/shopping", async (c) => {
  const r = range(c);
  if (!r) return c.json({ error: "Expected from=YYYY-MM-DD" }, 400);
  return c.json(await neededLines(c.env.DB, r.from, r.to));
});

/** POST /api/plan/shopping?from&days: add what's needed to the shopping list. */
plan.post("/shopping", async (c) => {
  const r = range(c);
  if (!r) return c.json({ error: "Expected from=YYYY-MM-DD" }, 400);
  const lines = await neededLines(c.env.DB, r.from, r.to);
  const { results: open } = await c.env.DB.prepare("SELECT lower(coalesce(name, text)) AS k FROM shopping_items WHERE done = 0").all<{ k: string }>();
  const have = new Set(open.map((o) => o.k));
  const stmts = lines
    .filter((l) => !have.has(l.key))
    .map((l) => c.env.DB.prepare("INSERT INTO shopping_items (id, text, name) VALUES (?, ?, ?)").bind(crypto.randomUUID(), l.text, l.key));
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ added: stmts.length, total: lines.length });
});

function readServings(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return typeof v === "number" && v > 0 && v <= 100 ? v : undefined;
}

/** POST /api/plan { day, recipe_id, servings? } */
plan.post("/", async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  if (typeof body.day !== "string" || !DAY.test(body.day)) return c.json({ error: "Pick a day" }, 400);
  if (typeof body.recipe_id !== "string") return c.json({ error: "Pick a recipe" }, 400);
  const exists = await c.env.DB.prepare("SELECT id FROM recipes WHERE id = ?").bind(body.recipe_id).first();
  if (!exists) return c.json({ error: "Recipe not found" }, 404);
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO meal_plan (id, day, recipe_id, servings) VALUES (?, ?, ?, ?)")
    .bind(id, body.day, body.recipe_id, readServings(body.servings) ?? null)
    .run();
  return c.json({ id });
});

/** PUT /api/plan/:id { day?, servings? } */
plan.put("/:id", async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const day = typeof body.day === "string" && DAY.test(body.day) ? body.day : null;
  const servings = readServings(body.servings);
  const row = await c.env.DB.prepare(
    `UPDATE meal_plan SET day = coalesce(?, day), servings = CASE WHEN ? THEN ? ELSE servings END WHERE id = ? RETURNING id`
  )
    .bind(day, servings !== undefined ? 1 : 0, servings ?? null, c.req.param("id"))
    .first();
  return row ? c.json({ ok: true }) : c.json({ error: "Not found" }, 404);
});

/** DELETE /api/plan/:id */
plan.delete("/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM meal_plan WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});
