/**
 * Shows an ingredient line in the chosen units, scaled for a different number
 * of servings. Lines without a readable quantity are shown as written.
 */
import { formatQuantity, parseIngredient } from "./ingredients";
import { displayQuantity, kitchenRound, type DisplayMode } from "./units";

export interface IngredientLine {
  quantity: number | null;
  quantity_max: number | null;
  unit: string | null;
  preparation: string | null;
  original_text: string;
}

/** Units where the amount is a count of things, so halves and quarters make sense but not 0.37. */
const roundFor = (n: number) => (n >= 10 ? Math.round(n) : kitchenRound(n));

const PLURAL: Record<string, string> = {
  cup: "cups", can: "cans", tin: "tins", clove: "cloves", bunch: "bunches", slice: "slices", sprig: "sprigs",
  stick: "sticks", packet: "packets", pinch: "pinches", handful: "handfuls", pint: "pints", quart: "quarts"
};

export function formatIngredientLine(i: IngredientLine, mode: DisplayMode, factor = 1): string {
  const scaled = factor !== 1;
  if (i.quantity === null || (!i.unit && !scaled) || (mode === "as_written" && !scaled)) return i.original_text;
  const parsed = parseIngredient(i.original_text);
  const name = parsed.name; // keeps the original capitalisation
  const q = i.quantity * factor;
  const qMax = i.quantity_max !== null ? i.quantity_max * factor : null;

  let unit = i.unit ?? "";
  let qty: number;
  let max: number | null;
  if (i.unit && mode !== "as_written") {
    const d = displayQuantity(q, i.unit, mode);
    unit = d.unit;
    qty = d.quantity;
    max = qMax !== null ? displayQuantity(qMax, i.unit, mode).quantity : null;
    if (d.unit === i.unit) {
      // Not converted (e.g. cups in metric mode keep their unit): still round sensibly.
      qty = roundFor(qty);
      max = max !== null ? roundFor(max) : null;
    }
  } else {
    qty = roundFor(q);
    max = qMax !== null ? roundFor(qMax) : null;
  }
  const top = max ?? qty;
  if (top > 1 && PLURAL[unit]) unit = PLURAL[unit]!;
  const amount = max !== null && max !== qty ? `${formatQuantity(qty)}–${formatQuantity(max)}` : formatQuantity(qty);
  return [[amount, unit, name].filter(Boolean).join(" "), i.preparation].filter(Boolean).join(", ");
}
