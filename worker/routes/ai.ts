import { Hono } from "hono";
import type { Env } from "../env";
import { AiError, aiStatus, readAiSettings, runAi, type AiImage } from "../ai";

export const ai = new Hono<{ Bindings: Env }>();

const MAX_PAGES = 4;
const MAX_BYTES = 8 * 1024 * 1024;
const AI_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

function toBase64(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

/** The meal, cuisine and diet names the app knows, so the AI picks from them. */
async function tagLists(db: D1Database) {
  const { results } = await db
    .prepare("SELECT name, kind FROM tags WHERE kind IN ('course','cuisine','diet') ORDER BY name")
    .all<{ name: string; kind: string }>();
  const of = (k: string) => results.filter((r) => r.kind === k).map((r) => r.name).join(", ");
  return `Meal types: ${of("course")}.\nCuisines: ${of("cuisine")}.\nDiets: ${of("diet")}.`;
}

const FORMAT_RULES = `Fill in the fields like this:
- ingredients: one ingredient per entry, quantity first (e.g. "200 g butter, softened"). If the recipe groups ingredients, add the group name as its own entry ending in a colon (e.g. "For the icing:") before that group's ingredients.
- steps: one step per entry, without step numbers.
- servings, prep_minutes, cook_minutes: numbers, or null if unknown.
- meal and cuisine: pick one name from the lists below, or null if none fits. diets: names from the diet list that clearly apply, otherwise an empty list.
- notes: tips, variations or storage advice, or null.`;

const SCAN_SYSTEM = `You transcribe recipes from photos of cookbook pages, magazine clippings, handwritten cards and screenshots.
Copy the recipe faithfully: keep the author's wording, quantities and units exactly as printed (do not convert units or rewrite steps). Fix only obvious line-break hyphenation. If a recipe continues across several photos, join them in order. If text is unreadable, write [unclear] in its place rather than guessing.
If the photos don't show a recipe, set ok to false, explain briefly in problem, and leave the other fields empty or null.
${FORMAT_RULES}`;

const DRAFT_SYSTEM = `You write home-cooking recipes for a family recipe collection.
Write a complete, reliable recipe for what the person asks for. Use metric units (grams, millilitres, °C) with common spoon and cup measures where natural. Keep steps clear and practical. Put a one or two sentence description in summary.
If the request isn't something that can be cooked or made in a kitchen, set ok to false, explain briefly in problem, and leave the other fields empty or null.
${FORMAT_RULES}`;

function aiFailure(c: { json: (b: unknown, s: 400 | 403 | 422 | 502) => Response }, e: unknown) {
  if (e instanceof AiError) return c.json({ error: e.message }, e.status);
  throw e;
}

/** GET /api/ai/status: what's switched on and set up. */
ai.get("/status", async (c) => c.json(aiStatus(c.env, await readAiSettings(c.env.DB))));

/**
 * POST /api/ai/scan (multipart: one or more "file" photos of a recipe).
 * Keeps each photo as an "original page" photo and returns a recipe draft to check.
 */
ai.post("/scan", async (c) => {
  const form = await c.req.formData().catch(() => null);
  const files = (form?.getAll("file") ?? []).filter((f): f is File => typeof f !== "string");
  if (!files.length) return c.json({ error: "Add at least one photo" }, 400);
  if (files.length > MAX_PAGES) return c.json({ error: `Up to ${MAX_PAGES} photos at a time` }, 400);
  for (const f of files) {
    if (!(AI_TYPES as readonly string[]).includes(f.type)) return c.json({ error: "Photos must be JPEG, PNG or WebP" }, 400);
    if (f.size > MAX_BYTES) return c.json({ error: "A photo is too large" }, 413);
  }

  const images: AiImage[] = [];
  const photoIds: string[] = [];
  for (const f of files) {
    const bytes = await f.arrayBuffer();
    const id = crypto.randomUUID();
    const key = `photos/${id}`;
    await c.env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: f.type } });
    await c.env.DB.prepare("INSERT INTO photos (id, kind, r2_key) VALUES (?, 'original_page', ?)").bind(id, key).run();
    photoIds.push(id);
    images.push({ mediaType: f.type as AiImage["mediaType"], base64: toBase64(bytes) });
  }

  try {
    const result = await runAi(c.env, {
      task: "scan",
      system: `${SCAN_SYSTEM}\n\n${await tagLists(c.env.DB)}`,
      text: images.length > 1 ? `Transcribe the recipe in these ${images.length} photos, in order.` : "Transcribe the recipe in this photo.",
      images
    });
    return c.json({ ...result, photo_ids: photoIds });
  } catch (e) {
    return aiFailure(c, e);
  }
});

/** POST /api/ai/draft { prompt }: write a recipe from an idea. */
ai.post("/draft", async (c) => {
  const body = await c.req.json<{ prompt?: unknown }>().catch(() => ({}) as { prompt?: unknown });
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return c.json({ error: "Describe what you'd like to make" }, 400);
  if (prompt.length > 2000) return c.json({ error: "Please keep it under 2000 characters" }, 400);
  try {
    return c.json(
      await runAi(c.env, {
        task: "draft",
        system: `${DRAFT_SYSTEM}\n\n${await tagLists(c.env.DB)}`,
        text: `Write a recipe for: ${prompt}`
      })
    );
  } catch (e) {
    return aiFailure(c, e);
  }
});

/**
 * POST /api/ai/scan-recipe/:id: read the ingredients and method from photos
 * already on a recipe (for imported recipes that are only a photo).
 */
ai.post("/scan-recipe/:id", async (c) => {
  const id = c.req.param("id");
  const { results } = await c.env.DB.prepare(
    `SELECT r2_key FROM photos WHERE recipe_id = ?
     ORDER BY CASE kind WHEN 'original_page' THEN 0 WHEN 'hero' THEN 1 ELSE 2 END, created_at LIMIT ?`
  )
    .bind(id, MAX_PAGES)
    .all<{ r2_key: string }>();
  if (!results.length) return c.json({ error: "This recipe has no photos to read" }, 400);

  const images: AiImage[] = [];
  for (const r of results) {
    const obj = await c.env.PHOTOS.get(r.r2_key);
    const type = obj?.httpMetadata?.contentType ?? "";
    if (!obj || !(AI_TYPES as readonly string[]).includes(type)) continue;
    const bytes = await obj.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) continue;
    images.push({ mediaType: type as AiImage["mediaType"], base64: toBase64(bytes) });
  }
  if (!images.length) return c.json({ error: "This recipe's photos can't be read (unsupported format)" }, 422);
  try {
    return c.json(
      await runAi(c.env, {
        task: "scan",
        system: `${SCAN_SYSTEM}\n\n${await tagLists(c.env.DB)}`,
        text: images.length > 1 ? `Transcribe the recipe in these ${images.length} photos, in order.` : "Transcribe the recipe in this photo.",
        images
      })
    );
  } catch (e) {
    return aiFailure(c, e);
  }
});
