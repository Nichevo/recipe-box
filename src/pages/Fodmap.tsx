import { useEffect, useMemo, useState } from "react";
import type { FodmapRating } from "../../shared/types";
import { GROUP_LABEL } from "../../shared/fodmap-guide";
import { aiStatus, fodmapAi, fodmapItems, setFodmapItem, type AiStatus, type FodmapItem } from "../api";

const SOURCE: Record<string, string> = { guide: "from the guide", ai: "checked by AI", manual: "set by you" };
type Filter = "all" | "unrated" | "high" | "moderate";

/** The FODMAP rating of every ingredient in the collection, to check and correct. */
export function Fodmap() {
  const [items, setItems] = useState<FodmapItem[] | null>(null);
  const [filter, setFilter] = useState<Filter>("unrated");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => fodmapItems().then(setItems).catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
    aiStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  const counts = useMemo(() => {
    const c = { all: 0, unrated: 0, high: 0, moderate: 0 };
    for (const i of items ?? []) {
      c.all++;
      if (!i.rating) c.unrated++;
      if (i.rating === "high") c.high++;
      if (i.rating === "moderate") c.moderate++;
    }
    return c;
  }, [items]);

  const shown = (items ?? []).filter(
    (i) =>
      (filter === "all" || (filter === "unrated" ? !i.rating : i.rating === filter)) && (!q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase()))
  );
  const unratedNew = (items ?? []).filter((i) => !i.rating && i.source !== "ai" && i.source !== "manual").length;

  const rate = async (i: FodmapItem, v: string) => {
    const rating = (v || null) as FodmapRating | null;
    setItems((list) => list?.map((x) => (x.id === i.id ? { ...x, rating, source: "manual" } : x)) ?? null);
    await setFodmapItem(i.id, rating).catch((e: Error) => setError(e.message));
  };
  const askAi = async () => {
    setBusy(true);
    setNote(null);
    setError(null);
    try {
      const r = await fodmapAi();
      setNote(r.checked ? `Checked ${r.checked}; rated ${r.rated}.` : "Nothing left to check.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="form">
      <a className="back" href="#/settings">← Settings</a>
      <h1>FODMAP ratings</h1>
      <p className="muted small">
        Each ingredient's rating at a typical serving. Most come from a built-in guide to common foods; the rest can be checked with AI. Change any you know better;
        recipe ratings follow (unless a recipe's rating was set by hand). For serving sizes, the Monash FODMAP app is the reference.
      </p>
      {error && <p className="error">{error}</p>}
      {!items ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          {unratedNew > 0 && (
            <div className="row">
              <button className="button primary" disabled={busy || status?.available === false} onClick={() => void askAi()}>
                {busy ? "Checking… (up to a minute)" : `Check ${Math.min(unratedNew, 80)} unrated with AI`}
              </button>
              {status?.available === false && <span className="muted small">AI is off or not set up.</span>}
            </div>
          )}
          {note && <p className="muted small">{note}</p>}
          <div className="chips">
            {(["unrated", "high", "moderate", "all"] as Filter[]).map((f) => (
              <button key={f} className={`chip${filter === f ? " on" : ""}`} onClick={() => setFilter(f)}>
                {f === "unrated" ? "Not rated" : f === "all" ? "All" : f[0]!.toUpperCase() + f.slice(1)} ({counts[f]})
              </button>
            ))}
          </div>
          <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an ingredient…" />
          <ul className="fodmap-list">
            {shown.slice(0, 300).map((i) => (
              <li key={i.id}>
                <div className="row between nowrap">
                  <strong>{i.name}</strong>
                  <select aria-label={`Rating for ${i.name}`} value={i.rating ?? ""} onChange={(e) => void rate(i, e.target.value)}>
                    <option value="">Not rated</option>
                    <option value="low">Low</option>
                    <option value="moderate">Moderate</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <span className="muted small">
                  {[
                    i.groups.length ? i.groups.map((g) => GROUP_LABEL[g]).join(", ") : null,
                    i.serving ? `OK: ${i.serving}` : null,
                    i.swap ? `Swap: ${i.swap}` : null,
                    i.source ? SOURCE[i.source] : null,
                    `${i.recipes} recipe${i.recipes === 1 ? "" : "s"}`
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
          {!shown.length && <p className="muted">Nothing here.</p>}
        </>
      )}
    </section>
  );
}
