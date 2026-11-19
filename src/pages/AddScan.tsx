import { useEffect, useRef, useState } from "react";
import { aiScan, aiStatus, listTags, type AiStatus, type Tag } from "../api";
import { draftToInput } from "../ai-draft";
import { setDraft } from "../draft";
import { preparePhoto } from "../photo";
import { go } from "../router";
import { AiOffNotice } from "./Settings";

const MAX_PAGES = 4;

/** Photograph a recipe book page (or a few) and let the AI type it up. */
export function AddScan() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [pages, setPages] = useState<{ blob: Blob; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);

  useEffect(() => {
    aiStatus().then(setStatus).catch(() => setStatus(null));
  }, []);
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const add = async (files: FileList | null) => {
    if (!files) return;
    const room = MAX_PAGES - pages.length;
    const picked = [...files].slice(0, room);
    const prepared: { blob: Blob; url: string }[] = [];
    for (const f of picked) {
      const { blob } = await preparePhoto(f);
      if (!/^image\/(jpeg|png|webp)$/.test(blob.type)) {
        setError("That photo format can't be read. Try taking the photo again or use a JPEG.");
        continue;
      }
      const url = URL.createObjectURL(blob);
      urls.current.push(url);
      prepared.push({ blob, url });
    }
    setPages((p) => [...p, ...prepared]);
  };

  const read = async () => {
    setBusy(true);
    setError(null);
    try {
      const [res, known] = await Promise.all([aiScan(pages.map((p) => p.blob)), listTags().catch(() => [] as Tag[])]);
      if (!res.draft.ok) {
        setError(res.draft.problem || "No recipe found in those photos.");
        return;
      }
      setDraft({
        ...draftToInput(res.draft, known),
        source_type: "photo",
        original_photo_ids: res.photo_ids,
        hero_photo_id: null
      });
      go("#/new");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const picker = (ref: React.RefObject<HTMLInputElement | null>, capture: boolean) => (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      multiple={!capture}
      capture={capture ? "environment" : undefined}
      hidden
      onChange={(e) => {
        void add(e.target.files);
        e.target.value = "";
      }}
    />
  );

  return (
    <section className="form">
      <a className="back" href="#/add">← Back</a>
      <h1>Scan a book page</h1>
      <p className="muted">
        Take a photo of the recipe (up to {MAX_PAGES} pages if it runs over). The AI types it up for you to check, and the
        photos are kept with the recipe.
      </p>
      {status && !status.available && <AiOffNotice />}
      {picker(camera, true)}
      {picker(library, false)}
      <div className="row wrap">
        {pages.map((p, i) => (
          <div key={p.url} className="page-pick">
            <img className="page-thumb" src={p.url} alt={`Page ${i + 1}`} />
            <button className="link" disabled={busy} onClick={() => setPages(pages.filter((x) => x !== p))}>
              Remove
            </button>
          </div>
        ))}
      </div>
      {pages.length < MAX_PAGES && (
        <div className="row">
          <button className="button" disabled={busy} onClick={() => camera.current?.click()}>
            {pages.length ? "+ Take another" : "Take a photo"}
          </button>
          <button className="button" disabled={busy} onClick={() => library.current?.click()}>
            Choose from photos
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <div className="row actions sticky">
        <button className="button primary" disabled={busy || !pages.length || status?.available === false} onClick={read}>
          {busy ? "Reading the recipe… (up to a minute)" : `Read recipe from ${pages.length || ""} photo${pages.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </section>
  );
}
