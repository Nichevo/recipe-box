import { useEffect, useState } from "react";
import { listRecipes, listTags, photoUrl, type RecipeSummary, type Tag } from "../api";
import { FodmapBadge } from "../components";

export function Browse() {
  const [q, setQ] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [fodmap, setFodmap] = useState("");
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTags().then(setTags).catch(() => setTags([]));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      listRecipes({ q, tags: selected, fodmap })
        .then((r) => {
          setRecipes(r);
          setError(null);
        })
        .catch((e: Error) => setError(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [q, selected, fodmap]);

  const toggle = (name: string) =>
    setSelected((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name]));

  const filterTags = tags.filter((t) => t.kind !== "custom" || selected.includes(t.name));

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
      <div className="chips">
        {filterTags.map((t) => (
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
          {q || selected.length || fodmap ? "No recipes match." : "No recipes yet. Tap + Add to create one."}
        </p>
      )}
      <ul className="cards">
        {recipes?.map((r) => (
          <li key={r.id}>
            <a className="card" href={`#/recipe/${encodeURIComponent(r.id)}`}>
              {r.hero_photo_id ? (
                <img className="photo" src={photoUrl(r.hero_photo_id)} alt="" loading="lazy" />
              ) : (
                <div className="photo" aria-hidden="true" />
              )}
              <div className="card-body">
                <strong>{r.title}</strong>
                <span className="muted small">
                  {[...r.tags, totalTime(r.prep_minutes, r.cook_minutes)].filter(Boolean).join(" · ")}
                </span>
                {r.fodmap_rating && <FodmapBadge rating={r.fodmap_rating} />}
              </div>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function totalTime(prep: number | null, cook: number | null): string | null {
  const total = (prep ?? 0) + (cook ?? 0);
  if (!total) return null;
  return total >= 60 ? `${Math.floor(total / 60)} h ${total % 60 ? `${total % 60} min` : ""}`.trim() : `${total} min`;
}
