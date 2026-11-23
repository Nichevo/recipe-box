import { useEffect, useMemo, useState } from "react";
import { addDays, weekStart } from "../../shared/plan";
import {
  addPlanShopping, addToPlan, getPlan, listRecipes, photoUrl, planShopping, removeFromPlan, updatePlan, whatCanIMake,
  type Makeable, type PlanEntry, type RecipeSummary
} from "../api";

/** Today in the device's time zone, as YYYY-MM-DD. */
export const today = () => new Date().toLocaleDateString("en-CA");

export function dayLabel(d: string, long = false) {
  return new Date(`${d}T12:00:00`).toLocaleDateString(undefined, long ? { weekday: "long", day: "numeric", month: "short" } : { weekday: "short", day: "numeric", month: "short" });
}

/** The next 7 days, for "plan this for…" menus. */
export function nextDays(n = 7) {
  const t = today();
  return Array.from({ length: n }, (_, i) => addDays(t, i));
}

export function PlanPage({ tab }: { tab: "week" | "make" }) {
  return (
    <section className="form">
      <h1>{tab === "week" ? "Meal plan" : "What can I make?"}</h1>
      <div className="segmented page-switch" role="tablist">
        <a role="tab" className={tab === "week" ? "on" : ""} href="#/plan">This week</a>
        <a role="tab" className={tab === "make" ? "on" : ""} href="#/plan/make">What can I make?</a>
      </div>
      {tab === "week" ? <Week /> : <Make />}
    </section>
  );
}

const SERVINGS = [1, 2, 3, 4, 5, 6, 8, 10, 12];

