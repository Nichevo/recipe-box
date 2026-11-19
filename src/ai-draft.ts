import type { RecipeDraft } from "../shared/ai-recipe";
import type { RecipeInput } from "../shared/types";
import type { Tag } from "./api";

/** Turn an AI recipe draft into form values, keeping only tags the app already knows. */
export function draftToInput(d: RecipeDraft, known: Tag[]): Partial<RecipeInput> {
  const byName = new Map(known.filter((t) => t.kind !== "custom").map((t) => [t.name.toLowerCase(), t.name]));
  const tags = [d.meal, d.cuisine, ...d.diets]
    .map((n) => (n ? byName.get(n.trim().toLowerCase()) : undefined))
    .filter((n): n is string => !!n);
  const positive = (n: number | null) => (n != null && n > 0 ? Math.round(n * 100) / 100 : null);
  return {
    title: d.title.trim(),
    summary: d.summary?.trim() || null,
    servings: positive(d.servings),
    prep_minutes: positive(d.prep_minutes) && Math.round(d.prep_minutes!),
    cook_minutes: positive(d.cook_minutes) && Math.round(d.cook_minutes!),
    notes: d.notes?.trim() || null,
    tags: [...new Set(tags)],
    // A blank line before each section heading keeps the ingredient list readable.
    ingredients_text: d.ingredients
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l, i) => (i > 0 && /:$/.test(l) ? `\n${l}` : l))
      .join("\n"),
    steps: d.steps.map((s) => s.trim()).filter(Boolean).map((text) => ({ text }))
  };
}
