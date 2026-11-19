import { parseIngredientBlock } from "../shared/ingredients";
import type { FodmapRating, RecipeInput } from "../shared/types";

const FODMAP_ORDER: FodmapRating[] = ["low", "moderate", "high"];

export class ValidationError extends Error {}

const str = (v: unknown, max: number): string | null => {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw new ValidationError("Expected text");
  const t = v.trim();
  if (t.length > max) throw new ValidationError(`Text longer than ${max} characters`);
  return t || null;
};

const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100000) throw new ValidationError("Invalid number");
  return n;
};

/** Validate and normalise an incoming recipe body. */
export function validateRecipe(body: unknown): RecipeInput {
  if (!body || typeof body !== "object") throw new ValidationError("Expected a JSON object");
  const b = body as Record<string, unknown>;
  const title = str(b.title, 200);
  if (!title) throw new ValidationError("A title is required");
  const fodmap = b.fodmap_rating ?? null;
  if (fodmap !== null && !FODMAP_ORDER.includes(fodmap as FodmapRating)) {
    throw new ValidationError("Invalid FODMAP rating");
  }
  const sourceUrl = str(b.source_url, 2000);
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) throw new ValidationError("Source must be a web link");
  const tags = Array.isArray(b.tags) ? b.tags.map((t) => str(t, 60)).filter((t): t is string => !!t) : [];
  const steps = Array.isArray(b.steps)
    ? b.steps
        .map((s) => {
          const o = (s ?? {}) as Record<string, unknown>;
          return { text: str(o.text, 5000) ?? "", photo_id: str(o.photo_id, 64) };
        })
        .filter((s) => s.text || s.photo_id)
    : [];
  return {
    title,
    summary: str(b.summary, 2000),
    servings: num(b.servings),
    prep_minutes: num(b.prep_minutes),
    cook_minutes: num(b.cook_minutes),
    source_url: sourceUrl,
    source_name: str(b.source_name, 200),
    notes: str(b.notes, 10000),
    fodmap_rating: fodmap as FodmapRating | null,
    hero_photo_id: str(b.hero_photo_id, 64),
    tags: [...new Set(tags.map((t) => t.toLowerCase()))].map((l) => tags.find((t) => t.toLowerCase() === l)!),
    ingredients_text: str(b.ingredients_text, 20000) ?? "",
    steps
  };
}

/** Find an item by name or alias, creating it if new. Returns id and FODMAP rating. */
async function resolveItem(db: D1Database, name: string) {
  const found = await db
    .prepare(
      `SELECT id, fodmap_rating FROM items WHERE name = ?1 COLLATE NOCASE
       UNION ALL
       SELECT i.id, i.fodmap_rating FROM item_aliases a JOIN items i ON i.id = a.item_id WHERE a.alias = ?1 COLLATE NOCASE
       LIMIT 1`
    )
    .bind(name)
    .first<{ id: string; fodmap_rating: FodmapRating | null }>();
  if (found) return found;
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO items (id, name) VALUES (?, ?)").bind(id, name).run();
  return { id, fodmap_rating: null };
}

async function resolveTag(db: D1Database, name: string): Promise<string> {
  const found = await db.prepare("SELECT id FROM tags WHERE name = ? COLLATE NOCASE").bind(name).first<{ id: string }>();
  if (found) return found.id;
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO tags (id, name, kind) VALUES (?, ?, 'custom')").bind(id, name).run();
  return id;
}

/** Insert or replace a recipe with its ingredients, steps, tags and photo links. */
export async function saveRecipe(db: D1Database, id: string, input: RecipeInput, isNew: boolean) {
  const parsed = parseIngredientBlock(input.ingredients_text);
  const items: ({ id: string; fodmap_rating: FodmapRating | null } | null)[] = [];
  for (const p of parsed) items.push(p.name ? await resolveItem(db, p.name.toLowerCase()) : null);
  const tagIds: string[] = [];
  for (const t of input.tags) tagIds.push(await resolveTag(db, t));

  // A hand-set rating wins; otherwise the highest-rated ingredient decides.
  const override = input.fodmap_rating != null;
  const worst = items
    .map((i) => (i?.fodmap_rating ? FODMAP_ORDER.indexOf(i.fodmap_rating) : -1))
    .reduce((a, b) => Math.max(a, b), -1);
  const fodmap = override ? input.fodmap_rating! : worst >= 0 ? FODMAP_ORDER[worst]! : null;

  const fields = [
    input.title, input.summary, input.servings, input.prep_minutes, input.cook_minutes,
    input.source_url, input.source_name, input.hero_photo_id, fodmap, override ? 1 : 0, input.notes
  ];
  const stmts: D1PreparedStatement[] = [];
  if (isNew) {
    stmts.push(
      db.prepare(
        `INSERT INTO recipes (id, title, summary, servings, prep_minutes, cook_minutes, source_url, source_name,
           hero_photo_id, fodmap_rating, fodmap_override, notes, source_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')`
      ).bind(id, ...fields)
    );
  } else {
    stmts.push(
      db.prepare(
        `UPDATE recipes SET title = ?, summary = ?, servings = ?, prep_minutes = ?, cook_minutes = ?, source_url = ?,
           source_name = ?, hero_photo_id = ?, fodmap_rating = ?, fodmap_override = ?, notes = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?`
      ).bind(...fields, id),
      db.prepare("DELETE FROM recipe_ingredients WHERE recipe_id = ?").bind(id),
      db.prepare("DELETE FROM steps WHERE recipe_id = ?").bind(id),
      db.prepare("DELETE FROM recipe_tags WHERE recipe_id = ?").bind(id)
    );
  }

  parsed.forEach((p, i) => {
    stmts.push(
      db.prepare(
        `INSERT INTO recipe_ingredients (id, recipe_id, position, section, item_id, quantity, quantity_max, unit,
           metric_amount, metric_unit, preparation, original_text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(), id, i, p.section, items[i]?.id ?? null, p.quantity, p.quantityMax, p.unit,
        p.metricAmount, p.metricUnit, p.preparation, p.originalText
      )
    );
  });
  input.steps.forEach((s, i) => {
    stmts.push(
      db.prepare("INSERT INTO steps (id, recipe_id, position, text, photo_id) VALUES (?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), id, i, s.text, s.photo_id ?? null)
    );
  });
  for (const tagId of tagIds) {
    stmts.push(db.prepare("INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)").bind(id, tagId));
  }
  // Attach photos uploaded while editing to this recipe.
  const photoIds = [input.hero_photo_id, ...input.steps.map((s) => s.photo_id)].filter((p): p is string => !!p);
  for (const pid of photoIds) {
    stmts.push(db.prepare("UPDATE photos SET recipe_id = ? WHERE id = ? AND (recipe_id IS NULL OR recipe_id = ?)").bind(id, pid, id));
  }
  await db.batch(stmts);
}
