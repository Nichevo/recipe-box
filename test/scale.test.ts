import { describe, expect, it } from "vitest";
import { parseIngredient } from "../shared/ingredients";
import { formatIngredientLine } from "../shared/scale";

const line = (text: string) => {
  const p = parseIngredient(text);
  return { quantity: p.quantity, quantity_max: p.quantityMax, unit: p.unit, preparation: p.preparation, original_text: p.originalText };
};

describe("formatIngredientLine", () => {
  it("shows the original text when nothing changes", () => {
    expect(formatIngredientLine(line("1 1/2 cups plain flour, sifted"), "as_written")).toBe("1 1/2 cups plain flour, sifted");
  });
  it("scales written amounts with kitchen rounding", () => {
    expect(formatIngredientLine(line("1 1/2 cups plain flour, sifted"), "as_written", 1.5)).toBe("2¼ cups plain flour, sifted");
    expect(formatIngredientLine(line("200 g butter"), "as_written", 1.5)).toBe("300 g butter");
  });
  it("scales counts without a unit", () => {
    expect(formatIngredientLine(line("2 eggs"), "as_written", 1.5)).toBe("3 eggs");
    expect(formatIngredientLine(line("3 eggs"), "as_written", 0.5)).toBe("1½ eggs");
  });
  it("scales and converts together", () => {
    expect(formatIngredientLine(line("8 oz cheese"), "metric", 2)).toBe("455 g cheese");
  });
  it("leaves lines without a quantity alone", () => {
    expect(formatIngredientLine(line("Salt to taste"), "metric", 2)).toBe("Salt to taste");
  });
});
