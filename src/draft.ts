import type { RecipeInput } from "../shared/types";

/** A recipe handed from an "add" screen to the recipe form, to check before saving. */
let memory: Partial<RecipeInput> | null = null;
const KEY = "recipe-draft";

export function setDraft(d: Partial<RecipeInput>) {
  memory = d;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* storage unavailable: memory copy is enough */
  }
}

export function takeDraft(): Partial<RecipeInput> | null {
  let d = memory;
  try {
    const s = sessionStorage.getItem(KEY);
    if (s) d = JSON.parse(s) as Partial<RecipeInput>;
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  memory = null;
  return d;
}
