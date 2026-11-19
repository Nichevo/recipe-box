import { useEffect, useMemo, useState } from "react";
import {
  addShopping, clearShoppingDone, getPantry, getShopping, groceryStatus, removeShopping, setPantry, syncAllGroceries, tickShopping,
  type GroceryStatus, type PantryEntry, type PantryState, type ShoppingItem
} from "../api";

export const STATE_LABEL: Record<PantryState, string> = {
  have: "Have",
  likely: "Probably have",
  staple: "Always have",
  out: "Out",
  unknown: "Not sure"
};

export function ago(date: string | null): string {
  if (!date) return "";
  const days = Math.round((Date.now() - Date.parse(`${date}T12:00:00Z`)) / 86400000);
  if (days <= 0) return "bought today";
  if (days === 1) return "bought yesterday";
  if (days < 14) return `bought ${days} days ago`;
  if (days < 60) return `bought ${Math.round(days / 7)} weeks ago`;
  return `bought ${Math.round(days / 30)} months ago`;
}

export function PantryPage({ tab }: { tab: "shopping" | "pantry" }) {
  return (
    <section className="form">
      <h1>{tab === "shopping" ? "Shopping list" : "Pantry"}</h1>
      <div className="segmented page-switch" role="tablist">
        <a role="tab" className={tab === "shopping" ? "on" : ""} href="#/pantry/shopping">Shopping list</a>
        <a role="tab" className={tab === "pantry" ? "on" : ""} href="#/pantry">What's in</a>
      </div>
      {tab === "shopping" ? <Shopping /> : <PantryList />}
    </section>
  );
}

