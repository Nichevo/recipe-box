import { useEffect, useState } from "react";
import type { RecipeDetail } from "../api";
import { photoUrl } from "../api";
import { StepTimers } from "../timers";
import { formatIngredientLine } from "../../shared/scale";
import { convertTemperaturesInText, type DisplayMode } from "../../shared/units";

/** Keep the screen on while cooking (where the browser supports it). */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const take = async () => {
      try {
        if (document.visibilityState === "visible" && "wakeLock" in navigator) {
          lock = await navigator.wakeLock.request("screen");
          if (stopped) void lock.release();
        }
      } catch {
        /* not allowed (e.g. low battery): carry on without it */
      }
    };
    void take();
    // The lock is dropped when the app is hidden; take it again on return.
    document.addEventListener("visibilitychange", take);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", take);
      void lock?.release().catch(() => {});
    };
  }, []);
}

function useStored<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const s = sessionStorage.getItem(key);
      if (s) return JSON.parse(s) as T;
    } catch {
      /* ignore */
    }
    return initial;
  });
  const set = (v: T) => {
    setValue(v);
    try {
      sessionStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  };
  return [value, set];
}

/** Full-screen cooking view: big text, one step at a time, ingredients to tick off. */
export function CookMode(props: { recipe: RecipeDetail; units: DisplayMode; factor: number; onClose: () => void }) {
  const { recipe, units, factor } = props;
  useWakeLock();
  const [step, setStep] = useStored<number>(`cook-step:${recipe.id}`, -1); // -1 = ingredients
  const [ticked, setTicked] = useStored<string[]>(`cook-ticked:${recipe.id}`, []);
  const last = recipe.steps.length - 1;
  const current = step >= 0 ? recipe.steps[Math.min(step, last)] : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setStep(Math.min(step + 1, last));
      if (e.key === "ArrowLeft") setStep(Math.max(step - 1, -1));
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const toggle = (id: string) => setTicked(ticked.includes(id) ? ticked.filter((x) => x !== id) : [...ticked, id]);
  const text = (s: string) => (units === "as_written" ? s : convertTemperaturesInText(s, units === "metric" ? "C" : "F"));

  return (
    <div className="cook">
      <header className="cook-head">
        <button className="link" onClick={props.onClose}>✕ Done</button>
        <strong className="cook-title">{recipe.title}</strong>
        <span className="muted small">{factor !== 1 ? `×${Math.round(factor * 100) / 100}` : ""}</span>
      </header>

      <nav className="cook-dots" aria-label="Steps">
        <button className={step < 0 ? "on" : ""} onClick={() => setStep(-1)}>Ingredients</button>
        {recipe.steps.map((s, i) => (
          <button key={s.id} className={step === i ? "on" : ""} onClick={() => setStep(i)}>
            {i + 1}
          </button>
        ))}
      </nav>

      <main className="cook-body">
        {current ? (
          <>
            <p className="cook-step-label muted">Step {step + 1} of {recipe.steps.length}</p>
            <p className="cook-text">{text(current.text)}</p>
            <StepTimers text={current.text} />
            {current.photo_id && <img className="cook-photo" src={photoUrl(current.photo_id)} alt="" />}
          </>
        ) : (
          <ul className="cook-ingredients">
            {recipe.ingredients.map((i, n) => {
              const heading = i.section && i.section !== recipe.ingredients[n - 1]?.section;
              return (
                <li key={i.id}>
                  {heading && <h3>{i.section}</h3>}
                  <label className={ticked.includes(i.id) ? "ticked" : ""}>
                    <input type="checkbox" checked={ticked.includes(i.id)} onChange={() => toggle(i.id)} />
                    <span>{formatIngredientLine(i, units, factor)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <footer className="cook-foot">
        <button className="button big" disabled={step < 0} onClick={() => setStep(step - 1)}>← Back</button>
        {step < last ? (
          <button className="button primary big" onClick={() => setStep(step + 1)}>
            {step < 0 ? "Start cooking →" : "Next →"}
          </button>
        ) : (
          <button className="button primary big" onClick={props.onClose}>Finished</button>
        )}
      </footer>
    </div>
  );
}
