import { ingredientCost, pantryState, type PantryState, type PriceInfo } from "../shared/grocery";

interface LastBought {
  date: string;
  category: string | null;
}

const lower = (s: string) => s.toLowerCase();

async function inChunks<T>(names: string[], run: (part: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < names.length; i += 90) out.push(...(await run(names.slice(i, i + 90))));
  return out;
}
const marks = (n: number) => Array(n).fill("?").join(",");

/** When each grocery item was last bought. */
export async function lastBought(db: D1Database, names: string[]): Promise<Map<string, LastBought>> {
  const rows = await inChunks(names, async (part) =>
    (
      await db
        .prepare(
          `SELECT item, MAX(date) AS date, category FROM purchases WHERE item IN (${marks(part.length)}) GROUP BY item COLLATE NOCASE`
        )
        .bind(...part)
        .all<{ item: string; date: string; category: string | null }>()
    ).results
  );
  return new Map(rows.map((r) => [lower(r.item), { date: r.date, category: r.category }]));
}

/** The latest price per g, ml or item for each grocery item. */
export async function latestPrices(db: D1Database, names: string[]): Promise<Map<string, PriceInfo>> {
  const rows = await inChunks(names, async (part) =>
    (
      await db
        .prepare(
          `SELECT p.item, p.total, p.base_amount, p.base_unit FROM purchases p
           WHERE p.item IN (${marks(part.length)}) AND p.base_amount > 0 AND p.total > 0
             AND p.sheet_row = (SELECT q.sheet_row FROM purchases q WHERE q.item = p.item COLLATE NOCASE AND q.base_amount > 0 AND q.total > 0
                                ORDER BY q.date DESC, q.sheet_row DESC LIMIT 1)`
        )
        .bind(...part)
        .all<{ item: string; total: number; base_amount: number; base_unit: "g" | "ml" | "each" }>()
    ).results
  );
  return new Map(rows.map((r) => [lower(r.item), { unitPrice: r.total / r.base_amount, unit: r.base_unit }]));
}

export async function pantryRows(db: D1Database, names?: string[]) {
  const rows = names
    ? await inChunks(names, async (part) =>
        (
          await db
            .prepare(`SELECT name, status, source, updated_at FROM pantry WHERE name IN (${marks(part.length)})`)
            .bind(...part)
            .all<{ name: string; status: "have" | "out" | "staple"; source: string; updated_at: string }>()
        ).results
      )
    : (await db.prepare("SELECT name, status, source, updated_at FROM pantry").all<{ name: string; status: "have" | "out" | "staple"; source: string; updated_at: string }>())
        .results;
  return new Map(rows.map((r) => [lower(r.name), r]));
}

export interface IngredientKitchen {
  id: string;
  name: string | null;
  grocery_item: string | null;
  state: PantryState;
  cost: number | null;
}

/** Have/need and cost for each ingredient of a recipe. */
export async function recipeKitchen(db: D1Database, recipeId: string) {
  const { results: ings } = await db
    .prepare(
      `SELECT ri.id, ri.quantity, ri.unit, ri.metric_amount, ri.metric_unit, i.name, i.grocery_item, i.shelf_life_days
       FROM recipe_ingredients ri LEFT JOIN items i ON i.id = ri.item_id WHERE ri.recipe_id = ? ORDER BY ri.position`
    )
    .bind(recipeId)
    .all<{
      id: string; quantity: number | null; unit: string | null; metric_amount: number | null; metric_unit: string | null;
      name: string | null; grocery_item: string | null; shelf_life_days: number | null;
    }>();
  const grocery = [...new Set(ings.flatMap((i) => (i.grocery_item ? [i.grocery_item] : [])))];
  const names = [...new Set(ings.flatMap((i) => [i.name, i.grocery_item].filter((n): n is string => !!n)))];
  const [bought, prices, pantry] = await Promise.all([lastBought(db, grocery), latestPrices(db, grocery), pantryRows(db, names)]);

  const out: IngredientKitchen[] = ings.map((i) => {
    if (!i.name) return { id: i.id, name: null, grocery_item: null, state: "unknown", cost: null };
    const g = i.grocery_item ? lower(i.grocery_item) : null;
    // A hand-set entry for either the ingredient or its grocery item; the newer one wins.
    const manual = [pantry.get(lower(i.name)), g ? pantry.get(g) : undefined]
      .filter((m): m is NonNullable<typeof m> => !!m)
      .sort((a, b) => (a.status === "staple" ? -1 : b.status === "staple" ? 1 : b.updated_at.localeCompare(a.updated_at)))[0];
    const state = pantryState({
      manual: manual ? { status: manual.status, at: manual.updated_at } : null,
      lastBought: g ? (bought.get(g) ?? null) : null,
      shelfLife: i.shelf_life_days
    });
    const price = g ? prices.get(g) : undefined;
    const cost = price ? ingredientCost(i, price) : null;
    return { id: i.id, name: i.name, grocery_item: i.grocery_item, state, cost: cost !== null ? Math.round(cost * 100) / 100 : null };
  });
  const priced = out.filter((o) => o.cost !== null);
  return {
    ingredients: out,
    cost: priced.length ? Math.round(priced.reduce((a, o) => a + o.cost!, 0) * 100) / 100 : null,
    priced: priced.length,
    total: out.filter((o) => o.name).length
  };
}

/** Everything worth showing in the pantry: recent purchases plus anything set by hand. */
export async function pantryList(db: D1Database) {
  const { results: recent } = await db
    .prepare(
      `SELECT item, MAX(date) AS date, category FROM purchases WHERE date >= date('now', '-120 days')
       GROUP BY item COLLATE NOCASE`
    )
    .all<{ item: string; date: string; category: string | null }>();
  const pantry = await pantryRows(db);
  const byName = new Map<string, { name: string; category: string | null; lastBought: string | null }>();
  for (const r of recent) byName.set(lower(r.item), { name: r.item, category: r.category, lastBought: r.date });
  const extra = [...pantry.values()].filter((p) => !byName.has(lower(p.name))).map((p) => p.name);
  const older = extra.length ? await lastBought(db, extra) : new Map<string, LastBought>();
  for (const n of extra) {
    const b = older.get(lower(n));
    byName.set(lower(n), { name: n, category: b?.category ?? null, lastBought: b?.date ?? null });
  }
  return [...byName.entries()]
    .map(([key, e]) => {
      const m = pantry.get(key);
      return {
        ...e,
        state: pantryState({
          manual: m ? { status: m.status, at: m.updated_at } : null,
          lastBought: e.lastBought ? { date: e.lastBought, category: e.category } : null
        }),
        manual: m?.status ?? null,
        source: m?.source ?? null
      };
    })
    .sort((a, b) => (a.category ?? "~").localeCompare(b.category ?? "~") || a.name.localeCompare(b.name));
}