function Shopping() {
  const [items, setItems] = useState<ShoppingItem[] | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = () => getShopping().then(setItems).catch((e: Error) => setError(e.message));
  useEffect(() => void load(), []);

  const add = async () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    await addShopping([{ text: t, name: t }]).catch((e: Error) => setError(e.message));
    void load();
  };
  const tick = async (it: ShoppingItem) => {
    setItems((list) => list?.map((x) => (x.id === it.id ? { ...x, done: it.done ? 0 : 1 } : x)) ?? null);
    await tickShopping(it.id, !it.done).catch((e: Error) => setError(e.message));
  };

  if (!items) return <p className="muted">{error ?? "Loading…"}</p>;
  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  return (
    <>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <input className="grow" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add something…" />
        <button className="button" disabled={!text.trim()}>Add</button>
      </form>
      {error && <p className="error">{error}</p>}
      {!items.length && <p className="muted">Nothing on the list. Add missing ingredients from a recipe, or type them here.</p>}
      <ul className="check-list">
        {[...open, ...done].map((it) => (
          <li key={it.id} className={it.done ? "done" : ""}>
            <label>
              <input type="checkbox" checked={!!it.done} onChange={() => void tick(it)} />
              <span>
                {it.text}
                {it.recipe_title && <span className="muted small"> · for {it.recipe_title}</span>}
              </span>
            </label>
            <button
              className="link small"
              aria-label={`Remove ${it.text}`}
              onClick={async () => {
                setItems((l) => l?.filter((x) => x.id !== it.id) ?? null);
                await removeShopping(it.id).catch(() => load());
              }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      {done.length > 0 && (
        <>
          <p className="muted small">Ticked items are marked as in the pantry.</p>
          <button className="button" onClick={async () => { await clearShoppingDone(); void load(); }}>
            Clear {done.length} ticked
          </button>
        </>
      )}
    </>
  );
}

function SyncLine() {
  const [status, setStatus] = useState<GroceryStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => void groceryStatus().then(setStatus).catch(() => {}), []);
  if (!status) return null;
  if (!status.configured) {
    return <p className="muted small">The grocery sheet isn't connected yet, so only items you mark yourself show here.</p>;
  }
  const sync = async () => {
    setError(null);
    setBusy("Syncing…");
    try {
      await syncAllGroceries((row) => setBusy(`Syncing… row ${row}`));
      setStatus(await groceryStatus());
      location.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <p className="muted small row between">
      <span>
        {status.purchases ? `${status.purchases} purchases from your grocery sheet` : "Not synced yet"}
        {status.syncedAt ? ` · synced ${new Date(status.syncedAt).toLocaleString()}` : ""}
      </span>
      <button className="link small" disabled={!!busy} onClick={sync}>{busy ?? "Sync now"}</button>
      {error && <span className="error">{error}</span>}
    </p>
  );
}

function PantryList() {
  const [entries, setEntries] = useState<PantryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"in" | "out" | "all">("in");
  const [q, setQ] = useState("");
  const [newName, setNewName] = useState("");
  const load = () => getPantry().then(setEntries).catch((e: Error) => setError(e.message));
  useEffect(() => void load(), []);

  const set = async (name: string, status: "have" | "out" | "staple" | null) => {
    setEntries((list) =>
      list?.map((e) =>
        e.name === name ? { ...e, manual: status, state: status === "have" ? "have" : status === "staple" ? "staple" : status === "out" ? "out" : e.state } : e
      ) ?? null
    );
    await setPantry([{ name, status }]).catch((e: Error) => setError(e.message));
    if (status === null) void load();
  };

  const shown = useMemo(() => {
    const list = (entries ?? []).filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase()));
    const inKitchen = (s: PantryState) => s === "have" || s === "likely" || s === "staple";
    return list.filter((e) => filter === "all" || (filter === "in" ? inKitchen(e.state) : !inKitchen(e.state)));
  }, [entries, filter, q]);

  const groups = useMemo(() => {
    const m = new Map<string, PantryEntry[]>();
    for (const e of shown) {
      const k = e.state === "staple" ? "Always have" : (e.category ?? "Other");
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.entries()];
  }, [shown]);

  return (
    <>
      <SyncLine />
      <div className="row wrap">
        <a className="button primary" href="#/fridge">📷 Snap the fridge</a>
        <form
          className="row grow"
          onSubmit={(e) => {
            e.preventDefault();
            const n = newName.trim();
            if (!n) return;
            setNewName("");
            void setPantry([{ name: n, status: "have" }]).then(load);
          }}
        >
          <input className="grow" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Add something you have…" />
          <button className="button" disabled={!newName.trim()}>Add</button>
        </form>
      </div>
      <div className="row between filter-row">
        <div className="segmented" role="group" aria-label="Show">
          {(["in", "out", "all"] as const).map((f) => (
            <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
              {f === "in" ? "In" : f === "out" ? "Out / not sure" : "All"}
            </button>
          ))}
        </div>
        <input className="search-small" type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && <p className="error">{error}</p>}
      {!entries && <p className="muted">Loading…</p>}
      {entries && !shown.length && <p className="muted">Nothing here.</p>}
      {groups.map(([group, list]) => (
        <div key={group}>
          <h3 className="pantry-group">{group}</h3>
          <ul className="pantry-list">
            {list.map((e) => (
              <li key={e.name}>
                <div className="grow">
                  <span className={`state-dot ${e.state}`} aria-hidden />
                  <strong>{e.name}</strong>
                  <span className="muted small">
                    {" "}
                    {STATE_LABEL[e.state]}
                    {e.lastBought ? ` · ${ago(e.lastBought)}` : ""}
                    {e.source === "photo" && e.manual === "have" ? " · seen in photo" : ""}
                  </span>
                </div>
                <div className="pantry-actions">
                  <button className={e.manual === "have" ? "on" : ""} onClick={() => void set(e.name, e.manual === "have" ? null : "have")} title="Have it">✓</button>
                  <button className={e.manual === "out" ? "on" : ""} onClick={() => void set(e.name, e.manual === "out" ? null : "out")} title="Run out">✕</button>
                  <button className={e.manual === "staple" ? "on" : ""} onClick={() => void set(e.name, e.manual === "staple" ? null : "staple")} title="Always have (salt, oil, spices…)">★</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="muted small">✓ have it · ✕ run out · ★ always have (salt, oil, spices). Tap again to undo.</p>
    </>
  );
}
