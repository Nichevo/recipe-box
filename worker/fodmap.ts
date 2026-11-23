import { lookupFodmap, type FodmapGroup } from "../shared/fodmap-guide";
import type { FodmapRating } from "../shared/types";

export const GROUPS: FodmapGroup[] = ["fructans", "gos", "lactose", "fructose", "polyols"];

export interface FodmapFacts {
  rating: FodmapRating;
  groups: FodmapGroup[];
  serving: string | null;
  swap: string | null;
}

/** Statement that stores FODMAP facts on an item. */
export function setItemFodmap(db: D1Database, id: string, f: FodmapFacts, source: "guide" | "ai" | "manual") {
  return db
    .prepare(
      `UPDATE items SET fodmap_rating = ?, fodmap_fructans = ?, fodmap_gos = ?, fodmap_lactose = ?, fodmap_fructose = ?, fodmap_polyols = ?,
         fodmap_safe_serving = ?, fodmap_swap = ?, fodmap_source = ? WHERE id = ?`
    )
    .bind(f.rating, ...GROUPS.map((g) => (f.groups.includes(g) ? 1 : 0)), f.serving, f.swap, source, id);
}

/** Built-in guide facts for an ingredient name, if the guide knows it. */
export function guideFacts(name: string): FodmapFacts | null {
  const g = lookupFodmap(name);
  return g ? { rating: g.rating, groups: g.groups, serving: g.serving ?? null, swap: g.swap ?? null } : null;
}

/** Fill in ingredients nobody has rated yet from the built-in guide. Returns how many were filled. */
export async function applyGuide(db: D1Database): Promise<number> {
  const { results } = await db.prepare("SELECT id, name FROM items WHERE fodmap_source IS NULL AND fodmap_rating IS NULL").all<{ id: string; name: string }>();
  const stmts = results.flatMap((i) => {
    const f = guideFacts(i.name);
    return f ? [setItemFodmap(db, i.id, f, "guide")] : [];
  });
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  return stmts.length;
}

/** Recompute each recipe's FODMAP rating from its ingredients, unless it was set by hand. */
export async function refreshRecipeRatings(db: D1Database) {
  await db
    .prepare(
      `UPDATE recipes SET fodmap_rating = (
         SELECT CASE MAX(CASE i.fodmap_rating WHEN 'high' THEN 3 WHEN 'moderate' THEN 2 WHEN 'low' THEN 1 END)
           WHEN 3 THEN 'high' WHEN 2 THEN 'moderate' WHEN 1 THEN 'low' END
         FROM recipe_ingredients ri JOIN items i ON i.id = ri.item_id WHERE ri.recipe_id = recipes.id)
       WHERE fodmap_override = 0`
    )
    .run();
}
