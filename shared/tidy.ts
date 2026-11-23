/** Spot recipes whose import left blog clutter or gaps, so they can be tidied. */

const JUNK = [
  /\bvotes?\b/i,
  /^(course|cuisine|keyword|author|servings?|prep time|cook time|total time|calories)\s*:/i,
  /\b(kcal|calories)\b.*\b(fat|carb)/i,
  /\baffiliate\b|\bcommission\b|\bsubscribe\b|\bnewsletter\b/i,
  /^[^\w¼½¾⅓⅔⅛(]/ // starts with punctuation or an emoji, e.g. "/3 cup" from a broken fraction, or a table row
];

export interface TidyInput {
  notes: string | null;
  ingredients: { original_text: string; quantity: number | null }[];
  steps: number;
  photos: number;
}

/** Reasons a recipe looks like it needs tidying (empty when it looks fine). */
export function tidyReasons(r: TidyInput): string[] {
  const out: string[] = [];
  const check = r.notes?.match(/Imported from Notion\. Check: ([^\n]*?)\.?(\n|$)/);
  // Extra photos and a moved introduction are just for information; tidying can't change them.
  if (check?.[1]) out.push(...check[1].split("; ").filter((w) => w && !/extra photo|introduction/i.test(w)));
  if (!r.ingredients.length && !out.some((o) => /ingredient|photo/i.test(o))) out.push(r.photos ? "Only a photo" : "No ingredients");
  if (!r.steps && r.ingredients.length && !out.some((o) => /method|link/i.test(o))) out.push("No method");
  const junk = r.ingredients.filter((i) => JUNK.some((re) => re.test(i.original_text.trim())) || (i.quantity === null && i.original_text.length > 90));
  if (junk.length) out.push(`${junk.length} ingredient line${junk.length > 1 ? "s" : ""} look${junk.length > 1 ? "" : "s"} wrong`);
  return out;
}
