import { useState } from "react";
import type { Nutrition } from "../../shared/ai-recipe";
import { aiNutrition } from "../api";

const fmt = (n: number | null, unit: string) => (n == null ? "–" : `${unit === "kcal" ? Math.round(n) : Math.round(n * 10) / 10}${unit === "kcal" ? "" : " g"}`);

/** Nutrition per serving, from the recipe's own figures or an AI estimate. */
export function NutritionBox(props: { recipeId: string; nutrition: Nutrition | null; stale: boolean; canWork: boolean }) {
  const [n, setN] = useState(props.nutrition);
  const [stale, setStale] = useState(props.stale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const work = async () => {
    setBusy(true);
    setError(null);
    try {
      setN(await aiNutrition(props.recipeId));
      setStale(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!n && !props.canWork) return null;
  return (
    <section className="nutrition">
      <h2>Nutrition per serving</h2>
      {n ? (
        <>
          <dl className="nutri-grid">
            <div className="key">
              <dt>Net carbs</dt>
              <dd>{fmt(n.net_carbs_g, "g")}</dd>
            </div>
            <div>
              <dt>Calories</dt>
              <dd>{fmt(n.calories, "kcal")}</dd>
            </div>
            <div>
              <dt>Protein</dt>
              <dd>{fmt(n.protein_g, "g")}</dd>
            </div>
            <div>
              <dt>Fat</dt>
              <dd>{fmt(n.fat_g, "g")}</dd>
            </div>
            <div>
              <dt>Carbs</dt>
              <dd>{fmt(n.carbs_g, "g")}</dd>
            </div>
            <div>
              <dt>Fibre</dt>
              <dd>{fmt(n.fibre_g, "g")}</dd>
            </div>
          </dl>
          <p className="muted small">
            {n.source === "recipe" ? "From the recipe's own figures" : "Estimated by AI from the ingredients"}
            {n.servings ? `, for ${n.servings} servings` : ""}.{n.sugar_alcohols_g ? ` Net carbs leave out ${fmt(n.sugar_alcohols_g, "g")} of sugar alcohols.` : ""}{" "}
            {n.note}
          </p>
          {stale && <p className="small warn">The recipe has changed since this was worked out.</p>}
          {props.canWork && (
            <button className="link small" disabled={busy} onClick={() => void work()}>
              {busy ? "Working it out…" : "Work it out again"}
            </button>
          )}
        </>
      ) : (
        <button className="button" disabled={busy} onClick={() => void work()}>
          {busy ? "Working it out… (up to a minute)" : "Work out nutrition"}
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
