import type { FodmapRating, RecipeInput } from "../shared/types";
import type { DisplayMode } from "../shared/units";
import type { WebRecipe } from "../shared/web-recipe";

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
