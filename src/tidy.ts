import { aiTidy, listTags, type Tag } from "./api";
import { draftToInput } from "./ai-draft";
import { setDraft } from "./draft";
import { go } from "./router";

/** Ask the AI for a tidied version of a recipe and open it on the edit page to check. */
export async function tidyRecipe(id: string): Promise<void> {
  const [res, known] = await Promise.all([aiTidy(id), listTags().catch(() => [] as Tag[])]);
  if (!res.draft.ok) throw new Error(res.draft.problem || "The AI couldn't find a recipe to tidy.");
  const input = draftToInput(res.draft, known);
  // Keep the saved title and tags: tidying shouldn't rename or re-file the recipe.
  const { title: _title, tags: _tags, ...rest } = input;
  setDraft({ ...rest, for_id: id, replace: true });
  go(`#/edit/${encodeURIComponent(id)}`);
}
