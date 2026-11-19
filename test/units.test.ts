import { describe, expect, it } from "vitest";
import { convertTemperaturesInText, displayQuantity, toMetric } from "../shared/units";

describe("toMetric", () => {
  it("converts weights and volumes", () => {
    expect(toMetric(1, "lb")).toEqual({ amount: 453.592, unit: "g" });
    expect(toMetric(2, "cups")).toEqual({ amount: 500, unit: "ml" });
    expect(toMetric(1, "Tbsp.")).toEqual({ amount: 15, unit: "ml" });
  });
  it("returns null for unknown units", () => {
    expect(toMetric(1, "pinch")).toBeNull();
  });
});

describe("displayQuantity", () => {
  it("keeps cups and spoons as written", () => {
    expect(displayQuantity(2, "tbsp", "metric")).toEqual({ quantity: 2, unit: "tbsp" });
  });
  it("converts imperial to metric with kitchen rounding", () => {
    expect(displayQuantity(1, "lb", "metric")).toEqual({ quantity: 455, unit: "g" });
  });
  it("converts metric to imperial", () => {
    expect(displayQuantity(500, "g", "imperial")).toEqual({ quantity: 1, unit: "lb" });
    expect(displayQuantity(100, "g", "imperial")).toEqual({ quantity: 3.5, unit: "oz" });
  });
  it("shows large amounts in kg", () => {
    expect(displayQuantity(1500, "g", "metric")).toEqual({ quantity: 1.5, unit: "kg" });
  });
});

describe("convertTemperaturesInText", () => {
  it("converts oven temperatures to the nearest 5 degrees", () => {
    expect(convertTemperaturesInText("Preheat the oven to 200°C", "F")).toBe("Preheat the oven to 390°F");
    expect(convertTemperaturesInText("Bake at 350 °F", "C")).toBe("Bake at 175°C");
  });
});
