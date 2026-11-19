import { useState } from "react";
import type { ImportRecipe } from "../../shared/notion-import";
import { createRecipe, importedKeys, photoFromUrl, uploadPhoto } from "../api";
import { fileFromExport, loadNotionExport, type LoadedExport } from "../notion-zip";
import { preparePhoto } from "../photo";

type RowStatus = "waiting" | "working" | "done" | "skipped" | "failed";

const cut = (s: string | null, max: number) => (s && s.length > max ? `${s.slice(0, max - 1)}…` : s);

/**
 * Import recipes from a Notion "Markdown & CSV" export. Everything happens in
 * the browser: the zip is read here, and each recipe and photo is sent to the
 * app one at a time. Importing the same export again skips recipes already in.
 */
export function ImportNotion() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LoadedExport | null>(null);
  const [already, setAlready] = useState<Set<string>>(new Set());
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Record<string, RowStatus>>({});
  const [running, setRunning] = useState(false);
  const [photoProblems, setPhotoProblems] = useState(0);
  const [runTotal, setRunTotal] = useState(0);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const [loaded, keys] = await Promise.all([loadNotionExport(file), importedKeys().catch(() => [])]);
      const done = new Set(keys);
      setData(loaded);
      setAlready(done);
      setChosen(new Set(loaded.recipes.filter((r) => !done.has(r.key)).map((r) => r.key)));
      setStatus({});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const photo = async (src: string | null | undefined, kind: string): Promise<string | null> => {
    if (!src || !data) return null;
    try {
      if (/^https?:\/\//i.test(src)) return (await photoFromUrl(src, kind)).id;
      const file = fileFromExport(data.files, src);
      if (!file) return null;
      const { blob, width, height } = await preparePhoto(file);
      return (await uploadPhoto(blob, kind, width, height)).id;
    } catch {
      setPhotoProblems((n) => n + 1);
      return null;
    }
  };

  const importOne = async (r: ImportRecipe) => {
    const hero = await photo(r.heroImage, "hero");
    const steps = [];
    for (const s of r.steps) steps.push({ text: cut(s.text, 5000)!, photo_id: await photo(s.image, "step") });
    await createRecipe({
      title: cut(r.title, 200)!,
      summary: cut(r.summary, 2000),
      servings: r.servings,
      prep_minutes: r.prepMinutes,
      cook_minutes: r.cookMinutes,
      source_url: r.sourceUrl,
      source_name: cut(r.sourceName, 200),
      notes: cut([r.notes, r.warnings.length ? `Imported from Notion. Check: ${r.warnings.join("; ")}.` : null].filter(Boolean).join("\n\n"), 10000),
      hero_photo_id: hero,
      tags: r.tags,
      ingredients_text: cut(r.ingredientsText, 20000) ?? "",
      steps,
      source_type: "notion",
      import_key: r.key
    });
  };

  const run = async () => {
    if (!data) return;
    setRunning(true);
    setPhotoProblems(0);
    const queue = data.recipes.filter((r) => chosen.has(r.key) && status[r.key] !== "done");
    setRunTotal(queue.length);
    setStatus((s) => {
      const n = { ...s };
      for (const r of queue) n[r.key] = "waiting";
      return n;
    });
    const worker = async () => {
      for (let r = queue.shift(); r; r = queue.shift()) {
        const key = r.key;
        setStatus((s) => ({ ...s, [key]: "working" }));
        try {
          await importOne(r);
          setStatus((s) => ({ ...s, [key]: "done" }));
          setChosen((c) => {
            const n = new Set(c);
            n.delete(key);
            return n;
          });
        } catch {
          setStatus((s) => ({ ...s, [key]: "failed" }));
        }
      }
    };
    await Promise.all([worker(), worker()]);
    setRunning(false);
  };

  const toggle = (key: string) =>
    setChosen((c) => {
      const n = new Set(c);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const recipes = data?.recipes ?? [];
  const counts = Object.values(status).reduce<Record<string, number>>((a, s) => ((a[s] = (a[s] ?? 0) + 1), a), {});
  const total = runTotal;
  const left = (counts.waiting ?? 0) + (counts.working ?? 0);
  const finished = total - left;

  return (
    <section className="form">
      <a className="back" href="#/add">← Back</a>
      <h1>Import from Notion</h1>
      <p className="muted">
        In Notion, open your recipes page, choose ••• → Export, pick “Markdown &amp; CSV” with subpages included, and
        choose the zip file here. You can run it again later: recipes already imported are skipped.
      </p>
      <input type="file" accept=".zip,application/zip" disabled={loading || running} onChange={(e) => pick(e.target.files?.[0])} />
      {loading && <p className="muted">Reading the export…</p>}
      {error && <p className="error">{error}</p>}

      {data && (
        <>
          <div className="row between">
            <strong>
              {recipes.length} recipes found
              {already.size ? ` · ${recipes.filter((r) => already.has(r.key)).length} already imported` : ""}
            </strong>
            <div className="row">
              <button className="link" disabled={running} onClick={() => setChosen(new Set(recipes.filter((r) => !already.has(r.key)).map((r) => r.key)))}>
                Select all
              </button>
              <button className="link" disabled={running} onClick={() => setChosen(new Set())}>
                Select none
              </button>
            </div>
          </div>

          <ul className="import-list">
            {recipes.map((r) => {
              const st = status[r.key] ?? (already.has(r.key) ? "skipped" : "waiting");
              const ingredients = r.ingredientsText.split("\n").filter((l) => l && !/:$/.test(l)).length;
              return (
                <li key={r.key} className={`import-row ${st}`}>
                  <label className="row">
                    <input
                      type="checkbox"
                      checked={chosen.has(r.key)}
                      disabled={running || already.has(r.key) || st === "done"}
                      onChange={() => toggle(r.key)}
                    />
                    <span className="import-title">{r.title}</span>
                  </label>
                  <span className="small muted">
                    {[r.tags.join(", "), `${ingredients} ingredients`, `${r.steps.length} steps`, r.heroImage ? "photo" : "no photo"]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {r.warnings.length > 0 && <span className="small warn">Check after import: {r.warnings.join("; ")}</span>}
                  {st !== "waiting" && <span className={`small status-${st}`}>{STATUS_TEXT[st]}</span>}
                </li>
              );
            })}
          </ul>

          <div className="sticky row between">
            <span className="muted small">
              {running || total
                ? `${finished} of ${total} done${counts.failed ? ` · ${counts.failed} failed` : ""}${photoProblems ? ` · ${photoProblems} photo(s) couldn't be copied` : ""}`
                : `${chosen.size} selected`}
            </span>
            <button className="button primary" disabled={running || chosen.size === 0} onClick={run}>
              {running ? "Importing…" : `Import ${chosen.size} recipe${chosen.size === 1 ? "" : "s"}`}
            </button>
          </div>
          {!running && total > 0 && (
            <p>
              <a href="#/">See your recipes →</a>
            </p>
          )}
        </>
      )}
    </section>
  );
}

const STATUS_TEXT: Record<RowStatus, string> = {
  waiting: "",
  working: "Importing…",
  done: "✓ Imported",
  skipped: "Already imported",
  failed: "Failed, try again"
};
