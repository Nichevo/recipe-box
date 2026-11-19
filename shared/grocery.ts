/**
 * Grocery spreadsheet rows -> purchases, ingredient -> grocery item matching,
 * pantry status and cost estimates. Pure functions so they can be tested
 * without the sheet or the database.
 */

export interface Purchase {
  sheet_row: number;
  date: string; // YYYY-MM-DD
  shop: string | null;
  category: string | null;
  item: string;
  size: number | null;
  size_type: string | null;
  qty: number;
  price: number | null;
  total: number | null;
  base_amount: number | null;
  base_unit: "g" | "ml" | "each" | null;
  brand: string | null;
}

/** Categories that aren't food, so never synced. */
export const IGNORED_CATEGORIES = ["dog", "house", "medical"];

/** Columns we read, by header name. Anything else in the sheet (who paid, invoices...) is ignored. */
const COLUMNS = {
  date: "date",
  shop: "shop",
  category: "category",
  item: "item",
  size: "size",
  sizeType: "sizetype",
  qty: "qty",
  price: "price",
  kg: "kg",
  total: "total",
  brand: "brand"
} as const;
export type ColumnIndex = Record<keyof typeof COLUMNS, number>;

export function columnIndex(header: unknown[]): ColumnIndex {
  const names = header.map((h) => String(h ?? "").trim().toLowerCase().replace(/\s+/g, ""));
  const out = {} as ColumnIndex;
  for (const [key, name] of Object.entries(COLUMNS)) out[key as keyof ColumnIndex] = names.indexOf(name);
  if (out.date < 0 || out.item < 0) throw new Error("The sheet needs Date and Item columns");
  return out;
}

