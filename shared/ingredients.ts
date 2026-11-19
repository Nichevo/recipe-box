/**
 * Parses free-text ingredient lines ("1 1/2 cups plain flour, sifted") into
 * quantity, unit, name and preparation. The original text is always kept, so
 * a line the parser can't fully understand still displays correctly.
 */
import { toMetric } from "./units";

export interface ParsedIngredient {
  quantity: number | null;
  quantityMax: number | null;
  unit: string | null;
  name: string;
  preparation: string | null;
  metricAmount: number | null;
  metricUnit: "g" | "ml" | null;
  originalText: string;
  section: string | null;
}

const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75,
  "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8, "⅙": 1 / 6, "⅚": 5 / 6, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875
};

/** Canonical unit names. Keys are lower case, without a trailing dot. */
const UNITS: Record<string, string> = {
  g: "g", gram: "g", grams: "g", gr: "g",
  kg: "kg", kilogram: "kg", kilograms: "kg", kgs: "kg",
  mg: "mg",
  ml: "ml", millilitre: "ml", millilitres: "ml", milliliter: "ml", milliliters: "ml", mls: "ml",
  l: "l", litre: "l", litres: "l", liter: "l", liters: "l",
  oz: "oz", ounce: "oz", ounces: "oz",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  "fl oz": "fl oz", floz: "fl oz",
  cup: "cup", cups: "cup", c: "cup",
  tbsp: "tbsp", tbs: "tbsp", tbl: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp", T: "tbsp",
  tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp", t: "tsp",
  pint: "pint", pints: "pint", quart: "quart", quarts: "quart",
  pinch: "pinch", pinches: "pinch", dash: "dash", handful: "handful", handfuls: "handful",
  clove: "clove", cloves: "clove", can: "can", cans: "can", tin: "tin", tins: "tin",
  bunch: "bunch", bunches: "bunch", slice: "slice", slices: "slice", sprig: "sprig", sprigs: "sprig",
  stick: "stick", sticks: "stick", packet: "packet", packets: "packet", pkt: "packet"
};

function parseNumber(token: string): number | null {
  const t = token.trim();
  if (!t) return null;
  if (t in UNICODE_FRACTIONS) return UNICODE_FRACTIONS[t]!;
  // "1½"
  const mixedUnicode = t.match(/^(\d+)([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])$/);
  if (mixedUnicode) return Number(mixedUnicode[1]) + UNICODE_FRACTIONS[mixedUnicode[2]!]!;
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[2]) === 0 ? null : Number(frac[1]) / Number(frac[2]);
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const NUM = String.raw`(?:\d+[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|\d+(?:[.,]\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+|\d*[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])`;
const QTY_RE = new RegExp(String.raw`^(${NUM})(?:\s*(?:-|–|to)\s*(${NUM}))?\s*`);

function parseQuantity(text: string): number | null {
  const parts = text.trim().split(/\s+/);
  if (parts.length === 2) {
    // "1 1/2"
    const a = parseNumber(parts[0]!);
    const b = parseNumber(parts[1]!);
    return a !== null && b !== null ? a + b : null;
  }
  return parseNumber(text);
}

/** Parse one ingredient line. `section` is the current "For the sauce" heading. */
export function parseIngredient(line: string, section: string | null = null): ParsedIngredient {
  const originalText = line.trim().replace(/^[-*•]\s*/, "");
  let rest = originalText;

  let quantity: number | null = null;
  let quantityMax: number | null = null;
  const q = rest.match(QTY_RE);
  if (q) {
    quantity = parseQuantity(q[1]!);
    quantityMax = q[2] ? parseQuantity(q[2]) : null;
    rest = rest.slice(q[0].length);
  }

  let unit: string | null = null;
  if (quantity !== null || /^(pinch|dash|handful)\b/i.test(rest)) {
    // Try two-word units first ("fl oz"), then one word. "T" and "t" are case-sensitive.
    const two = rest.match(/^([A-Za-z]+\s[A-Za-z]+)\.?(?=\s|$)/);
    const one = rest.match(/^([A-Za-z]+)\.?(?=\s|$|\))/);
    if (two && UNITS[two[1]!.toLowerCase()]) {
      unit = UNITS[two[1]!.toLowerCase()]!;
      rest = rest.slice(two[0].length);
    } else if (one) {
      const raw = one[1]!;
      const key = raw === "T" || raw === "t" ? raw : raw.toLowerCase();
      if (UNITS[key]) {
        unit = UNITS[key]!;
        rest = rest.slice(one[0].length);
      }
    }
    rest = rest.replace(/^\s*of\s+/i, "");
  }

  // Preparation: text in brackets, or after the first comma.
  let preparation: string | null = null;
  const paren = rest.match(/\(\s*([^)]*?)\s*\)/);
  if (paren) {
    preparation = paren[1] || null;
    rest = (rest.slice(0, paren.index) + rest.slice(paren.index! + paren[0].length)).trim();
  }
  const comma = rest.indexOf(",");
  if (comma > 0) {
    const after = rest.slice(comma + 1).trim();
    preparation = [preparation, after].filter(Boolean).join(", ") || null;
    rest = rest.slice(0, comma);
  }

  const name = rest.replace(/\s+/g, " ").trim() || originalText;
  const metric = quantity !== null && unit ? toMetric(quantity, unit) : null;

  return {
    quantity,
    quantityMax,
    unit,
    name,
    preparation,
    metricAmount: metric ? Math.round(metric.amount * 100) / 100 : null,
    metricUnit: metric?.unit ?? null,
    originalText,
    section
  };
}

/**
 * Parse a block of ingredient lines. Lines ending in ":" or starting with "#"
 * become section headings ("For the sauce:").
 */
export function parseIngredientBlock(text: string): ParsedIngredient[] {
  let section: string | null = null;
  const out: ParsedIngredient[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^#+\s*(.+)$/) ?? line.match(/^(.+):$/);
    if (heading) {
      section = heading[1]!.trim();
      continue;
    }
    out.push(parseIngredient(line, section));
  }
  return out;
}

/** Format a number for display: 0.5 -> "½", 1.25 -> "1¼". */
export function formatQuantity(n: number): string {
  const whole = Math.floor(n);
  const frac = n - whole;
  const fractions: [number, string][] = [
    [0.125, "⅛"], [0.25, "¼"], [1 / 3, "⅓"], [0.5, "½"], [2 / 3, "⅔"], [0.75, "¾"]
  ];
  for (const [value, glyph] of fractions) {
    if (Math.abs(frac - value) < 0.02) return whole ? `${whole}${glyph}` : glyph;
  }
  if (frac < 0.02) return String(whole);
  return String(Math.round(n * 100) / 100);
}
