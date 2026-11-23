import { describe, expect, it } from "vitest";
import { addDays, combineShopping, weekStart, type PlannedIngredient } from "../shared/plan";

const ing = (p: Partial<PlannedIngredient>): PlannedIngredient => ({
  key: "x", label: "x", metric_amount: null, metric_unit: null, quantity: null, unit: null, original_text: "x", factor: 1, recipe: "A", ...p
});

describe("combineShopping", () => {
  it("adds up weights across meals, with scaling", () => {
    const lines = combineShopping([
      ing({ key: "Chicken", label: "chicken thighs", metric_amount: 600, metric_unit: "g", recipe: "A" }),
      ing({ key: "chicken", label: "chicken breast", metric_amount: 500, metric_unit: "g", factor: 1.5, recipe: "B" })
    ]);
    expect(lines).toEqual([{ key: "chicken", text: "chicken thighs (1.4 kg)", recipes: ["A", "B"] }]);
  });
  it("adds counts and keeps odd units as written", () => {
    expect(combineShopping([ing({ key: "eggs", label: "eggs", quantity: 2 }), ing({ key: "eggs", label: "eggs", quantity: 3, factor: 0.5 })])[0]!.text).toBe("eggs (3½)");
    expect(combineShopping([ing({ key: "garlic", label: "garlic", quantity: 2, unit: "clove", original_text: "2 cloves garlic" })])[0]!.text).toBe("2 cloves garlic");
  });
});

describe("weeks", () => {
  it("finds Monday and adds days", () => {
    expect(weekStart("2026-11-23")).toBe("2026-11-23");
    expect(weekStart("2026-11-29")).toBe("2026-11-23");
    expect(addDays("2026-11-30", 2)).toBe("2026-12-02");
  });
});
