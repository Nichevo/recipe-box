import { describe, expect, it } from "vitest";
import { formatQuantity, parseIngredient, parseIngredientBlock } from "../shared/ingredients";

describe("parseIngredient", () => {
  it("parses quantity, unit, name and bracketed preparation", () => {
    const p = parseIngredient("500 g chicken (cubed)");
    expect(p).toMatchObject({ quantity: 500, unit: "g", name: "chicken", preparation: "cubed", metricAmount: 500, metricUnit: "g" });
  });
  it("handles mixed fractions and comma preparation", () => {
    const p = parseIngredient("1 1/2 cups plain flour, sifted");
    expect(p).toMatchObject({ quantity: 1.5, unit: "cup", name: "plain flour", preparation: "sifted", metricAmount: 375, metricUnit: "ml" });
  });
  it("handles unicode fractions and abbreviations with dots", () => {
    expect(parseIngredient("½ tsp. salt")).toMatchObject({ quantity: 0.5, unit: "tsp", name: "salt" });
    expect(parseIngredient("1½ tbsp olive oil")).toMatchObject({ quantity: 1.5, unit: "tbsp", name: "olive oil" });
  });
  it("handles ranges", () => {
    expect(parseIngredient("2-3 cloves garlic, crushed")).toMatchObject({ quantity: 2, quantityMax: 3, unit: "clove", name: "garlic", preparation: "crushed" });
  });
  it("handles counts without a unit", () => {
    expect(parseIngredient("1 onion (diced)")).toMatchObject({ quantity: 1, unit: null, name: "onion", preparation: "diced" });
  });
  it("keeps lines without a quantity", () => {
    expect(parseIngredient("white pepper ( to taste)")).toMatchObject({ quantity: null, unit: null, name: "white pepper", preparation: "to taste" });
    expect(parseIngredient("pinch salt")).toMatchObject({ quantity: null, unit: "pinch", name: "salt" });
  });
  it("does not mistake a word for a unit", () => {
    expect(parseIngredient("2 large eggs")).toMatchObject({ quantity: 2, unit: null, name: "large eggs" });
  });
  it("converts imperial to metric", () => {
    expect(parseIngredient("1 lb beef mince")).toMatchObject({ unit: "lb", metricAmount: 453.59, metricUnit: "g" });
  });
});

describe("parseIngredientBlock", () => {
  it("tracks section headings and skips blank lines", () => {
    const items = parseIngredientBlock("For the base:\n200 g biscuits\n\n# Topping\n- 250 ml cream");
    expect(items.map((i) => [i.section, i.name])).toEqual([
      ["For the base", "biscuits"],
      ["Topping", "cream"]
    ]);
  });
});

describe("formatQuantity", () => {
  it("uses fraction glyphs", () => {
    expect(formatQuantity(0.5)).toBe("½");
    expect(formatQuantity(1.25)).toBe("1¼");
    expect(formatQuantity(2)).toBe("2");
    expect(formatQuantity(0.3333)).toBe("⅓");
  });
});
