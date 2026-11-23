import type { FodmapRating, RecipeInput } from "../shared/types";
import type { DisplayMode } from "../shared/units";
import type { WebRecipe } from "../shared/web-recipe";
import type { RecipeDraft } from "../shared/ai-recipe";

export interface RecipeSummary {
  id: string;
  title: string;
  summary: string | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  fodmap_rating: FodmapRating | null;
  hero_photo_id: string | null;
  starred_at: string | null;
  tags: string[];
}

export interface Tag {
  name: string;
  kind: "diet" | "course" | "cuisine" | "custom";
  /** Number of recipes with this tag. */
  count?: number;
}

export interface IngredientRow {
  id: string;
  position: number;
  section: string | null;
  quantity: number | null;
  quantity_max: number | null;
  unit: string | null;
  preparation: string | null;
  original_text: string;
  item_name: string | null;
  item_fodmap: FodmapRating | null;
}

export interface StepRow {
  id: string;
  position: number;
  text: string;
  photo_id: string | null;
}

export interface RecipeDetail {
  id: string;
  starred_at: string | null;
  title: string;
  summary: string | null;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  source_url: string | null;
  source_name: string | null;
  hero_photo_id: string | null;
  fodmap_rating: FodmapRating | null;
  fodmap_override: number;
  notes: string | null;
  ingredients: IngredientRow[];
  steps: StepRow[];
  tags: Tag[];
  photos: { id: string; kind: "hero" | "step" | "original_page" | "gallery" }[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin", ...init });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});

export function listRecipes(params: { q?: string; tags?: string[]; fodmap?: string }) {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  for (const t of params.tags ?? []) sp.append("tag", t);
  if (params.fodmap) sp.set("fodmap", params.fodmap);
  return request<RecipeSummary[]>(`/api/recipes?${sp}`);
}

export const listTags = () => request<Tag[]>("/api/tags");
export const getRecipe = (id: string) => request<RecipeDetail>(`/api/recipes/${encodeURIComponent(id)}`);
export const createRecipe = (r: RecipeInput) => request<{ id: string }>("/api/recipes", json("POST", r));
export const updateRecipe = (id: string, r: RecipeInput) =>
  request<{ id: string }>(`/api/recipes/${encodeURIComponent(id)}`, json("PUT", r));
export const deleteRecipe = (id: string) =>
  request<{ ok: true }>(`/api/recipes/${encodeURIComponent(id)}`, { method: "DELETE" });

export const starRecipe = (id: string, starred: boolean) =>
  request<{ ok: true }>(`/api/recipes/${encodeURIComponent(id)}/star`, json("PUT", { starred }));
export const photoUrl = (id: string) => `/api/photos/${encodeURIComponent(id)}`;

export async function uploadPhoto(file: Blob, kind: string, width?: number, height?: number) {
  const form = new FormData();
  form.set("file", file, "photo");
  form.set("kind", kind);
  if (width) form.set("width", String(width));
  if (height) form.set("height", String(height));
  return request<{ id: string }>("/api/photos", { method: "POST", body: form });
}

export const photoFromUrl = (url: string, kind: string) =>
  request<{ id: string }>("/api/photos/from-url", json("POST", { url, kind }));
export const readLink = (url: string) =>
  request<{ recipe: WebRecipe; existing: { id: string; title: string } | null }>("/api/import/url", json("POST", { url }));
export const importedKeys = () => request<string[]>("/api/recipes/import-keys");

export interface Settings {
  "units.display"?: DisplayMode;
  [key: string]: string | undefined;
}
export const getSettings = () => request<Settings>("/api/settings");
export const putSettings = (s: Settings) => request<{ ok: true }>("/api/settings", json("PUT", s));

export interface AiStatus {
  claude: { enabled: boolean; configured: boolean };
  ollama: { enabled: boolean; configured: boolean; model: string };
  fallbackToClaude: boolean;
  available: boolean;
}
export interface AiResult {
  draft: RecipeDraft;
  provider: "claude" | "ollama";
}
export const aiStatus = () => request<AiStatus>("/api/ai/status");
export function aiScan(pages: Blob[]) {
  const form = new FormData();
  pages.forEach((p, i) => form.append("file", p, `page-${i + 1}.jpg`));
  return request<AiResult & { photo_ids: string[] }>("/api/ai/scan", { method: "POST", body: form });
}
export const aiDraft = (prompt: string) => request<AiResult>("/api/ai/draft", json("POST", { prompt }));
export const aiScanRecipe = (id: string) =>
  request<AiResult>(`/api/ai/scan-recipe/${encodeURIComponent(id)}`, { method: "POST" });

// Groceries, pantry and shopping list
export type PantryState = "have" | "likely" | "out" | "staple" | "unknown";
export interface GroceryStatus {
  configured: boolean;
  purchases: number;
  latestPurchase: string | null;
  nextRow: number;
  syncedAt: string | null;
}
export interface PantryEntry {
  name: string;
  category: string | null;
  lastBought: string | null;
  state: PantryState;
  manual: "have" | "out" | "staple" | null;
  source: "manual" | "photo" | null;
}
export interface RecipeKitchen {
  ingredients: { id: string; name: string | null; grocery_item: string | null; state: PantryState; cost: number | null }[];
  cost: number | null;
  priced: number;
  total: number;
}
export interface ShoppingItem {
  id: string;
  text: string;
  name: string | null;
  done: number;
  recipe_id: string | null;
  recipe_title: string | null;
}

export const groceryStatus = () => request<GroceryStatus>("/api/grocery/status");
export const grocerySync = (from: number) =>
  request<{ imported: number; next: number; done: boolean }>("/api/grocery/sync", json("POST", { from }));
export const groceryItems = () => request<{ item: string; category: string | null; last: string }[]>("/api/grocery/items");
export const linkIngredient = (ingredient: string, grocery_item: string | null | "auto") =>
  request<{ ok: true }>("/api/grocery/link", json("PUT", { ingredient, grocery_item }));

export const getPantry = () => request<PantryEntry[]>("/api/pantry");
export const setPantry = (items: { name: string; status: "have" | "out" | "staple" | null }[], source?: "photo") =>
  request<{ ok: true }>("/api/pantry", json("PUT", { items, source }));
export const recipeKitchen = (id: string) => request<RecipeKitchen>(`/api/pantry/recipe/${encodeURIComponent(id)}`);
export function scanPantry(photos: Blob[]) {
  const form = new FormData();
  photos.forEach((p, i) => form.append("file", p, `photo-${i + 1}.jpg`));
  return request<{ items: { name: string; known_name: string | null }[]; provider: string }>("/api/pantry/scan", { method: "POST", body: form });
}

export const getShopping = () => request<ShoppingItem[]>("/api/shopping");
export const addShopping = (items: { text: string; name?: string | null; recipe_id?: string }[]) =>
  request<{ added: number }>("/api/shopping", json("POST", { items }));
export const tickShopping = (id: string, done: boolean) => request<{ ok: true }>(`/api/shopping/${encodeURIComponent(id)}`, json("PUT", { done }));
export const removeShopping = (id: string) => request<{ ok: true }>(`/api/shopping/${encodeURIComponent(id)}`, { method: "DELETE" });
export const clearShoppingDone = () => request<{ ok: true }>("/api/shopping/done", { method: "DELETE" });

/** Sync the whole grocery sheet, chunk by chunk. */
export async function syncAllGroceries(onProgress?: (row: number) => void) {
  let from = 2;
  for (let i = 0; i < 100; i++) {
    const r = await grocerySync(from);
    onProgress?.(r.next);
    if (r.done) return r;
    from = r.next;
  }
  throw new Error("The sheet is larger than expected");
}
export const ingredientLinks = () =>
  request<{ name: string; grocery_item: string | null; manual: number; recipes: number }[]>("/api/grocery/links");

// Meal plan and "what can I make?"
export interface PlanEntry {
  id: string;
  day: string;
  recipe_id: string;
  servings: number | null;
  title: string;
  hero_photo_id: string | null;
  recipe_servings: number | null;
}
export interface Makeable {
  id: string;
  title: string;
  hero_photo_id: string | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  starred_at: string | null;
  have: number;
  total: number;
  missing: string[];
  cost: number | null;
}
export const getPlan = (from: string, days = 7) => request<PlanEntry[]>(`/api/plan?from=${from}&days=${days}`);
export const addToPlan = (day: string, recipe_id: string, servings?: number | null) =>
  request<{ id: string }>("/api/plan", json("POST", { day, recipe_id, servings }));
export const updatePlan = (id: string, p: { day?: string; servings?: number | null }) =>
  request<{ ok: true }>(`/api/plan/${encodeURIComponent(id)}`, json("PUT", p));
export const removeFromPlan = (id: string) => request<{ ok: true }>(`/api/plan/${encodeURIComponent(id)}`, { method: "DELETE" });
export const planShopping = (from: string, days = 7) =>
  request<{ key: string; text: string; recipes: string[] }[]>(`/api/plan/shopping?from=${from}&days=${days}`);
export const addPlanShopping = (from: string, days = 7) =>
  request<{ added: number; total: number }>(`/api/plan/shopping?from=${from}&days=${days}`, { method: "POST" });
export const whatCanIMake = () => request<Makeable[]>("/api/plan/suggest");

// Finding recipes on the web
export interface FoundRecipe {
  title: string;
  url: string;
  site: string;
  summary: string;
  minutes: number | null;
}
export interface FindResult {
  options: FoundRecipe[];
  mine: { id: string; title: string }[];
}
/** Errors carry the matching saved recipes and a plain web search link to fall back on. */
export async function findRecipes(query: string): Promise<FindResult & { error?: string; searchUrl?: string }> {
  const res = await fetch("/api/ai/find", { credentials: "same-origin", ...json("POST", { query }) });
  const body = (await res.json().catch(() => null)) as (FindResult & { error?: string; searchUrl?: string }) | null;
  if (res.ok && body) return body;
  return { options: [], mine: body?.mine ?? [], error: body?.error ?? `${res.status} ${res.statusText}`, searchUrl: body?.searchUrl };
}
