import { useState } from "react";
import { deleteCookLog, logCook, type CookLogEntry } from "../api";
import { HeartPicker, Hearts } from "../components";
import { dayLabel, today } from "./Plan";

/** "I made this": when a recipe was cooked, how it went, and notes for next time. */
export function CookLog({ recipeId, log, askNow, onChange }: { recipeId: string; log: CookLogEntry[]; askNow: boolean; onChange: () => void }) {
  const [open, setOpen] = useState(askNow);
  const [day, setDay] = useState(today);
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await logCook(recipeId, { cooked_on: day, rating, note: note.trim() || null });
      setOpen(false);
      setRating(null);
      setNote("");
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (e: CookLogEntry) => {
    if (!confirm(`Remove the entry for ${dayLabel(e.cooked_on)}?`)) return;
    await deleteCookLog(recipeId, e.id).catch((err: Error) => setError(err.message));
    onChange();
  };

  return (
    <section id="cook-log">
      <div className="row between">
        <h2>Cook log</h2>
        {!open && (
          <button className="button" onClick={() => setOpen(true)}>
            I made this
          </button>
        )}
      </div>
      {open && (
        <div className="log-form">
          <strong>{askNow ? "How did it go?" : "Log this cook"}</strong>
          <HeartPicker value={rating} onChange={setRating} />
          <label className="small">
            When
            <input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value || today())} />
          </label>
          <textarea rows={2} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder="Notes for next time (optional): needed more salt, used half the chilli…" />
          <div className="row">
            <button className="button primary" disabled={busy} onClick={() => void save()}>
              Save
            </button>
            <button className="link" onClick={() => setOpen(false)}>
              Not now
            </button>
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {log.length === 0 && !open && <p className="muted small">Not cooked yet. Tap "I made this" after cooking to keep a note of how it went.</p>}
      {log.length > 0 && (
        <ul className="cook-log">
          {log.map((e) => (
            <li key={e.id}>
              <div className="row">
                <span>
                  <strong>{dayLabel(e.cooked_on, true)}</strong> {e.rating ? <Hearts value={e.rating} small /> : null}
                </span>
                <button className="link small" onClick={() => void remove(e)} aria-label="Remove entry">
                  Remove
                </button>
              </div>
              {e.note && <span className="pre small">{e.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
