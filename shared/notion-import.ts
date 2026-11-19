import { FOLDER_COURSES, guessCategories } from "./categorize";

/**
 * Turns a Notion "Markdown & CSV" export into recipes ready to import.
 *
 * Notion pages are free-form, so this works by reading headings
 * ("Ingredients", "Method", "Notes"...) and falls back to guessing from the
 * shape of each line. Anything it is unsure about is listed in `warnings` so it
 * can be checked in the app afterwards. Nothing here touches the network.
 */

export interface ImportStep {
  text: string;
  /** Path of a photo inside the export, or an http(s) image link. */
  image?: string;
}

export interface ImportRecipe {
  /** Stable id from the export (the Notion page id), used to skip re-imports. */
  key: string;
  title: string;
  sourceName: string | null;
  sourceUrl: string | null;
  summary: string | null;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  tags: string[];
  ingredientsText: string;
  steps: ImportStep[];
  notes: string | null;
  /** Path of a photo inside the export, or an http(s) image link. */
  heroImage: string | null;
  warnings: string[];
}

export interface ExportFile {
  path: string;
  text: string;
}

const ID_RE = /\s([0-9a-f]{32})$/i;

/** "Keto ddf3...b9b.md" -> { name: "Keto", id: "ddf3...b9b" } */
function splitName(base: string): { name: string; id: string | null } {
  const m = base.match(ID_RE);
  return m ? { name: base.slice(0, m.index).trim(), id: m[1]!.toLowerCase() } : { name: base.trim(), id: null };
}

const dirOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const stripMd = (p: string) => p.replace(/\.md$/i, "");
/** Folder holding a page's subpages and photos: same name, with or without the page id. */
const folderKeys = (p: string) => {
  const base = stripMd(p);
  const noId = base.replace(ID_RE, "");
  return noId === base ? [base] : [base, noId];
};

