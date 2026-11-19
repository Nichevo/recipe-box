import { useEffect, useState } from "react";
import { listRecipes, listTags, type RecipeSummary, type Tag } from "./api";

type Tab = "browse" | "pantry" | "add";

export function App() {
  const [tab, setTab] = useState<Tab>("browse");
  return (
    <div className="app">
      <main className="content">
        {tab === "browse" && <Browse />}
        {tab === "pantry" && <ComingSoon title="Pantry" text="Grocery sync and pantry arrive in a later step." />}
        {tab === "add" && <ComingSoon title="Add a recipe" text="Adding recipes arrives in the next step." />}
      </main>
      <nav className="tabs" aria-label="Main">
        {(["browse", "pantry", "add"] as const).map((t) => (
          <button key={t} className={t === tab ? "active" : ""} onClick={() => setTab(t)}>
            {t === "browse" ? "Browse" : t === "pantry" ? "Pantry" : "Add"}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Browse() {
  const [q, setQ] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTags().then(setTags).catch(() => setTags([]));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      listRecipes({ q, tags: selected })
        .then((r) => {
          setRecipes(r);
          setError(null);
        })
        .catch((e: Error) => setError(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [q, selected]);

  const toggle = (name: string) =>
    setSelected((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name]));

  return (
    <section>
      <h1>My recipes</h1>
      <input
        className="search"
        type="search"
        placeholder="Search recipes, ingredients"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="chips">
        {tags
          .filter((t) => t.kind === "diet")
          .map((t) => (
            <button
              key={t.name}
              className={selected.includes(t.name) ? "chip on" : "chip"}
              onClick={() => toggle(t.name)}
            >
              {t.name}
            </button>
          ))}
      </div>
      {error && <p className="muted">Couldn't load recipes ({error}).</p>}
      {recipes && recipes.length === 0 && <p className="muted">No recipes yet.</p>}
      <ul className="cards">
        {recipes?.map((r) => (
          <li key={r.id} className="card">
            <div className="photo" aria-hidden="true" />
            <div className="card-body">
              <strong>{r.title}</strong>
              <span className="muted">
                {[...r.tags, totalTime(r)].filter(Boolean).join(" · ")}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function totalTime(r: RecipeSummary): string | null {
  const total = (r.prep_minutes ?? 0) + (r.cook_minutes ?? 0);
  return total > 0 ? `${total} min` : null;
}

function ComingSoon({ title, text }: { title: string; text: string }) {
  return (
    <section>
      <h1>{title}</h1>
      <p className="muted">{text}</p>
    </section>
  );
}
