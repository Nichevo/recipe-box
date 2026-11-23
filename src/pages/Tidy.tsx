import { useEffect, useState } from "react";
import { aiStatus, needsTidy, type AiStatus, type TidyCandidate } from "../api";
import { tidyRecipe } from "../tidy";
import { AiOffNotice } from "./Settings";

/** Recipes whose import left clutter or gaps, with a one-tap AI tidy-up for each. */
export function Tidy() {
  const [list, setList] = useState<TidyCandidate[] | null>(null);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    needsTidy().then(setList).catch((e: Error) => setError(e.message));
    aiStatus().then(setStatus).catch(() => setStatus(null));
  }, []);
  const tidy = async (r: TidyCandidate) => {
    setBusy(r.id);
    setError(null);
    try {
      await tidyRecipe(r.id);
    } catch (e) {
      setError(`${r.title}: ${(e as Error).message}`);
      setBusy(null);
    }
  };
  return (
    <section className="form">
      <a className="back" href="#/settings">← Settings</a>
      <h1>Recipes to tidy</h1>
      <p className="muted">
        These came in with blog clutter or something missing. “Tidy with AI” cleans one up and opens it for you to check before saving; nothing changes until you
        tap Save.
      </p>
      {status && !status.available && <AiOffNotice />}
      {error && <p className="error">{error}</p>}
      {!list ? (
        <p className="muted">Checking…</p>
      ) : !list.length ? (
        <p className="muted">All your recipes look tidy.</p>
      ) : (
        <ul className="found">
          {list.map((r) => {
            const photoOnly = !r.ingredients && !r.steps && r.photos > 0;
            return (
              <li key={r.id}>
                <div className="found-head">
                  <a href={`#/recipe/${encodeURIComponent(r.id)}`}>
                    <strong>{r.title}</strong>
                  </a>
                  <span className="muted small">{r.reasons.join(" · ")}</span>
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  {photoOnly ? (
                    <a className="button" href={`#/recipe/${encodeURIComponent(r.id)}`}>Read from photo…</a>
                  ) : (
                    <button className="button primary" disabled={!!busy || status?.available === false} onClick={() => void tidy(r)}>
                      {busy === r.id ? "Tidying… (up to a minute)" : "Tidy with AI"}
                    </button>
                  )}
                  {r.source_url && !r.steps && (
                    <a className="button" href={r.source_url} target="_blank" rel="noreferrer">Open the original</a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
