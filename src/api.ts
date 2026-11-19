export interface RecipeSummary {
  id: string;
  title: string;
  summary: string | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  fodmap_rating: "low" | "moderate" | "high" | null;
  tags: string[];
}

export interface Tag {
  name: string;
  kind: "diet" | "course" | "cuisine" | "custom";
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export function listRecipes(params: { q?: string; tags?: string[]; fodmap?: string }) {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  for (const t of params.tags ?? []) sp.append("tag", t);
  if (params.fodmap) sp.set("fodmap", params.fodmap);
  return get<RecipeSummary[]>(`/api/recipes?${sp}`);
}

export const listTags = () => get<Tag[]>("/api/tags");
