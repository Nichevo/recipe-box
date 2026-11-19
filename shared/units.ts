/**
 * Unit conversion for ingredient quantities. Recipes store the amount as
 * written plus a metric value (grams or millilitres); the display can switch
 * between metric, imperial and as-written. Cups and spoons are kept as written.
 */

export type DisplayMode = "as_written" | "metric" | "imperial";

const MASS_TO_G: Record<string, number> = {
  g: 1, gram: 1, grams: 1,
  kg: 1000, kilogram: 1000, kilograms: 1000,
  oz: 28.3495, ounce: 28.3495, ounces: 28.3495,
  lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592
};

const VOLUME_TO_ML: Record<string, number> = {
  ml: 1, millilitre: 1, millilitres: 1, milliliter: 1, milliliters: 1,
  l: 1000, litre: 1000, litres: 1000, liter: 1000, liters: 1000,
  "fl oz": 29.5735, floz: 29.5735,
  pint: 473.176, pints: 473.176,
  quart: 946.353, quarts: 946.353
};

/** Kept as written in every mode: cooks measure these with the same tools. */
const KITCHEN_MEASURES: Record<string, number> = {
  cup: 250, cups: 250,
  tbsp: 15, tablespoon: 15, tablespoons: 15,
  tsp: 5, teaspoon: 5, teaspoons: 5
};

export interface Normalised {
  amount: number;
  unit: "g" | "ml";
}

/** Convert a written quantity to grams or millilitres, or null if unknown. */
export function toMetric(quantity: number, unit: string): Normalised | null {
  const u = unit.trim().toLowerCase().replace(/\.$/, "");
  if (u in MASS_TO_G) return { amount: quantity * MASS_TO_G[u]!, unit: "g" };
  if (u in VOLUME_TO_ML) return { amount: quantity * VOLUME_TO_ML[u]!, unit: "ml" };
  if (u in KITCHEN_MEASURES) return { amount: quantity * KITCHEN_MEASURES[u]!, unit: "ml" };
  return null;
}

/** Round to amounts that make sense in a kitchen. */
export function kitchenRound(value: number): number {
  if (value >= 100) return Math.round(value / 5) * 5;
  if (value >= 10) return Math.round(value);
  if (value >= 1) return Math.round(value * 4) / 4;
  return Math.round(value * 8) / 8;
}

export interface Display {
  quantity: number;
  unit: string;
}

/** Format a quantity for the chosen display mode. */
export function displayQuantity(quantity: number, unit: string, mode: DisplayMode): Display {
  const u = unit.trim().toLowerCase();
  if (mode === "as_written" || u in KITCHEN_MEASURES) return { quantity, unit };

  const metric = toMetric(quantity, unit);
  if (!metric) return { quantity, unit };

  if (mode === "metric") {
    if (metric.unit === "g" && metric.amount >= 1000) return { quantity: kitchenRound(metric.amount / 1000), unit: "kg" };
    if (metric.unit === "ml" && metric.amount >= 1000) return { quantity: kitchenRound(metric.amount / 1000), unit: "l" };
    return { quantity: kitchenRound(metric.amount), unit: metric.unit };
  }

  // imperial
  if (metric.unit === "g") {
    const oz = metric.amount / MASS_TO_G.oz!;
    return oz >= 16 ? { quantity: kitchenRound(oz / 16), unit: "lb" } : { quantity: kitchenRound(oz), unit: "oz" };
  }
  const floz = metric.amount / VOLUME_TO_ML["fl oz"]!;
  return floz >= 16 ? { quantity: kitchenRound(floz / 16), unit: "pint" } : { quantity: kitchenRound(floz), unit: "fl oz" };
}

export function celsiusToFahrenheit(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}

export function fahrenheitToCelsius(f: number): number {
  return Math.round(((f - 32) * 5) / 9);
}

/** Rewrite oven temperatures inside instruction text, e.g. "200°C" -> "390°F". */
export function convertTemperaturesInText(text: string, to: "C" | "F"): string {
  return text.replace(/(\d{2,3})\s*°\s*([CF])\b/g, (match, num: string, from: string) => {
    if (from === to) return match;
    const n = Number(num);
    const converted = to === "F" ? celsiusToFahrenheit(n) : fahrenheitToCelsius(n);
    // Ovens are set in steps of 5 or 10 degrees.
    return `${Math.round(converted / 5) * 5}°${to}`;
  });
}
