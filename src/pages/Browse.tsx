import { useEffect, useState } from "react";
import { listRecipes, listTags, photoUrl, starRecipe, type RecipeSummary, type Tag } from "../api";
import { FodmapBadge, StarButton } from "../components";

export function Browse() {
  const [q, setQ] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [course, setCourse] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [fodmap, setFodmap] = useState("");
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTags().then(setTags).catch(() => setTags([]));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      listRecipes({ q, tags: [...selected, course, cuisine].filter(Boolean), fodmap })
        .then((r) => {
          setRecipes(r);
          setError(null);
        })
        .catch((e: Error) => setError(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [q, selected, course, cuisine, fodmap]);

  const toggle = (name: string) =>
    setSelected((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name]));

  // Only offer filters that match at least one recipe (diet tags always show).
  const used = (t: Tag) => (t.count ?? 0) > 0;
  const chipTags = tags.filter((t) => (t.kind === "diet" || t.kind === "custom") && (t.kind === "diet" || used(t) || selected.includes(t.name)));
  const courses = tags.filter((t) => t.kind === "course" && (used(t) || t.name === course));
  const cuisines = tags.filter((t) => t.kind === "cuisine" && (used(t) || t.name === cuisine));

  const toggleStar = (r: RecipeSummary) => {
    const starred_at = r.starred_at ? null : new Date().toISOString();
    setRecipes((list) => list?.map((x) => (x.id === r.id ? { ...x, starred_at } : x)) ?? null);
    starRecipe(r.id, !!starred_at).catch(() =>
      setRecipes((list) => list?.map((x) => (x.id === r.id ? { ...x, starred_at: r.starred_at } : x)) ?? null)
    );
  };

  // Starred recipes show first, most recently starred at the top.
  const soon = (recipes ?? []).filter((r) => r.starred_at).sort((a, b) => b.starred_at!.localeCompare(a.starred_at!));

  const card = (r: RecipeSummary) => (
    <li key={r.id}>
      <a className="card" href={`#/recipe/${encodeURIComponent(r.id)}`}>
        {r.hero_photo_id ? (
          <img className="photo" src={photoUrl(r.hero_photo_id)} alt="" loading="lazy" />
        ) : (
          <div className="photo" aria-hidden="true" />
        )}
        <div className="card-body">
          <div className="row between nowrap">
            <strong>{r.title}</strong>
            <StarButton compact starred={!!r.starred_at} onToggle={() => toggleStar(r)} />
          </div>
          <span className="muted small">
            {[...r.tags, totalTime(r.prep_minutes, r.cook_minutes)].filter(Boolean).join(" · ")}
          </span>
          {r.fodmap_rating && <FodmapBadge rating={r.fodmap_rating} />}
        </div>
      </a>
    </li>
  );

  return (
    <section>
      <div className="row between">
        <h1>My recipes</h1>
        <a className="button primary" href="#/add">+ Add</a>
      </div>
      <input
        className="search"
        type="search"
        placeholder="Search recipes, ingredients"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="filter-row">
        <select className="chip" value={course} onChange={(e) => setCourse(e.target.value)} aria-label="Meal">
          <option value="">Any meal</option>
          {courses.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name} ({t.count ?? 0})
            </option>
          ))}
        </select>
        <select className="chip" value={cuisine} onChange={(e) => setCuisine(e.target.value)} aria-label="Cuisine">
          <option value="">Any cuisine</option>
          {cuisines.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name} ({t.count ?? 0})
            </option>
          ))}
        </select>
      </div>
      <div className="chips">
        {chipTags.map((t) => (
          <button
            key={t.name}
            className={selected.includes(t.name) ? "chip on" : "chip"}
            onClick={() => toggle(t.name)}
          >
            {t.name}
          </button>
        ))}
        <select className="chip" value={fodmap} onChange={(e) => setFodmap(e.target.value)} aria-label="FODMAP">
          <option value="">Any FODMAP</option>
          <option value="low">FODMAP: low only</option>
          <option value="moderate">FODMAP: low or moderate</option>
        </select>
      </div>
      {error && <p className="muted">Couldn't load recipes ({error}).</p>}
      {recipes && recipes.length === 0 && (
        <p className="muted">
          {q || selected.length || fodmap || course || cuisine ? "No recipes match." : "No recipes yet. Tap + Add to create one."}
        </p>
      )}
      {soon.length > 0 && (
        <>
          <h2 className="section-title">★ Make soon</h2>
          <ul className="cards">{soon.map(card)}</ul>
          <h2 className="section-title">All recipes</h2>
        </>
      )}
      <ul className="cards">{recipes?.map(card)}</ul>
    </section>
  );
}

export function totalTime(prep: number | null, cook: number | null): string | null {
  const total = (prep ?? 0) + (cook ?? 0);
  if (!total) return null;
  return total >= 60 ? `${Math.floor(total / 60)} h ${total % 60 ? `${total % 60} min` : ""}`.trim() : `${total} min`;
}