export function parseNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.replace(/[$,\s]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** A sheet date: a serial day number, or text like 5/11/2026 (day first). */
export function parseSheetDate(v: unknown): string | null {
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  if (Number(mo) > 12 || Number(d) > 31) return null;
  return `${y}-${mo!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
}

/** How much was bought in total, in g, ml or items. */
export function baseAmount(size: number | null, sizeType: string | null, qty: number, kgColumn: number | null) {
  const t = (sizeType ?? "").trim().toLowerCase();
  // Older rows: priced "per g" / "per kg" with the weight in the kg column.
  const per = t.match(/^per\s*(g|kg|ml|l)$/);
  if (per && kgColumn) {
    const factor = per[1] === "kg" || per[1] === "l" ? 1000 : 1;
    return { amount: kgColumn * factor, unit: per[1] === "ml" || per[1] === "l" ? ("ml" as const) : ("g" as const) };
  }
  if (size && size > 0) {
    if (t === "g") return { amount: size * qty, unit: "g" as const };
    if (t === "kg") return { amount: size * 1000 * qty, unit: "g" as const };
    if (t === "ml") return { amount: size * qty, unit: "ml" as const };
    if (t === "l") return { amount: size * 1000 * qty, unit: "ml" as const };
    if (t === "pk" || t === "ea" || t === "each" || t === "" ) return { amount: size * qty, unit: "each" as const };
  }
  if (!t || t === "ea" || t === "each") return { amount: qty, unit: "each" as const };
  return null; // e.g. sheets of tissue: not useful for cooking
}

export function parsePurchase(row: unknown[], c: ColumnIndex, sheetRow: number): Purchase | null {
  const cell = (i: number) => (i >= 0 ? row[i] : undefined);
  const text = (i: number) => {
    const v = cell(i);
    const s = v == null ? "" : String(v).trim();
    return s || null;
  };
  const item = text(c.item);
  const date = parseSheetDate(cell(c.date));
  const category = text(c.category);
  if (!item || !date) return null;
  if (category && IGNORED_CATEGORIES.includes(category.toLowerCase())) return null;
  if (/\bfee\b|^byo bags$/i.test(item)) return null;
  const qty = parseNumber(cell(c.qty)) || 1;
  const size = parseNumber(cell(c.size));
  const sizeType = text(c.sizeType);
  const price = parseNumber(cell(c.price));
  const total = parseNumber(cell(c.total)) ?? (price !== null ? price * qty : null);
  const base = baseAmount(size, sizeType, qty, parseNumber(cell(c.kg)));
  return {
    sheet_row: sheetRow,
    date,
    shop: text(c.shop),
    category,
    item,
    size,
    size_type: sizeType,
    qty,
    price,
    total,
    base_amount: base?.amount ?? null,
    base_unit: base?.unit ?? null,
    brand: text(c.brand)
  };
}

// ---------------------------------------------------------------------------
// Matching ingredient names to grocery item names

const STOP = new Set(["fresh", "large", "small", "medium", "free", "range", "organic", "raw", "dried", "ground", "whole", "plain", "of", "and", "the", "a"]);

export function singular(word: string): string {
  if (/ies$/.test(word) && word.length > 4) return `${word.slice(0, -3)}y`;
  if (/(ches|shes|oes|sses)$/.test(word)) return word.slice(0, -2);
  if (/s$/.test(word) && !/ss$/.test(word) && word.length > 3) return word.slice(0, -1);
  return word;
}

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-zà-ž0-9&\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean)
    .map(singular);

/**
 * Best grocery item for an ingredient: an exact name match, otherwise the
 * longest grocery name whose words all appear in the ingredient
 * ("boneless chicken thighs" -> "Chicken"), ignoring words like "fresh".
 */
export function matchGroceryItem(ingredient: string, groceryItems: string[]): string | null {
  const iw = words(ingredient);
  const iset = new Set(iw);
  const ikey = iw.join(" ");
  let best: string | null = null;
  let bestScore = 0;
  for (const g of groceryItems) {
    const gw = words(g).filter((w) => !STOP.has(w));
    if (!gw.length) continue;
    if (gw.join(" ") === ikey) return g;
    if (gw.some((w) => /\d/.test(w))) continue; // "milk 2l" style names only match exactly
    if (!gw.every((w) => iset.has(w))) continue;
    const score = gw.join(" ").length;
    if (score > bestScore) {
      best = g;
      bestScore = score;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Pantry

export type PantryState = "have" | "likely" | "out" | "staple" | "unknown";

/** Rough days a purchase lasts, by sheet category. */
export function shelfLifeDays(category: string | null): number {
  const c = (category ?? "").toLowerCase();
  if (c.includes("meat") || c.includes("fish") || c.includes("seafood")) return 5;
  if (c.includes("fruit") || c.includes("veg")) return 7;
  if (c.includes("dairy") || c.includes("bread") || c.includes("carb")) return 12;
  if (c.includes("snack")) return 30;
  if (c.includes("drink")) return 60;
  if (c.includes("condiment") || c.includes("spread") || c.includes("pantry") || c.includes("baking")) return 120;
  return 30;
}

export interface PantryFacts {
  manual?: { status: "have" | "out" | "staple"; at: string } | null;
  lastBought?: { date: string; category: string | null } | null;
  shelfLife?: number | null;
}

const DAY = 86400000;

/** Combine what was said by hand with recent purchases. The most recent event wins. */
export function pantryState(f: PantryFacts, today = new Date()): PantryState {
  const now = today.getTime();
  const m = f.manual;
  if (m?.status === "staple") return "staple";
  const boughtAt = f.lastBought ? Date.parse(`${f.lastBought.date}T12:00:00Z`) : null;
  const manualAt = m ? Date.parse(m.at) : null;
  if (m && manualAt !== null && (boughtAt === null || manualAt >= boughtAt)) {
    if (m.status === "out") return "out";
    // Said "have" by hand: trust it for a while, longer for things that keep.
    const days = f.shelfLife ?? (f.lastBought ? shelfLifeDays(f.lastBought.category) : 30);
    return now - manualAt <= Math.max(days, 14) * DAY ? "have" : "unknown";
  }
  if (boughtAt !== null) {
    const days = f.shelfLife ?? shelfLifeDays(f.lastBought!.category);
    return now - boughtAt <= days * DAY ? "likely" : "out";
  }
  return "unknown";
}

// ---------------------------------------------------------------------------
// Cost

export interface PriceInfo {
  /** NZD per g, ml or item. */
  unitPrice: number;
  unit: "g" | "ml" | "each";
}

/**
 * Estimated cost of an ingredient amount. Grams and millilitres are treated as
 * interchangeable (close enough for most cooking ingredients).
 */
export function ingredientCost(
  amount: { metric_amount: number | null; metric_unit: string | null; quantity: number | null; unit: string | null },
  price: PriceInfo,
  factor = 1
): number | null {
  if (price.unit === "each") {
    if (amount.quantity !== null && !amount.unit) return amount.quantity * factor * price.unitPrice;
    return null;
  }
  if (amount.metric_amount !== null && (amount.metric_unit === "g" || amount.metric_unit === "ml")) {
    return amount.metric_amount * factor * price.unitPrice;
  }
  return null;
}
