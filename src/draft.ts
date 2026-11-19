import type { RecipeInput } from "../shared/types";

/**
 * A recipe handed from an "add" screen to the recipe form, to check before
 * saving. With for_id, it fills in an existing recipe instead of a new one.
 */
export type Draft = Partial<RecipeInput> & { for_id?: string };
let memory: Draft | null = null;
const KEY = "recipe-draft";

export function setDraft(d: Draft) {
  memory = d;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* storage unavailable: memory copy is enough */
  }
}

export function takeDraft(forId?: string): Draft | null {
  let d = memory;
  try {
    const s = sessionStorage.getItem(KEY);
    if (s) d = JSON.parse(s) as Draft;
    if ((d?.for_id ?? undefined) !== forId) return null;
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  if ((d?.for_id ?? undefined) !== forId) return null;
  memory = null;
  return d;
}
