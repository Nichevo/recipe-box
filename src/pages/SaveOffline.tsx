import { useEffect, useRef, useState } from "react";
import { getRecipe, listRecipes, listTags, photoUrl } from "../api";

const KEY = "offline.savedAt";

function readSavedAt(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/**
 * Settings: fetch every recipe and its photos so the app's offline cache
 * (the service worker) holds them all, e.g. before a trip.
 */
export function SaveOffline() {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [savedAt, setSavedAt] = useState(readSavedAt);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<string | null>(null);
  const stop = useRef(false);

  const measure = () =>
    navigator.storage
      ?.estimate?.()
      .then((e) => e.usage && setUsage(`${Math.round(e.usage / 1024 / 1024)} MB used on this device`))
      .catch(() => {});
  useEffect(() => void measure(), []);

  if (!("serviceWorker" in navigator)) return <p className="muted small">This browser can't keep recipes offline.</p>;

  const run = async () => {
    setError(null);
    stop.current = false;
    // Ask the browser not to clear the saved recipes when space is short.
    await navigator.storage?.persist?.().catch(() => false);
    try {
      const [list] = await Promise.all([listRecipes({}), listTags()]);
      setProgress({ done: 0, total: list.length });
      let done = 0;
      // A few at a time, so it's quick without hammering the server.
      const queue = [...list];
      const worker = async () => {
        while (queue.length && !stop.current) {
          const r = queue.shift()!;
          try {
            const d = await getRecipe(r.id);
            const photos = [d.hero_photo_id, ...d.photos.map((p) => p.id), ...d.steps.map((s) => s.photo_id)].filter((p): p is string => !!p);
            await Promise.all([...new Set(photos)].map((p) => fetch(photoUrl(p), { credentials: "same-origin" }).catch(() => null)));
          } catch {
            /* skip this one; it can be saved next time */
          }
          setProgress({ done: ++done, total: list.length });
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      if (!stop.current) {
        const at = new Date().toISOString();
        try {
          localStorage.setItem(KEY, at);
        } catch {
          /* ignore */
        }
        setSavedAt(at);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress(null);
      void measure();
    }
  };

  return (
    <div>
      <p className="muted small">
        Recipes you open are kept for offline use automatically. This saves every recipe and photo on this device at once, for cooking without a signal.
      </p>
      <div className="row">
        {progress ? (
          <>
            <span className="small">
              Saving… {progress.done} of {progress.total}
            </span>
            <button className="link" onClick={() => (stop.current = true)}>
              Stop
            </button>
          </>
        ) : (
          <button className="button" onClick={() => void run()}>
            Save all recipes for offline
          </button>
        )}
      </div>
      <p className="muted small">
        {savedAt ? `Last saved ${new Date(savedAt).toLocaleString()}.` : "Not saved on this device yet."} {usage}
      </p>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
