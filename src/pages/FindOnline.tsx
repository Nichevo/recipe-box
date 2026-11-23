import { useEffect, useState } from "react";
import { aiStatus, findRecipes, type AiStatus, type FindResult } from "../api";
import { go } from "../router";

type Found = FindResult & { error?: string; searchUrl?: string };

const CACHE = "find.last";

/** Remember the last search so coming back from a recipe doesn't search again. */
function cached(query: string): Found | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(CACHE) ?? "null") as { query: string; result: Found } | null;
    return v && v.query === query ? v.result : null;
  } catch {
    return null;
  }
}

/** Search the web for a recipe and bring the chosen one in through the link importer. */
export function FindOnline({ initial }: { initial?: string }) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [query, setQuery] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Found | null>(() => (initial ? cached(initial) : null));

  useEffect(() => {
    aiStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  const search = async (q: string) => {
    const words = q.trim();
    if (!words) return;
    setBusy(true);
    setResult(null);
    const r = await findRecipes(words);
    setResult(r);
    setBusy(false);
    try {
      sessionStorage.setItem(CACHE, JSON.stringify({ query: words, result: r }));
    } catch {
      /* storage unavailable */
    }
    // Keep the search in the address so Back returns here.
    history.replaceState(null, "", `#/find/${encodeURIComponent(words)}`);
  };

  useEffect(() => {
    if (initial && !result) void search(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const claudeReady = status ? status.claude.enabled && status.claude.configured : true;
  const webSearch = `https://www.google.com/search?q=${encodeURIComponent(`${query.trim()} recipe`)}`;

  return (
    <section className="form">
      <a className="back" href="#/add">← Back</a>
      <h1>Find a recipe online</h1>
      <p className="muted">Say what you'd like to make. Claude searches the web and suggests a few recipes; pick one to bring it in.</p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void search(query);
        }}
      >
        <input className="grow" value={query} maxLength={200} disabled={busy} onChange={(e) => setQuery(e.target.value)} placeholder="Pumpkin pie" />
        <button className="button primary" disabled={busy || !query.trim() || !claudeReady}>
          {busy ? "Searching…" : "Search"}
        </button>
      </form>
      {!claudeReady && !result?.error && (
        <p className="muted">
          Searching needs Claude, which is off or not set up (<a href="#/settings">Settings</a>).{" "}
          {query.trim() && (
            <>
              You can <a href={webSearch} target="_blank" rel="noreferrer">search the web yourself</a> and share or paste the link into{" "}
              <a href="#/link">Add from a link</a>.
            </>
          )}
        </p>
      )}
      {busy && <p className="muted">Searching the web… this can take up to a minute.</p>}
      {result?.mine.length ? (
        <>
          <h2>Already in your recipes</h2>
          <ul className="found">
            {result.mine.map((m) => (
              <li key={m.id}>
                <a href={`#/recipe/${encodeURIComponent(m.id)}`}>{m.title}</a>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {result?.error && (
        <p className="error">
          {result.error}{" "}
          <a href={result.searchUrl ?? webSearch} target="_blank" rel="noreferrer">
            Search the web yourself
          </a>{" "}
          and paste the link into <a href="#/link">Add from a link</a>.
        </p>
      )}
      {result && !result.error && (
        <>
          <h2>On the web</h2>
          {!result.options.length && <p className="muted">Nothing suitable came up. Try different words.</p>}
          <ul className="found">
            {result.options.map((o) => (
              <li key={o.url}>
                <div className="found-head">
                  <strong>{o.title}</strong>
                  <span className="muted small">
                    {[o.site, o.minutes ? `${o.minutes} min` : null].filter(Boolean).join(" · ")}
                  </span>
                </div>
                {o.summary && <p className="small">{o.summary}</p>}
                <div className="row">
                  <button className="button primary" onClick={() => go(`#/link/${encodeURIComponent(o.url)}`)}>
                    Use this one
                  </button>
                  <a className="button" href={o.url} target="_blank" rel="noreferrer">
                    Look first
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
