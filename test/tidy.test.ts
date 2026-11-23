import { describe, expect, it } from "vitest";
import { tidyReasons } from "../shared/tidy";

const ing = (original_text: string, quantity: number | null = 1) => ({ original_text, quantity });

describe("tidyReasons", () => {
  it("passes a clean recipe", () => {
    expect(tidyReasons({ notes: null, ingredients: [ing("200 g flour"), ing("2 eggs")], steps: 3, photos: 0 })).toEqual([]);
  });
  it("reads the import check note", () => {
    expect(tidyReasons({ notes: "Tip.\n\nImported from Notion. Check: No method found; 2 extra photo(s) not imported.", ingredients: [ing("1 egg")], steps: 0, photos: 1 })).toEqual([
      "No method found"]);
  });
  it("spots blog clutter in the ingredients", () => {
    const r = tidyReasons({ notes: null, ingredients: [ing("from 2 votes", 5), ing("course: BREAKFAST", null), ing("/3 cup applesauce", 2), ing("1 cup flour")], steps: 2, photos: 0 });
    expect(r).toEqual(["3 ingredient lines look wrong"]);
  });
  it("notices a photo-only recipe", () => {
    expect(tidyReasons({ notes: null, ingredients: [], steps: 0, photos: 1 })).toEqual(["Only a photo"]);
  });
});
