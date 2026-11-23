/** Combine the ingredients of several planned meals into one shopping list. */

export interface PlannedIngredient {
  key: string; // grocery item or ingredient name, used to merge lines
  label: string; // what to call it on the list
  metric_amount: number | null;
  metric_unit: string | null;
  quantity: number | null;
  unit: string | null;
  original_text: string;
  factor: number; // servings scaling for that meal
  recipe: string;
}

export interface ShoppingLine {
  key: string;
  text: string;
  recipes: string[];
}

const round = (n: number) => (n >= 100 ? Math.round(n / 10) * 10 : n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);

function amountText(g: number, unit: "g" | "ml"): string {
  if (g >= 1000) return `${round(g / 1000)} ${unit === "g" ? "kg" : "l"}`;
  return `${round(g)} ${unit}`;
}

export function combineShopping(items: PlannedIngredient[]): ShoppingLine[] {
  const groups = new Map<string, PlannedIngredient[]>();
  for (const i of items) groups.set(i.key.toLowerCase(), [...(groups.get(i.key.toLowerCase()) ?? []), i]);
  const out: ShoppingLine[] = [];
  for (const [key, list] of groups) {
    const recipes = [...new Set(list.map((l) => l.recipe))];
    const parts: string[] = [];
    // Weights and volumes add up; counts ("3 eggs") add up; anything else is listed as written.
    for (const unit of ["g", "ml"] as const) {
      const total = list.filter((l) => l.metric_unit === unit && l.metric_amount !== null).reduce((a, l) => a + l.metric_amount! * l.factor, 0);
      if (total > 0) parts.push(amountText(total, unit));
    }
    const count = list.filter((l) => l.metric_amount === null && !l.unit && l.quantity !== null).reduce((a, l) => a + l.quantity! * l.factor, 0);
    if (count > 0) parts.push(String(Math.ceil(count * 4) / 4).replace(/\.25$/, "¼").replace(/\.5$/, "½").replace(/\.75$/, "¾"));
    const other = list.filter((l) => !(l.metric_amount !== null && (l.metric_unit === "g" || l.metric_unit === "ml")) && !(l.metric_amount === null && !l.unit && l.quantity !== null));
    const label = list[0]!.label;
    let text = parts.length ? `${label} (${parts.join(" + ")})` : label;
    if (other.length && parts.length) text += ` + ${other.map((o) => o.original_text).join("; ")}`;
    else if (other.length) text = other.length === 1 ? other[0]!.original_text : `${label} (${other.map((o) => o.original_text).join("; ")})`;
    out.push({ key, text, recipes });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/** Monday of the week containing `d` (YYYY-MM-DD). */
export function weekStart(d: string): string {
  const t = new Date(`${d}T12:00:00Z`);
  const dow = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dow);
  return t.toISOString().slice(0, 10);
}

export function addDays(d: string, n: number): string {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