/** Resolve a (URL-encoded) relative link from a page against the page's folder. */
export function resolveLink(fromPath: string, link: string): string {
  let target = link;
  try {
    target = decodeURIComponent(link);
  } catch {
    /* keep as written */
  }
  const parts = (dirOf(fromPath) ? dirOf(fromPath).split("/") : []).concat(target.split("/"));
  const out: string[] = [];
  for (const p of parts) {
    if (p === "" || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/").normalize("NFC");
}

/** Text cleanup for one line: links become their text, emphasis markers go. */
function plain(line: string): string {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$|[.,;:!?])/g, "$1$2")
    .replace(/\\([|*_#\[\]()-])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanTitle(raw: string): { title: string; sourceName: string | null } {
  let t = plain(raw)
    .replace(/^recipe:\s*/i, "")
    .replace(/^AD\//, "")
    .replace(/[.\s]+$/, "")
    .trim();
  let sourceName: string | null = null;
  const bar = t.split(/\s+\|\s+/);
  if (bar.length > 1) {
    sourceName = bar[bar.length - 1]!.trim() || null;
    t = bar[0]!.trim();
  }
  if (t === t.toUpperCase() && /[A-Z]{3}/.test(t)) {
    t = t.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
  }
  return { title: t || raw.trim(), sourceName };
}

type Mode = "intro" | "ingredients" | "steps" | "notes" | "skip";

const HEAD_INGREDIENTS = /ingredient|what you('ll)? need|you will need|^you('ll)? need|shopping list/i;
const HEAD_STEPS = /\b(method|directions?|instructions?|steps?|how to make( it)?|preparation|to make|procedure)\b/i;
const HEAD_NOTES = /^(notes?|tips?|recipe notes|nutrition|nutrition facts|storage|to store|variations?|serving suggestions?|faq)\b/i;
const HEAD_SKIP = /did you make|^rate\b|reviews?|comments?|you may also like|related|more recipes|^share|^print|^video|^equipment|^watch/i;
const JUNK_LINE = /^(\||total( time)?\s*:?\s*\d|select all ingredients|rate now|print( recipe)?|pin( recipe)?|jump to recipe|save recipe|\d+\s+people made this|tell us what you think.*)$/i;
const SERVES = /^(serves|servings|makes|yield|yields)(?=\W|\d|$)[:\s]*(\d+)?/i;
const TIME = /^(prep|preparation|cook|cooking|bake|baking)(\s*time)?\s*:?\s*(\d+)\s*(h|hrs?|hours?|m|mins?|minutes?)?(\b|$)/i;
const STEP_PREFIX = /^(\d+[.)]\s+|step\s*\d+\s*[:.)–—-]?\s*|-\s+|\*\s+|•\s*)/i;
const AMOUNT_ONLY =
  /^[\d½⅓⅔¼¾⅛⅜⅝⅞.,/\s-]+((cups?|c|tablespoons?|tbsps?|tbs|teaspoons?|tsps?|g|gr|grams?|kg|ml|l|litres?|liters?|oz|ounces?|lb|lbs|pounds?|pinch|handful|cloves?|cans?|tins?|large|small|medium)\b[\s/.\d½⅓⅔¼¾-]*)*$/i;
const STARTS_WITH_AMOUNT = /^([\d½⅓⅔¼¾⅛]|a (pinch|handful|few|dash)\b|one |two |three |half |pinch )/i;
const STEP_VERB =
  /^(preheat|pre-heat|heat|place|add|mix|combine|stir|bake|cook|whisk|beat|pour|grab|cut|serve|put|bring|remove|transfer|line|grease|in a |in the |melt|blend|roll|let|allow|spread|sprinkle|season|fry|simmer|boil|chop|pop|chuck|make|prepare|toss|fold|cream|sift|set|using|once|when|after|then|meanwhile|divide|press|scoop|spoon|top|drizzle|refrigerate|chill|freeze|store|leave|return|repeat|turn|flip|wrap|knead|shape|form|brush|garnish|enjoy)\b/i;

/** Is this short line an ingredient rather than an instruction? */
function looksLikeIngredient(text: string): boolean {
  if (STEP_VERB.test(text)) return false;
  if (text.length > 100) return false;
  const words = text.split(/\s+/).length;
  if (/[.!]$/.test(text) && words > 8) return false;
  return true;
}
const looksLikeStep = (text: string) => STEP_VERB.test(text) || text.length > 100 || (/[.!]$/.test(text) && text.split(/\s+/).length > 8);

interface Line {
  raw: string;
  text: string;
  images: string[];
  heading: string | null;
  level: number;
  list: "bullet" | "number" | null;
}

/** Markdown link/image target, allowing one level of brackets inside (Notion paths have them). */
const TARGET = String.raw`((?:[^()\s]|\([^()]*\))+)`;
const IMAGE_RE = new RegExp(String.raw`!\[[^\]]*\]\(` + TARGET + String.raw`(?:\s+"[^"]*")?\)`, "g");
const ONLY_LINK_RE = new RegExp(String.raw`^\s*(?:[-*•]\s+)?\[([^\]]*)\]\(` + TARGET + String.raw`\)\s*$`);

function readLines(md: string, pagePath: string, files: Set<string>): Line[] {
  const lines: Line[] = [];
  const prepared = md
    // Text pasted into Notion sometimes wraps mid-sentence onto lines starting with a space.
    .replace(/\r?\n (?=[^\s\-*•\d])/g, " ")
    // "**INSTRUCTIONS**Preheat the oven..." -> heading, then text.
    .replace(/^(\*\*([^*\n]{1,30})\*\*)(?=\S)/gm, (m, all: string, inner: string) =>
      classifyHeading(inner) ? `${all}\n\n` : m
    );
  for (const raw of prepared.split(/\r?\n/)) {
    const images: string[] = [];
    for (const m of raw.matchAll(IMAGE_RE)) {
      const src = m[1]!.trim();
      if (/^https?:\/\//i.test(src)) images.push(src);
      else {
        const p = resolveLink(pagePath, src);
        if (files.has(p)) images.push(p);
      }
    }
    const trimmed = raw.replace(IMAGE_RE, "").trim();
    let heading: string | null = null;
    let level = 9;
    const hm = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (hm) {
      heading = plain(hm[2]!);
      level = hm[1]!.length;
    } else {
      const bm = trimmed.match(/^(?:[-*]\s+)?(\*{1,3}|_{1,3})([^*_]{1,60})\1:?$/);
      // **Bold** lines are headings; *italic* ones only when they name a section.
      if (bm && (bm[1]!.length > 1 || classifyHeading(bm[2]!))) {
        heading = plain(bm[2]!);
        level = 4;
      }
    }
    const list: Line["list"] = /^\s*\d+[.)]\s+/.test(raw) ? "number" : /^\s*[-*•]\s+/.test(raw) ? "bullet" : null;
    const text = plain(
      trimmed
        .replace(/^#{1,6}\s+/, "")
        .replace(/^[-*•]\s+(\[[ x]\]\s+)?/i, "")
        .replace(/^\d+[.)]\s+/, "")
    );
    lines.push({ raw, text, images, heading, level, list });
  }
  return lines;
}

/** Short "For the sauce:"-style line that starts a group inside a section. */
const isSubheading = (text: string) => /^[^\d½¼¾].{0,48}:$/.test(text) && !/https?:/.test(text);

function classifyHeading(h: string): Mode | null {
  const t = h.replace(/:$/, "").trim();
  if (t.length > 60) return null;
  if (HEAD_SKIP.test(t)) return "skip";
  if (HEAD_NOTES.test(t)) return "notes";
  if (HEAD_INGREDIENTS.test(t)) return "ingredients";
  if (HEAD_STEPS.test(t)) return "steps";
  return null;
}

function hostName(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

const toMinutes = (n: number, unit: string | undefined) => (unit && /^h/i.test(unit) ? n * 60 : n);

export type ParsedPage = Omit<ImportRecipe, "key" | "title" | "sourceName" | "tags"> & {
  prepMinutes: number | null;
  cookMinutes: number | null;
  linkName: string | null;
};

/** Parse one recipe page (without its "# Title" line). */
export function parseRecipePage(md: string, pagePath: string, files: Set<string>): ParsedPage {
  // The web clipper puts the recipe card in an <aside>; what follows it is the blog post.
  const aside = md.match(/<aside>([\s\S]*?)<\/aside>/i);
  if (aside && /ingredient/i.test(aside[1]!)) {
    const before = md.slice(0, aside.index);
    const after = md.slice(aside.index! + aside[0].length);
    const firstImage = after.match(IMAGE_RE)?.[0] ?? "";
    md = `${before}\n${firstImage}\n${aside[1]}`;
  }
  const warnings: string[] = [];
  let sourceUrl: string | null = null;
  let linkName: string | null = null;
  let servings: number | null = null;
  let prepMinutes: number | null = null;
  let cookMinutes: number | null = null;
  let hero: string | null = null;
  const intro: string[] = [];
  const ingredients: string[] = [];
  const steps: ImportStep[] = [];
  const notes: string[] = [];
  const looseImages: string[] = [];
  let mode: Mode = "intro";
  /** True when an "Ingredients" heading started the list (so long lines stay ingredients). */
  let headedIngredients = false;
  /** Once a recipe's method is complete, later blog content is skipped. */
  let done = false;
  let stepsLevel = 9;
  let pendingStepImage: string | undefined;
  let pendingAmount: string | null = null;
  let stepGroup: string | null = null;
  let lastWasStepTitle = false;

  const addStep = (raw: string) => {
    let t = raw.replace(STEP_PREFIX, "").trim();
    if (!t) return;
    if (stepGroup) {
      t = `${stepGroup}: ${t}`;
      stepGroup = null;
    }
    steps.push({ text: t, ...(pendingStepImage ? { image: pendingStepImage } : {}) });
    pendingStepImage = undefined;
  };

  for (const line of readLines(md, pagePath, files)) {
    for (const img of line.images) {
      if (!hero && mode !== "steps") hero = img;
      else if (mode === "steps" && !done) {
        const last = steps[steps.length - 1];
        if (last && !last.image) last.image = img;
        else pendingStepImage = img;
      } else looseImages.push(img);
    }
    const text = line.text;
    if (!text || JUNK_LINE.test(text)) continue;

    if (mode === "intro") {
      const src = text.match(/^(url|source|link|original( recipe)?|from)\s*:\s*(https?:\/\/\S+)/i);
      if (src) {
        sourceUrl ??= src[3]!;
        continue;
      }
      if (/^https?:\/\/\S+$/.test(text)) {
        sourceUrl ??= text;
        continue;
      }
      const only = line.raw.match(ONLY_LINK_RE);
      if (only && /^https?:/i.test(only[2]!)) {
        // A lone link at the top is the original recipe; jump links ("17 Ingredients") are dropped.
        if (!sourceUrl && !line.list) {
          sourceUrl = only[2]!;
          linkName = plain(only[1]!) || null;
        }
        continue;
      }
      if (/^(created|tags|last edited( time)?|date|category)\s*:/i.test(text)) continue;
    }

    if (/^📋/u.test(text)) continue;
    const meta = text.replace(/[*_]/g, "");
    if (
      (mode === "intro" || mode === "ingredients") &&
      meta.length < 200 &&
      (/^(yield|prep time|cook time)\b/i.test(meta) || /(prep|cook) time\s*:?\s*\d/i.test(meta))
    ) {
      const t = meta;
      const y = t.match(/yield\s*:?\s*(\d+)/i) ?? t.match(/(\d+)\s*servings/i);
      const pm = t.match(/prep(?:aration)? time\s*:?\s*(\d+)\s*(h|hours?|m|mins?|minutes?)/i);
      const cm = t.match(/cook(?:ing)? time\s*:?\s*(\d+)\s*(h|hours?|m|mins?|minutes?)/i);
      if (y) servings ??= Number(y[1]);
      if (pm) prepMinutes ??= toMinutes(Number(pm[1]), pm[2]!);
      if (cm) cookMinutes ??= toMinutes(Number(cm[1]), cm[2]!);
      continue;
    }
    const time = text.match(TIME);
    if (time && text.length < 40 && (mode === "intro" || mode === "ingredients")) {
      const mins = toMinutes(Number(time[3]), time[4]!);
      if (/^prep/i.test(time[1]!)) prepMinutes ??= mins;
      else cookMinutes ??= mins;
      continue;
    }

    const plainSection = !line.list && text.length <= 50 && !/:\s*\S/.test(text) && !STARTS_WITH_AMOUNT.test(text) && classifyHeading(text);
    const headingText =
      line.heading ?? (plainSection ? text : null) ?? (isSubheading(text) && !line.list ? text : null);
    if (headingText) {
      const kind = classifyHeading(headingText);
      if (done) {
        mode = kind === "notes" ? "notes" : "skip";
        continue;
      }
      // A same-or-higher level heading after the method ends the recipe part of a clipped page.
      if (mode === "steps" && steps.length && kind !== "steps" && line.level <= stepsLevel) {
        done = true;
        mode = kind === "notes" ? "notes" : "skip";
        continue;
      }
      if (kind) {
        if (kind === "ingredients" && ingredients.length && steps.length) {
          done = true;
          mode = "skip";
          continue;
        }
        if (kind === "steps") stepsLevel = line.level;
        if (kind === "ingredients") headedIngredients = true;
        if (kind === "notes" && steps.length) done = true;
        mode = kind;
        stepGroup = null;
        continue;
      }
      if (mode === "ingredients") {
        ingredients.push(`${headingText.replace(/:$/, "")}:`);
        continue;
      }
      if (mode === "steps") {
        stepGroup = headingText.replace(/:$/, "");
        continue;
      }
      if (mode === "skip") continue;
      (mode === "notes" ? notes : intro).push(headingText);
      continue;
    }
    if (mode === "skip") continue;

    const serves = text.match(SERVES);
    if (serves && (mode === "ingredients" || mode === "intro") && text.length < 80) {
      if (serves[2] && /^serv/i.test(serves[1]!)) servings ??= Number(serves[2]);
      else intro.push(text);
      continue;
    }

    // Pages without headings: the first amount-led line starts the ingredients.
    if (mode === "intro") {
      if (line.list === "number" && !looksLikeIngredient(text)) {
        mode = "steps";
      } else if (STARTS_WITH_AMOUNT.test(text) && looksLikeIngredient(text)) {
        mode = "ingredients";
      }
    }
    // An instruction straight after the ingredients means the method has started.
    if (
      mode === "ingredients" &&
      !pendingAmount &&
      ingredients.length &&
      (headedIngredients ? line.list !== "bullet" && STEP_VERB.test(text) : looksLikeStep(text))
    )
      mode = "steps";

    if (
      mode === "steps" &&
      steps.length &&
      /^(nutrition|energy|calories|protein|total fat|saturated fat|carbohydrates?|sugars?|sodium|dietary fib|fibre|fiber|cholesterol)\b/i.test(text) &&
      text.length < 40
    ) {
      done = true;
      mode = "notes";
    }

    switch (mode) {
      case "ingredients":
        // Web-clipped pages often split "2 tablespoons" and "chia seeds" over two lines.
        if (pendingAmount) {
          ingredients.push(`${pendingAmount} ${text}`);
          pendingAmount = null;
        } else if (AMOUNT_ONLY.test(text)) pendingAmount = text;
        else ingredients.push(text);
        break;
      case "steps": {
        // "2. Mix the filling:" followed by its text on the next line belongs together.
        const last = steps[steps.length - 1];
        if (last && lastWasStepTitle && line.list !== "number" && !/^step\s*\d/i.test(text)) {
          last.text = `${last.text.replace(/:$/, "")}: ${text}`;
          lastWasStepTitle = false;
        } else {
          const before = steps.length;
          addStep(text);
          const added = steps.length > before ? steps[steps.length - 1]! : null;
          // "Step 1: Rice the cauliflower" or "2. Mix the filling:" titles the text that follows.
          lastWasStepTitle =
            !!added &&
            /:$/.test(added.text) ||
            !!added && (/^step\s*\d/i.test(text) && added.text.length < 50 && !/[.!]$/.test(added.text));
        }
        break;
      }
      case "notes":
        notes.push(text);
        break;
      default:
        intro.push(text);
    }
  }
  if (pendingAmount) ingredients.push(pendingAmount);
  if (pendingStepImage) looseImages.push(pendingStepImage);

  if (!ingredients.length && !steps.length && hero && !intro.length) {
    warnings.push("The recipe is only in the photo");
  } else {
    if (!ingredients.length) warnings.push("No ingredients found");
    if (!steps.length) warnings.push(ingredients.length || !sourceUrl ? "No method found" : "Only a link to the original recipe");
  }
  if (looseImages.length) warnings.push(`${looseImages.length} extra photo(s) not imported`);

  let summary = intro.join("\n").trim();
  if (summary.length > 1500) {
    notes.unshift(summary);
    summary = "";
    warnings.push("Long introduction moved to notes");
  }
  return {
    sourceUrl,
    linkName,
    summary: summary || null,
    servings,
    prepMinutes,
    cookMinutes,
    ingredientsText: ingredients.join("\n"),
    steps,
    notes: notes.join("\n").trim().slice(0, 10000) || null,
    heroImage: hero,
    warnings
  };
}

const DIET_HINTS: [RegExp, string][] = [
  [/\bketo\b|low[- ]carb/i, "Keto"],
  [/gluten[- ]free/i, "Gluten free"],
  [/\bvegan\b/i, "Vegan"],
  [/vegetarian/i, "Vegetarian"],
  [/dairy[- ]free/i, "Dairy free"]
];

/**
 * Parse a whole export. `files` holds every markdown page; `assets` is the set
 * of every other file path in the export (photos).
 */
export function parseNotionExport(pages: ExportFile[], assets: Set<string>): ImportRecipe[] {
  const byDir = new Map<string, ExportFile>();
  for (const p of pages) for (const k of folderKeys(p.path)) byDir.set(k, p);
  const hasChildren = (p: ExportFile) => pages.some((q) => folderKeys(p.path).includes(dirOf(q.path)));
  const parentOf = (p: ExportFile) => byDir.get(dirOf(p.path));
  const depth = (p: string) => p.split("/").length;
  const rootDepth = Math.min(...pages.map((p) => depth(p.path)));

  // "Keto:" style group lines on a category page tag the pages listed under them.
  const groupTags = new Map<string, string>();
  for (const p of pages) {
    if (!hasChildren(p)) continue;
    let group: string | null = null;
    for (const raw of p.text.split(/\r?\n/)) {
      const t = plain(raw);
      if (/^[^[\]()]{2,30}:$/.test(t)) group = t.slice(0, -1);
      else if (!t) continue;
      const link = raw.match(new RegExp(String.raw`\[[^\]]*\]\(` + TARGET + String.raw`\)`));
      if (link && /\.md$/i.test(link[1]!) && group && DIET_HINTS.some(([re]) => re.test(group!))) {
        groupTags.set(resolveLink(p.path, link[1]!), DIET_HINTS.find(([re]) => re.test(group!))![1]);
      }
    }
  }

  const recipes: ImportRecipe[] = [];
  for (const page of pages) {
    const lines = page.text.split(/\r?\n/);
    const titleIdx = lines.findIndex((l) => /^#\s+/.test(l));
    const base = page.path.split("/").pop()!.replace(/\.md$/i, "");
    const { name, id } = splitName(base);
    const rawTitle = titleIdx >= 0 ? lines[titleIdx]!.replace(/^#\s+/, "") : name;
    const body = lines.filter((_, i) => i !== titleIdx).join("\n");
    const children = hasChildren(page);
    const isRoot = depth(page.path) === rootDepth;
    // Rows of a table inside a page (e.g. nutrition) have no parent page: skip them.
    if (!isRoot && !parentOf(page)) continue;

    // A category page is only imported if it has real content of its own.
    const ownText = body
      .split(/\r?\n/)
      .filter((l) => !ONLY_LINK_RE.test(l))
      .map(plain)
      .join(" ");
    if (isRoot) continue;
    if (children && ownText.replace(/[^a-z]/gi, "").length < 200) continue;

    const { linkName: _linkName, ...parsed } = parseRecipePage(body, page.path, assets);
    const { title, sourceName } = cleanTitle(rawTitle);

    const tags = new Set<string>();
    for (let a = parentOf(page); a && parentOf(a); a = parentOf(a)) {
      const cat = cleanTitle(splitName(stripMd(a.path).split("/").pop()!).name).title;
      const course = FOLDER_COURSES[cat.toLowerCase()];
      if (course) tags.add(course);
      else tags.add(/^keto$/i.test(cat) ? "Keto" : cat);
    }
    const group = groupTags.get(page.path);
    if (group) tags.add(group);
    for (const [re, tag] of DIET_HINTS) if (re.test(rawTitle)) tags.add(tag);
    const guess = guessCategories(title, `${sourceName ?? ""} ${parsed.summary ?? ""}`);
    if (guess.course && ![...tags].some((t) => Object.values(FOLDER_COURSES).includes(t))) tags.add(guess.course);
    if (guess.cuisine) tags.add(guess.cuisine);

    recipes.push({
      key: `notion:${id ?? stripMd(page.path)}`,
      title,
      sourceName: sourceName ?? hostName(parsed.sourceUrl),
      tags: [...tags],
      ...parsed
    });
  }
  return recipes.sort((a, b) => a.title.localeCompare(b.title));
}
