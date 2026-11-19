/**
 * Reads a recipe out of a web page's HTML. Most recipe sites publish a
 * schema.org "Recipe" block (JSON-LD) for search engines; this uses that, and
 * falls back to the page's title, description and preview image.
 */

export interface WebRecipe {
  title: string;
  summary: string | null;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  ingredientsText: string;
  steps: string[];
  imageUrl: string | null;
  sourceName: string | null;
  sourceUrl: string;
  /** Category / cuisine / keyword hints from the page, for tagging. */
  hints: string[];
  /** False when only the page title and photo were found. */
  complete: boolean;
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", frac12: "½", frac14: "¼", frac34: "¾",
  deg: "°", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", eacute: "é"
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Strip tags, decode entities and tidy whitespace. */
export function cleanText(s: unknown): string {
  if (typeof s !== "string") return "";
  return decodeEntities(decodeEntities(s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")))
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** "PT1H30M" -> 90 */
export function isoMinutes(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = v.match(/^P(?:(\d+)D)?T?(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+)S)?$/i);
  if (!m) return null;
  const mins = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) + Math.round(Number(m[4] ?? 0) / 60);
  return mins > 0 ? Math.round(mins) : null;
}

const asArray = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

function isRecipe(node: Record<string, unknown>): boolean {
  return asArray(node["@type"] as string | string[]).some((t) => typeof t === "string" && /(^|\/)Recipe$/i.test(t));
}

/** Find the first Recipe object anywhere in a JSON-LD value (arrays, @graph, mainEntity...). */
function findRecipe(v: unknown, depth = 0): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || depth > 6) return null;
  if (Array.isArray(v)) {
    for (const x of v) {
      const r = findRecipe(x, depth + 1);
      if (r) return r;
    }
    return null;
  }
  const o = v as Record<string, unknown>;
  if (isRecipe(o)) return o;
  for (const key of ["@graph", "mainEntity", "mainEntityOfPage", "itemListElement", "item"]) {
    const r = findRecipe(o[key], depth + 1);
    if (r) return r;
  }
  return null;
}

function imageOf(v: unknown): string | null {
  for (const x of asArray(v as unknown[])) {
    if (typeof x === "string" && /^https?:\/\//.test(x)) return x;
    if (x && typeof x === "object") {
      const u = (x as Record<string, unknown>).url ?? (x as Record<string, unknown>).contentUrl;
      if (typeof u === "string" && /^https?:\/\//.test(u)) return u;
    }
  }
  return null;
}

/** Flatten recipeInstructions (text, HowToStep, HowToSection) into step texts. */
function instructionsOf(v: unknown): string[] {
  const out: string[] = [];
  const walk = (x: unknown, section: string | null) => {
    if (typeof x === "string") {
      for (const part of cleanText(x).split(/\n+/)) {
        const t = part.replace(/^\d+[.)]\s+/, "").trim();
        if (t) out.push(section ? `${section}: ${t}` : t);
      }
      section = null;
      return;
    }
    if (Array.isArray(x)) {
      x.forEach((y, i) => walk(y, i === 0 ? section : null));
      return;
    }
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      const types = asArray(o["@type"] as string | string[]);
      if (types.includes("HowToSection")) {
        walk(o.itemListElement, cleanText(o.name) || null);
        return;
      }
      walk(o.text ?? o.name ?? o.itemListElement, section);
    }
  };
  walk(v, null);
  return out;
}

function servingsOf(v: unknown): number | null {
  for (const x of asArray(v as unknown[])) {
    const m = String(x ?? "").match(/\d+(\.\d+)?/);
    if (m) return Number(m[0]);
  }
  return null;
}

function meta(html: string, name: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`,
    "i"
  );
  const m = html.match(re);
  const v = m?.[1] ?? m?.[2];
  return v ? cleanText(v) : null;
}

function siteName(html: string, url: string): string | null {
  const og = meta(html, "og:site_name");
  if (og) return og;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function parseRecipeHtml(html: string, url: string): WebRecipe {
  let recipe: Record<string, unknown> | null = null;
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      recipe = findRecipe(JSON.parse(m[1]!.trim()));
    } catch {
      // Some sites put stray control characters in their JSON; try once more without them.
      try {
        recipe = findRecipe(JSON.parse(m[1]!.replace(/[\u0000-\u001f]+/g, " ")));
      } catch {
        recipe = null;
      }
    }
    if (recipe) break;
  }

  const pageTitle = meta(html, "og:title") ?? cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const base = {
    sourceName: siteName(html, url),
    sourceUrl: url,
    imageUrl: meta(html, "og:image")
  };

  if (!recipe) {
    return {
      ...base,
      title: pageTitle || url,
      summary: meta(html, "og:description") ?? meta(html, "description"),
      servings: null,
      prepMinutes: null,
      cookMinutes: null,
      ingredientsText: "",
      steps: [],
      hints: [],
      complete: false
    };
  }

  const ingredients = asArray(recipe.recipeIngredient ?? recipe.ingredients)
    .map((x) => cleanText(x).replace(/\n+/g, " "))
    .filter(Boolean);
  const hints = [
    ...asArray(recipe.recipeCategory as string | string[]),
    ...asArray(recipe.recipeCuisine as string | string[]),
    ...asArray(recipe.suitableForDiet as string | string[]).map((d) => String(d).replace(/^.*\//, "").replace(/Diet$/, "")),
    ...(typeof recipe.keywords === "string" ? recipe.keywords.split(",") : asArray(recipe.keywords as string[]))
  ]
    .map((h) => cleanText(h))
    .filter((h) => h && h.length < 40);

  return {
    ...base,
    title: cleanText(recipe.name) || pageTitle || url,
    summary: cleanText(recipe.description) || null,
    servings: servingsOf(recipe.recipeYield),
    prepMinutes: isoMinutes(recipe.prepTime),
    cookMinutes: isoMinutes(recipe.cookTime) ?? (isoMinutes(recipe.totalTime) && !isoMinutes(recipe.prepTime) ? isoMinutes(recipe.totalTime) : null),
    ingredientsText: ingredients.join("\n"),
    steps: instructionsOf(recipe.recipeInstructions),
    imageUrl: imageOf(recipe.image) ?? base.imageUrl,
    hints,
    complete: ingredients.length > 0
  };
}

/** Pull the first web link out of shared text ("Look at this! https://...") */
export function firstUrl(text: string | null | undefined): string | null {
  const m = text?.match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[),.;!?]+$/, "") : null;
}
