import { useEffect, useMemo, useState } from "react";
import { groceryItems, ingredientLinks, linkIngredient } from "../api";

type Link = { name: string; grocery_item: string | null; manual: number; recipes: number };

/** Which grocery item each recipe ingredient is bought as, for the pantry check and costs. */
export function Links() {
  const [links, setLinks] = useState<Link[] | null>(null);
  const [grocery, setGrocery] = useState<string[]>([]);
  const [filter, setFilter] = useState<"unlinked" | "all">("unlinked");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () => ingredientLinks().then(setLinks).catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
    groceryItems().then((g) => setGrocery(g.map((x) => x.item))).catch(() => {});
  }, []);

  const shown = useMemo(
    () =>
      (links ?? []).filter((l) => (filter === "all" || !l.grocery_item) && (!q || l.name.toLowerCase().includes(q.toLowerCase()))),
    [links, filter, q]
  );

  const save = async (name: string, value: string) => {
    const v = value.trim();
    const target = v === "" ? "auto" : v === "-" ? null : grocery.find((g) => g.toLowerCase() === v.toLowerCase()) ?? null;
    if (v && v !== "-" && !target) {
      setError(`"${v}" isn't in the grocery sheet. Pick one from the list.`);
      return;
    }
    setError(null);
    await linkIngredient(name, target).catch((e: Error) => setError(e.message));
    void load();
  };

  return (
    <section className="form">
      <a className="back" href="#/settings">← Settings</a>
      <h1>Ingredient matching</h1>
      <p className="muted">
        Each recipe ingredient is matched to an item in your grocery sheet so the app knows if you have it and what it costs. Most are matched
        automatically; fix or add any here. Leave a box empty to match automatically, or type "-" for "not something I buy".
      </p>
      <div className="row between filter-row">
        <div className="segmented" role="group">
          <button className={filter === "unlinked" ? "on" : ""} onClick={() => setFilter("unlinked")}>Not matched</button>
          <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>All</button>
        </div>
        <input className="search-small" type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && <p className="error">{error}</p>}
      <datalist id="grocery-items">
        {grocery.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      {!links && <p className="muted">Loading…</p>}
      <ul className="link-list">
        {shown.slice(0, 300).map((l) => (
          <li key={`${l.name}:${l.grocery_item}:${l.manual}`}>
            <span className="grow">
              {l.name} <span className="muted small">· {l.recipes} recipe{l.recipes === 1 ? "" : "s"}</span>
            </span>
            <input
              list="grocery-items"
              defaultValue={l.grocery_item ?? (l.manual ? "-" : "")}
              placeholder="grocery item"
              onBlur={(e) => {
                const before = l.grocery_item ?? (l.manual ? "-" : "");
                if (e.target.value.trim() !== before) void save(l.name, e.target.value);
              }}
            />
          </li>
        ))}
      </ul>
      {shown.length > 300 && <p className="muted small">Showing 300 of {shown.length}. Search to find others.</p>}
    </section>
  );
}
