import { useEffect, useState } from "react";
import { guessCategories } from "../../shared/categorize";
import { firstUrl, type WebRecipe } from "../../shared/web-recipe";
import { listTags, photoFromUrl, readLink, type Tag } from "../api";
import { setDraft } from "../draft";
import { go } from "../router";

/** Match the page's category/cuisine/diet hints and our own guesses to tags we know. */
function tagsFor(r: WebRecipe, known: Tag[]): string[] {
  const byName = new Map(known.filter((t) => t.kind !== "custom").map((t) => [t.name.toLowerCase(), t.name]));
  const out = new Set<string>();
  const add = (n: string | null | undefined) => {
    const hit = n && byName.get(n.toLowerCase().replace(/s$/, ""));
    if (hit) out.add(hit);
    else if (n && byName.get(n.toLowerCase())) out.add(byName.get(n.toLowerCase())!);
  };
  for (const h of r.hints) {
    add(h);
    if (/main|dinner|entree/i.test(h)) add("Main");
    if (/dessert|sweet|treat/i.test(h)) add("Dessert");
    if (/vegetarian/i.test(h)) add("Vegetarian");
    if (/vegan/i.test(h)) add("Vegan");
    if (/gluten/i.test(h)) add("Gluten free");
    if (/keto|low.?carb/i.test(h)) add("Keto");
  }
  const has = (kind: Tag["kind"]) => known.some((t) => t.kind === kind && out.has(t.name));
  const guess = guessCategories(r.title, r.summary ?? "");
  if (!has("course")) add(guess.course);
  if (!has("cuisine")) add(guess.cuisine);
  return [...out];
}

export function AddLink({ initial }: { initial?: string }) {
  const [url, setUrl] = useState(initial ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<{ id: string; title: string } | null>(null);
  const [found, setFound] = useState<WebRecipe | null>(null);

  const open = async (r: WebRecipe) => {
    setBusy("Copying the photo…");
    let hero: string | null = null;
    if (r.imageUrl) hero = await photoFromUrl(r.imageUrl, "hero").then((p) => p.id).catch(() => null);
    const known = await listTags().catch(() => [] as Tag[]);
    const missing = [
      !r.complete && "Couldn't read the ingredients and method from the website, so add them by hand.",
      r.imageUrl && !hero && "Couldn't copy the photo from the website."
    ].filter(Boolean);
    setDraft({
      title: r.title,
      summary: r.summary,
      servings: r.servings,
      prep_minutes: r.prepMinutes,
      cook_minutes: r.cookMinutes,
      source_url: r.sourceUrl,
      source_name: r.sourceName,
      source_type: "web",
      notes: missing.length ? missing.join(" ") : null,
      hero_photo_id: hero,
      tags: tagsFor(r, known),
      ingredients_text: r.ingredientsText,
      steps: r.steps.map((text) => ({ text }))
    });
    setBusy(null);
    go("#/new");
  };

  const fetchIt = async (raw: string) => {
    const link = firstUrl(raw) ?? raw.trim();
    setError(null);
    setExisting(null);
    setFound(null);
    if (!/^https?:\/\//i.test(link)) {
      setError("Paste a web link starting with https://");
      return;
    }
    setUrl(link);
    setBusy("Reading the recipe…");
    try {
      const res = await readLink(link);
      if (res.existing) {
        setExisting(res.existing);
        setFound(res.recipe);
        setBusy(null);
        return;
      }
      await open(res.recipe);
    } catch (e) {
      setError(`${(e as Error).message}. You can still type the recipe in.`);
      setBusy(null);
    }
  };

  // Opened from the phone's share menu: start straight away.
  useEffect(() => {
    if (initial) void fetchIt(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  return (
    <section className="form">
      <a className="back" href="#/add">← Back</a>
      <h1>Add from a link</h1>
      <p className="muted">Paste the address of a recipe page. The app reads the recipe and fills in the form for you to check.</p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void fetchIt(url);
        }}
      >
        <input
          className="grow"
          type="url"
          inputMode="url"
          placeholder="https://…"
          value={url}
          disabled={!!busy}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button className="button primary" disabled={!!busy || !url.trim()}>
          Get recipe
        </button>
      </form>
      {busy && <p className="muted">{busy}</p>}
      {error && (
        <p className="error">
          {error} <a href="#/new">Type it in</a>
        </p>
      )}
      {existing && found && (
        <div className="notice">
          <p>
            You already have this one: <a href={`#/recipe/${encodeURIComponent(existing.id)}`}>{existing.title}</a>
          </p>
          <button className="button" onClick={() => void open(found)}>
            Add it again anyway
          </button>
        </div>
      )}
      <p className="muted small">
        On an Android phone with the app installed, you can also tap Share on a recipe page and choose Recipe Box.
      </p>
    </section>
  );
}
