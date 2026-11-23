import { Hono } from "hono";
import type { Env } from "../env";
import { NutritionSchema } from "../../shared/ai-recipe";
import { AiError, askAi, aiStatus, findRecipesOnline, readAiSettings, runAi, type AiImage } from "../ai";

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

const TIDY_SYSTEM = `You tidy up recipes that were copied from blogs and notes apps into a family recipe collection.
You get the recipe as it was saved. Return the same recipe, cleaned up:
- Keep the author's wording, quantities and units. Do not convert units, invent ingredients or rewrite the method beyond fixing obvious copy errors.
- Remove blog clutter: ratings and vote counts, "course:"/"cuisine:" labels, nutrition boilerplate, affiliate notes, sign-up prompts, and text that is not part of the recipe. Move genuinely useful tips, substitutions, storage advice and nutrition per serving into notes.
- Fix broken lines: rejoin fractions split across lines (e.g. "1" and "/3 cup" is "1/3 cup"), put each ingredient on its own line, and move method text that ended up among the ingredients into steps.
- If the description or summary is long, shorten it to one or two sentences.
- Leave out any "Imported from Notion. Check: ..." line.
- If there is nothing that can be made into a recipe, set ok to false and explain briefly in problem.
${FORMAT_RULES}`;

/**
 * POST /api/ai/tidy/:id: a cleaned-up version of a saved recipe, to check
 * on the edit page before saving. Nothing is changed here.
 */
ai.post("/tidy/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  const recipe = await db.prepare("SELECT title, summary, servings, prep_minutes, cook_minutes, notes FROM recipes WHERE id = ?").bind(id).first<{
    title: string; summary: string | null; servings: number | null; prep_minutes: number | null; cook_minutes: number | null; notes: string | null;
  }>();
  if (!recipe) return c.json({ error: "Not found" }, 404);
  const [ings, steps] = await db.batch([
    db.prepare("SELECT section, original_text FROM recipe_ingredients WHERE recipe_id = ? ORDER BY position").bind(id),
    db.prepare("SELECT text FROM steps WHERE recipe_id = ? ORDER BY position").bind(id)
  ]);
  const ingLines: string[] = [];
  let section: string | null = null;
  for (const i of (ings?.results ?? []) as { section: string | null; original_text: string }[]) {
    if (i.section !== section) {
      section = i.section;
      if (section) ingLines.push(`${section}:`);
    }
    ingLines.push(i.original_text);
  }
  const stepLines = ((steps?.results ?? []) as { text: string }[]).map((s, n) => `${n + 1}. ${s.text}`);
  if (!ingLines.length && !stepLines.length && !recipe.notes && !recipe.summary) {
    return c.json({ error: "There's no text to tidy. If it's a photo, use “Read recipe from photo”." }, 400);
  }
  const text = [
    `Title: ${recipe.title}`,
    recipe.summary && `Description: ${recipe.summary}`,
    [recipe.servings && `Serves: ${recipe.servings}`, recipe.prep_minutes && `Prep: ${recipe.prep_minutes} min`, recipe.cook_minutes && `Cook: ${recipe.cook_minutes} min`].filter(Boolean).join(", "),
    `Ingredients:\n${ingLines.join("\n") || "(none)"}`,
    `Method:\n${stepLines.join("\n") || "(none)"}`,
    recipe.notes && `Notes:\n${recipe.notes}`
  ]
    .filter(Boolean)
    .join("\n\n");
  try {
    return c.json(await runAi(c.env, { task: "tidy", system: `${TIDY_SYSTEM}\n\n${await tagLists(db)}`, text: `Tidy up this recipe:\n\n${text.slice(0, 60000)}` }));
  } catch (e) {
    return aiFailure(c, e);
  }
});

const NUTRITION_SYSTEM = `You work out nutrition per serving for home recipes.
If the recipe text already states nutrition per serving (often in the notes, e.g. "Calories: 205kcal"), use those figures and set source to "recipe".
Otherwise estimate from the ingredients and quantities using standard food composition data, divide by the number of servings, and set source to "estimate".
If the servings aren't given, assume a sensible number for the dish and say so in note.
Net carbs are total carbohydrate minus fibre minus sugar alcohols (erythritol, allulose and similar count fully; maltitol about half). Round calories to whole numbers and grams to one decimal.
Set ok to false only if there's nothing to go on (no ingredients).`;

/** POST /api/ai/nutrition/:id: work out nutrition per serving and save it on the recipe. */
ai.post("/nutrition/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  const r = await db.prepare("SELECT title, servings, notes FROM recipes WHERE id = ?").bind(id).first<{ title: string; servings: number | null; notes: string | null }>();
  if (!r) return c.json({ error: "Not found" }, 404);
  const { results: ings } = await db.prepare("SELECT original_text FROM recipe_ingredients WHERE recipe_id = ? ORDER BY position").bind(id).all<{ original_text: string }>();
  if (!ings.length) return c.json({ error: "Add the ingredients first." }, 400);
  const text = [
    `Recipe: ${r.title}`,
    `Servings: ${r.servings ?? "not given"}`,
    `Ingredients:\n${ings.map((i) => i.original_text).join("\n")}`,
    r.notes && `Notes:\n${r.notes.slice(0, 6000)}`
  ]
    .filter(Boolean)
    .join("\n\n");
  try {
    const { answer } = await askAi(c.env, { task: "nutrition", system: NUTRITION_SYSTEM, text }, NutritionSchema);
    if (!answer.ok) return c.json({ error: answer.note || "Couldn't work out the nutrition for this one." }, 422);
    await db.prepare("UPDATE recipes SET nutrition = ?, nutrition_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(JSON.stringify(answer), id).run();
    return c.json(answer);
  } catch (e) {
    return aiFailure(c, e);
  }
});

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

/**
 * POST /api/ai/find { query }: look for recipes on the web, plus any already
 * in the collection that match.
 */
ai.post("/find", async (c) => {
  const body = await c.req.json<{ query?: unknown }>().catch(() => ({}) as { query?: unknown });
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) return c.json({ error: "What are you looking for?" }, 400);
  if (query.length > 200) return c.json({ error: "Please keep it under 200 characters" }, 400);
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2).slice(0, 5);
  const { results: mine } = words.length
    ? await c.env.DB.prepare(
        `SELECT id, title FROM recipes WHERE ${words.map(() => "title LIKE ?").join(" AND ")} ORDER BY title LIMIT 5`
      )
        .bind(...words.map((w) => `%${w}%`))
        .all<{ id: string; title: string }>()
    : { results: [] as { id: string; title: string }[] };
  try {
    return c.json({ ...(await findRecipesOnline(c.env, query)), mine });
  } catch (e) {
    if (e instanceof AiError) return c.json({ error: e.message, mine, searchUrl: `https://www.google.com/search?q=${encodeURIComponent(`${query} recipe`)}` }, e.status);
    throw e;
  }
});
