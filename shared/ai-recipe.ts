import { z } from "zod";

/** What every AI task returns: a recipe draft for the person to check in the form. */
export const RecipeDraftSchema = z.object({
  /** False when the photo isn't a readable recipe, or the request isn't for a recipe. */
  ok: z.boolean(),
  /** Short reason when ok is false. */
  problem: z.string().nullable(),
  title: z.string(),
  summary: z.string().nullable(),
  servings: z.number().nullable(),
  prep_minutes: z.number().nullable(),
  cook_minutes: z.number().nullable(),
  /** One ingredient per line, as written; a line ending in ":" starts a section. */
  ingredients: z.array(z.string()),
  steps: z.array(z.string()),
  notes: z.string().nullable(),
  /** Meal type, e.g. Breakfast, Main, Dessert, Bread, Snack, Starter, Side, Baking, Drink, Sauce. */
  meal: z.string().nullable(),
  cuisine: z.string().nullable(),
  /** Any of: Keto, Vegetarian, Vegan, Gluten free, Dairy free, Low FODMAP. */
  diets: z.array(z.string())
});

export type RecipeDraft = z.infer<typeof RecipeDraftSchema>;

export type AiTask = "scan" | "draft" | "pantry" | "find" | "tidy"
 "scan";

/** What the AI saw in a photo of the fridge or pantry. */
export const PantryScanSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      /** One of the known names given in the prompt, or null if it's something new. */
      known_name: z.string().nullable()
    })
  )
});
export type PantryScan = z.infer<typeof PantryScanSchema>;
