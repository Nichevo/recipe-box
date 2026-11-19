import { describe, expect, it } from "vitest";
import { baseAmount, columnIndex, ingredientCost, matchGroceryItem, pantryState, parsePurchase, parseSheetDate } from "../shared/grocery";

// Made-up rows in the same shape as the spreadsheet (no real data).
const header = ["Type", "Date", "Shop", "Category", "Item", "Size", "SizeType", "Qty", "Price", "", "kg", "Total", "TripTotal", "Who Paid", "Brand"];
const c = columnIndex(header);

describe("parsePurchase", () => {
  it("reads a packaged item with quantity", () => {
    const p = parsePurchase(["H", "5/11/2026", "Shop A", "Dairy", "Feta", "150", "g", "2", "$7.15", "", "", "$14.30", "", "Someone", "BrandX"], c, 10)!;
    expect(p).toMatchObject({ date: "2026-11-05", item: "Feta", qty: 2, total: 14.3, base_amount: 300, base_unit: "g", brand: "BrandX" });
    expect(p).not.toHaveProperty("who_paid");
  });
  it("reads old per-gram rows", () => {
    const p = parsePurchase(["H", "20/01/2018", "Shop A", "Dairy", "Cheddar", "", "per g", "", "$0.02", "", "700", "$14.00"], c, 2)!;
    expect(p).toMatchObject({ base_amount: 700, base_unit: "g", total: 14 });
  });
  it("counts items with no size", () => {
    const p = parsePurchase(["H", "20/01/2018", "Shop", "Fruit & Veg", "Avocado", "", "", "2", "$3.50", "", "", "$6.99"], c, 3)!;
    expect(p).toMatchObject({ base_amount: 2, base_unit: "each" });
  });
  it("skips non-food categories, fees and blank rows", () => {
    expect(parsePurchase(["H", "5/11/2026", "S", "Dog", "Dog food", "800", "g", "", "$9", "", "", "$9"], c, 4)).toBeNull();
    expect(parsePurchase(["H", "5/11/2026", "S", "House", "pick up fee", "", "", "", "$3.50"], c, 5)).toBeNull();
    expect(parsePurchase(["", "", "", "", "", "", "", "", "", "", "", "$0.00"], c, 6)).toBeNull();
  });
  it("reads serial dates", () => {
    expect(parseSheetDate(46331)).toBe("2026-11-05");
  });
  it("litres and kilos convert", () => {
    expect(baseAmount(1.5, "l", 1, null)).toEqual({ amount: 1500, unit: "ml" });
    expect(baseAmount(2, "kg", 2, null)).toEqual({ amount: 4000, unit: "g" });
  });
});

describe("matchGroceryItem", () => {
  const items = ["Chicken", "Chicken Schnitzel", "Baby Spinach", "Feta", "Milk 2l", "Flour", "Lemons"];
  it("matches exact, plural and contained names", () => {
    expect(matchGroceryItem("feta", items)).toBe("Feta");
    expect(matchGroceryItem("lemon", items)).toBe("Lemons");
    expect(matchGroceryItem("boneless chicken thighs", items)).toBe("Chicken");
    expect(matchGroceryItem("plain flour", items)).toBe("Flour");
    expect(matchGroceryItem("fresh baby spinach leaves", items)).toBe("Baby Spinach");
  });
  it("doesn't guess", () => {
    expect(matchGroceryItem("milk", items)).toBeNull();
    expect(matchGroceryItem("cumin", items)).toBeNull();
  });
});

describe("pantryState", () => {
  const today = new Date("2026-11-19T09:00:00Z");
  it("recent purchases are likely in", () => {
    expect(pantryState({ lastBought: { date: "2026-11-18", category: "Dairy" } }, today)).toBe("likely");
    expect(pantryState({ lastBought: { date: "2026-10-01", category: "Meat" } }, today)).toBe("out");
  });
  it("the latest of hand-set and bought wins", () => {
    expect(pantryState({ manual: { status: "out", at: "2026-11-19T01:00:00Z" }, lastBought: { date: "2026-11-18", category: "Dairy" } }, today)).toBe("out");
    expect(pantryState({ manual: { status: "out", at: "2026-11-10T01:00:00Z" }, lastBought: { date: "2026-11-18", category: "Dairy" } }, today)).toBe("likely");
    expect(pantryState({ manual: { status: "have", at: "2026-11-15T01:00:00Z" } }, today)).toBe("have");
    expect(pantryState({ manual: { status: "staple", at: "2020-01-01T00:00:00Z" } }, today)).toBe("staple");
    expect(pantryState({}, today)).toBe("unknown");
  });
});

describe("ingredientCost", () => {
  it("prices by weight or by count", () => {
    expect(ingredientCost({ metric_amount: 200, metric_unit: "g", quantity: 200, unit: "g" }, { unitPrice: 0.02, unit: "g" })).toBeCloseTo(4);
    expect(ingredientCost({ metric_amount: null, metric_unit: null, quantity: 2, unit: null }, { unitPrice: 1.75, unit: "each" }, 1.5)).toBeCloseTo(5.25);
    expect(ingredientCost({ metric_amount: null, metric_unit: null, quantity: 1, unit: "pinch" }, { unitPrice: 0.01, unit: "g" })).toBeNull();
  });
});
