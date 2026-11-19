import { useEffect, useRef, useState } from "react";
import { aiStatus, scanPantry, setPantry, type AiStatus } from "../api";
import { preparePhoto } from "../photo";
import { go } from "../router";
import { AiOffNotice } from "./Settings";

interface Found {
  name: string;
  known_name: string | null;
  keep: boolean;
}

/** Photograph the fridge or a cupboard; the AI lists the food it sees for you to confirm. */
export function FridgeScan() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [photos, setPhotos] = useState<{ blob: Blob; url: string }[]>([]);
  const [found, setFound] = useState<Found[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);
  useEffect(() => {
    aiStatus().then(setStatus).catch(() => setStatus(null));
    return () => urls.current.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const add = async (files: FileList | null) => {
    if (!files) return;
    const next: { blob: Blob; url: string }[] = [];
    for (const f of [...files].slice(0, 4 - photos.length)) {
      const { blob } = await preparePhoto(f);
      if (!/^image\/(jpeg|png|webp)$/.test(blob.type)) {
        setError("That photo format can't be read. Try again or use a JPEG.");
        continue;
      }
      const url = URL.createObjectURL(blob);
      urls.current.push(url);
      next.push({ blob, url });
    }
    setPhotos((p) => [...p, ...next]);
  };

  const look = async () => {
    setBusy("Looking at the photos… (up to a minute)");
    setError(null);
    try {
      const res = await scanPantry(photos.map((p) => p.blob));
      setFound(res.items.map((i) => ({ ...i, keep: true })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    const items = (found ?? []).filter((f) => f.keep).map((f) => ({ name: f.known_name ?? f.name, status: "have" as const }));
    setBusy("Saving…");
    try {
      if (items.length) await setPantry(items, "photo");
      go("#/pantry");
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
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
      <a className="back" href="#/pantry">← Pantry</a>
      <h1>Snap the fridge</h1>
      <p className="muted">Take a photo of the fridge, freezer or a cupboard shelf (up to 4). The AI lists the food it can see, and you choose what to mark as in.</p>
      {status && !status.available && <AiOffNotice />}
      {picker(camera, true)}
      {picker(library, false)}

      {!found && (
        <>
          <div className="row wrap">
            {photos.map((p) => (
              <div key={p.url} className="page-pick">
                <img className="page-thumb" src={p.url} alt="" />
                <button className="link" disabled={!!busy} onClick={() => setPhotos(photos.filter((x) => x !== p))}>Remove</button>
              </div>
            ))}
          </div>
          {photos.length < 4 && (
            <div className="row">
              <button className="button" disabled={!!busy} onClick={() => camera.current?.click()}>{photos.length ? "+ Take another" : "Take a photo"}</button>
              <button className="button" disabled={!!busy} onClick={() => library.current?.click()}>Choose from photos</button>
            </div>
          )}
          <div className="row actions sticky">
            <button className="button primary" disabled={!!busy || !photos.length || status?.available === false} onClick={look}>
              {busy ?? "See what's there"}
            </button>
          </div>
        </>
      )}

      {found && (
        <>
          <p>
            <strong>Found {found.length} thing{found.length === 1 ? "" : "s"}.</strong> Untick anything that's wrong.
          </p>
          <ul className="check-list">
            {found.map((f, i) => (
              <li key={`${f.name}-${i}`}>
                <label>
                  <input type="checkbox" checked={f.keep} onChange={() => setFound(found.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x)))} />
                  <span>
                    {f.name}
                    {f.known_name && f.known_name.toLowerCase() !== f.name.toLowerCase() && <span className="muted small"> → {f.known_name}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="row actions sticky">
            <button className="button" disabled={!!busy} onClick={() => setFound(null)}>Back</button>
            <button className="button primary" disabled={!!busy || !found.some((f) => f.keep)} onClick={save}>
              {busy ?? `Mark ${found.filter((f) => f.keep).length} as in`}
            </button>
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
