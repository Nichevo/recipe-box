import { describe, expect, it } from "vitest";
import { z } from "zod";
import { RecipeDraftSchema, type RecipeDraft } from "../shared/ai-recipe";
import { draftToInput } from "../src/ai-draft";

const base: RecipeDraft = {
  ok: true, problem: null, title: " Lemon cake ", summary: "", servings: 8, prep_minutes: 20.4, cook_minutes: 0,
  ingredients: ["200 g butter", "For the icing:", "1 cup icing sugar", " "], steps: ["Mix.", " ", "Bake."],
  notes: null, meal: "dessert", cuisine: "Atlantis", diets: ["Vegetarian"]
};
const known = [
  { name: "Dessert", kind: "course" as const },
  { name: "Vegetarian", kind: "diet" as const },
  { name: "Atlantis", kind: "custom" as const }
];

describe("draftToInput", () => {
  it("maps fields, sections and known tags only", () => {
    const r = draftToInput(base, known);
    expect(r.title).toBe("Lemon cake");
    expect(r.summary).toBeNull();
    expect(r.prep_minutes).toBe(20);
    expect(r.cook_minutes).toBeNull();
    expect(r.ingredients_text).toBe("200 g butter\n\nFor the icing:\n1 cup icing sugar");
    expect(r.steps).toEqual([{ text: "Mix." }, { text: "Bake." }]);
    expect(r.tags).toEqual(["Dessert", "Vegetarian"]);
  });
});

describe("AI output schema", () => {
  it("is a closed object with every field required (needed for structured outputs)", () => {
    const s = z.toJSONSchema(RecipeDraftSchema, { target: "draft-7" }) as Record<string, unknown>;
    expect(s.type).toBe("object");
    expect(s.additionalProperties).toBe(false);
    expect((s.required as string[]).sort()).toEqual(Object.keys(RecipeDraftSchema.shape).sort());
  });
});
