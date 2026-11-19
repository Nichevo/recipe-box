export type FodmapRating = "low" | "moderate" | "high";

export interface StepInput {
  text: string;
  photo_id?: string | null;
}

/** Body for creating or updating a recipe. */
export interface RecipeInput {
  title: string;
  summary?: string | null;
  servings?: number | null;
  prep_minutes?: number | null;
  cook_minutes?: number | null;
  source_url?: string | null;
  source_name?: string | null;
  notes?: string | null;
  /** Set by hand; null means "work it out from the ingredients". */
  fodmap_rating?: FodmapRating | null;
  hero_photo_id?: string | null;
  tags: string[];
  /** One ingredient per line; "Heading:" lines start a section. */
  ingredients_text: string;
  steps: StepInput[];
}