function Week() {
  const [from, setFrom] = useState(() => weekStart(today()));
  const [entries, setEntries] = useState<PlanEntry[] | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(from, i)), [from]);

  useEffect(() => {
    let live = true;
    getPlan(from)
      .then((e) => live && setEntries(e))
      .catch((e: Error) => setError(e.message));
    return () => {
      live = false;
    };
  }, [from, version]);
  const reload = () => setVersion((v) => v + 1);

  const add = async (day: string, r: RecipeSummary) => {
    setPicking(null);
    await addToPlan(day, r.id).catch((e: Error) => setError(e.message));
    reload();
  };
  const remove = async (e: PlanEntry) => {
    setEntries((list) => list?.filter((x) => x.id !== e.id) ?? null);
    await removeFromPlan(e.id).catch((err: Error) => setError(err.message));
    reload();
  };
  const setServings = async (e: PlanEntry, v: string) => {
    await updatePlan(e.id, { servings: v ? Number(v) : null }).catch((err: Error) => setError(err.message));
    reload();
  };
  const move = async (e: PlanEntry, day: string) => {
    await updatePlan(e.id, { day }).catch((err: Error) => setError(err.message));
    reload();
  };

  const t = today();
  return (
    <>
      <div className="row between">
        <button className="button" onClick={() => setFrom(addDays(from, -7))}>← Previous</button>
        <strong>{from === weekStart(t) ? "This week" : `Week of ${dayLabel(from)}`}</strong>
        <button className="button" onClick={() => setFrom(addDays(from, 7))}>Next →</button>
      </div>
      {error && <p className="error">{error}</p>}
      {!entries ? (
        <p className="muted">Loading…</p>
      ) : (
        <ul className="week">
          {days.map((d) => {
            const meals = entries.filter((e) => e.day === d);
            return (
              <li key={d} className={d === t ? "today" : ""}>
                <div className="day-head">
                  <strong>{dayLabel(d, true)}</strong>
                  <button className="link" onClick={() => setPicking(picking === d ? null : d)}>
                    {picking === d ? "Cancel" : "+ Add"}
                  </button>
                </div>
                {meals.length > 0 && (
                  <ul className="meals">
                    {meals.map((e) => (
                      <li key={e.id} className="meal">
                        {e.hero_photo_id ? <img src={photoUrl(e.hero_photo_id)} alt="" loading="lazy" /> : <span className="thumb" />}
                        <a className="title" href={`#/recipe/${encodeURIComponent(e.recipe_id)}`}>{e.title}</a>
                        <button className="link" aria-label={`Remove ${e.title}`} onClick={() => void remove(e)}>✕</button>
                        <div className="meal-controls">
                        <select
                          aria-label="Servings"
                          value={e.servings ?? ""}
                          onChange={(ev) => void setServings(e, ev.target.value)}
                        >
                          <option value="">{e.recipe_servings ? `Serves ${e.recipe_servings}` : "As written"}</option>
                          {SERVINGS.map((n) => (
                            <option key={n} value={n}>Serves {n}</option>
                          ))}
                        </select>
                        <select aria-label="Move to day" value={d} onChange={(ev) => void move(e, ev.target.value)}>
                          {days.map((o) => (
                            <option key={o} value={o}>{dayLabel(o)}</option>
                          ))}
                        </select>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {picking === d && <RecipePicker onPick={(r) => void add(d, r)} />}
              </li>
            );
          })}
        </ul>
      )}
      {entries && entries.length > 0 && <WeekShopping from={from} version={version} />}
    </>
  );
}

/** Search the collection and pick a recipe. Starred ("make soon") recipes come first. */
export function RecipePicker({ onPick }: { onPick: (r: RecipeSummary) => void }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<RecipeSummary[] | null>(null);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      listRecipes({ q: q.trim() || undefined })
        .then((r) => {
          if (!live) return;
          const sorted = q.trim() ? r : [...r].sort((a, b) => (b.starred_at ?? "").localeCompare(a.starred_at ?? ""));
          setList(sorted.slice(0, 50));
        })
        .catch(() => live && setList([]));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);
  return (
    <div className="picker">
      <input className="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your recipes…" />
      {!list ? (
        <p className="muted small">Loading…</p>
      ) : !list.length ? (
        <p className="muted small">No recipes match.</p>
      ) : (
        <ul>
          {list.map((r) => (
            <li key={r.id}>
              <button onClick={() => onPick(r)}>
                {r.starred_at ? "★ " : ""}
                {r.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WeekShopping({ from, version }: { from: string; version: number }) {
  const [lines, setLines] = useState<{ key: string; text: string; recipes: string[] }[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setNote(null);
    planShopping(from).then(setLines).catch(() => setLines([]));
  }, [from, version]);
  if (!lines) return null;
  const addAll = async () => {
    setBusy(true);
    try {
      const r = await addPlanShopping(from);
      setNote(r.added ? `Added ${r.added} to the shopping list.` : "Everything is already on the shopping list.");
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <h2>To buy for this week</h2>
      {!lines.length ? (
        <p className="muted">Looks like you have everything (going by the pantry and recent shopping).</p>
      ) : (
        <>
          <ul className="check-list plain">
            {lines.map((l) => (
              <li key={l.key}>
                <span>
                  {l.text}
                  <span className="muted small"> · {l.recipes.join(", ")}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="row">
            <button className="button primary" disabled={busy} onClick={() => void addAll()}>
              Add {lines.length} to shopping list
            </button>
            {note && (
              <span className="muted small">
                {note} <a href="#/pantry/shopping">See list</a>
              </span>
            )}
          </div>
        </>
      )}
    </>
  );
}

function Make() {
  const [list, setList] = useState<Makeable[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [planned, setPlanned] = useState<Record<string, string>>({});
  useEffect(() => {
    whatCanIMake().then(setList).catch((e: Error) => setError(e.message));
  }, []);
  const plan = async (r: Makeable, day: string) => {
    if (!day) return;
    await addToPlan(day, r.id)
      .then(() => setPlanned((p) => ({ ...p, [r.id]: day })))
      .catch((e: Error) => setError(e.message));
  };
  if (!list) return <p className="muted">{error ?? "Checking the pantry…"}</p>;
  return (
    <>
      <p className="muted small">Ranked by how much is already in the kitchen, going by the pantry and recent shopping.</p>
      {error && <p className="error">{error}</p>}
      {!list.length && <p className="muted">Nothing to suggest yet. Sync groceries or mark what you have in the Pantry.</p>}
      <ul className="makeable">
        {list.map((r) => (
          <li key={r.id}>
            {r.hero_photo_id ? <img src={photoUrl(r.hero_photo_id)} alt="" loading="lazy" /> : <span className="thumb" />}
            <div className="body">
              <a href={`#/recipe/${encodeURIComponent(r.id)}`}>{r.starred_at ? "★ " : ""}{r.title}</a>
              <div className="meter" aria-hidden="true">
                <span style={{ width: `${Math.round((r.have / r.total) * 100)}%` }} />
              </div>
              <span className="small">
                {r.missing.length ? `Have ${r.have} of ${r.total}` : `Have all ${r.total}`}
                {r.cost !== null ? ` · about $${r.cost.toFixed(2)}` : ""}
              </span>
              {r.missing.length > 0 && <span className="muted small">Need: {r.missing.slice(0, 6).join(", ")}{r.missing.length > 6 ? "…" : ""}</span>}
              {planned[r.id] ? (
                <span className="small">Planned for {dayLabel(planned[r.id]!)} · <a href="#/plan">See plan</a></span>
              ) : (
                <select className="chip" value="" onChange={(e) => void plan(r, e.target.value)} aria-label={`Plan ${r.title}`}>
                  <option value="">Plan for…</option>
                  {nextDays().map((d) => (
                    <option key={d} value={d}>{dayLabel(d)}</option>
                  ))}
                </select>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/** "Plan for…" menu on a recipe page. */
export function PlanThis({ recipeId, servings }: { recipeId: string; servings: number | null }) {
  const [planned, setPlanned] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (planned) {
    return (
      <span className="small">
        Planned for {dayLabel(planned)} · <a href="#/plan">See plan</a>
      </span>
    );
  }
  return (
    <>
      <select
        className="chip"
        value=""
        aria-label="Add to meal plan"
        onChange={(e) => {
          const day = e.target.value;
          if (day) addToPlan(day, recipeId, servings).then(() => setPlanned(day)).catch((err: Error) => setError(err.message));
        }}
      >
        <option value="">Add to plan…</option>
        {nextDays().map((d) => (
          <option key={d} value={d}>{dayLabel(d)}</option>
        ))}
      </select>
      {error && <span className="error small">{error}</span>}
    </>
  );
}
