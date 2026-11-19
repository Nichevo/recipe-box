import { useEffect, useState } from "react";
import { deleteRecipe, getRecipe, starRecipe, photoUrl, type IngredientRow, type RecipeDetail } from "../api";
import { formatQuantity, parseIngredient } from "../../shared/ingredients";
import { convertTemperaturesInText, displayQuantity, type DisplayMode } from "../../shared/units";
import { FodmapBadge, StarButton, UnitsToggle } from "../components";
import { go } from "../router";
import { totalTime } from "./Browse";

export function RecipePage({ id, units, onUnits }: { id: string; units: DisplayMode; onUnits: (m: DisplayMode) => void }) {
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRecipe(id).then(setRecipe).catch((e: Error) => setError(e.message));
  }, [id]);

  if (error) return <p className="muted">Couldn't load this recipe ({error}).</p>;
  if (!recipe) return <p className="muted">Loading…</p>;

  const remove = async () => {
    if (!confirm(`Delete "${recipe.title}"? This can't be undone.`)) return;
    await deleteRecipe(recipe.id);
    go("#/");
  };

  const toggleStar = () => {
    const starred = !recipe.starred_at;
    setRecipe({ ...recipe, starred_at: starred ? new Date().toISOString() : null });
    starRecipe(recipe.id, starred).catch(() => setRecipe(recipe));
  };

  const sections = groupBySection(recipe.ingredients);
  const time = totalTime(recipe.prep_minutes, recipe.cook_minutes);
  const highItems = recipe.ingredients.filter((i) => i.item_fodmap === "high");

  return (
    <article className="recipe">
      <a className="back" href="#/">← Recipes</a>
      {recipe.hero_photo_id && <img className="hero" src={photoUrl(recipe.hero_photo_id)} alt="" />}
      <div className="row between title-row">
        <h1>{recipe.title}</h1>
        <StarButton starred={!!recipe.starred_at} onToggle={toggleStar} />
      </div>
      <div className="chips">
        {recipe.fodmap_rating && <FodmapBadge rating={recipe.fodmap_rating} />}
        {recipe.tags.map((t) => (
          <span key={t.name} className="chip static">{t.name}</span>
        ))}
      </div>
      {recipe.summary && <p>{recipe.summary}</p>}
      <p className="muted">
        {[
          recipe.servings ? `Serves ${formatQuantity(recipe.servings)}` : null,
          recipe.prep_minutes ? `Prep ${recipe.prep_minutes} min` : null,
          recipe.cook_minutes ? `Cook ${recipe.cook_minutes} min` : null,
          time && recipe.prep_minutes && recipe.cook_minutes ? `Total ${time}` : null
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      <div className="row between">
        <h2>Ingredients</h2>
        <UnitsToggle mode={units} onChange={onUnits} />
      </div>
      {sections.map(([section, items]) => (
        <div key={section ?? "_"}>
          {section && <h3>{section}</h3>}
          <ul className="ingredients">
            {items.map((i) => (
              <li key={i.id} className={i.item_fodmap === "high" ? "fodmap-flag" : undefined}>
                {formatIngredient(i, units)}
                {i.item_fodmap === "high" && <span className="badge fodmap-high small">High FODMAP</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {highItems.length > 0 && (
        <p className="muted small">Flagged ingredients raise this recipe's FODMAP level.</p>
      )}

      <h2>Method</h2>
      <ol className="steps">
        {recipe.steps.map((s) => (
          <li key={s.id}>
            <p>{units === "as_written" ? s.text : convertTemperaturesInText(s.text, units === "metric" ? "C" : "F")}</p>
            {s.photo_id && <img className="step-photo" src={photoUrl(s.photo_id)} alt="" loading="lazy" />}
          </li>
        ))}
      </ol>

      {recipe.notes && (
        <>
          <h2>Notes</h2>
          <p className="pre">{recipe.notes}</p>
        </>
      )}
      {recipe.source_url && (
        <p className="muted small">
          Source:{" "}
          <a href={recipe.source_url} target="_blank" rel="noopener noreferrer">
            {recipe.source_name || new URL(recipe.source_url).hostname}
          </a>
        </p>
      )}

      <div className="row actions">
        <a className="button" href={`#/edit/${encodeURIComponent(recipe.id)}`}>Edit</a>
        <button className="button danger" onClick={remove}>Delete</button>
      </div>
    </article>
  );
}

function groupBySection(rows: IngredientRow[]): [string | null, IngredientRow[]][] {
  const out: [string | null, IngredientRow[]][] = [];
  for (const r of rows) {
    const last = out.at(-1);
    if (last && last[0] === r.section) last[1].push(r);
    else out.push([r.section, [r]]);
  }
  return out;
}

export function formatIngredient(i: IngredientRow, mode: DisplayMode): string {
  if (mode === "as_written" || i.quantity === null || !i.unit) return i.original_text;
  const d = displayQuantity(i.quantity, i.unit, mode);
  const max = i.quantity_max !== null ? displayQuantity(i.quantity_max, i.unit, mode) : null;
  const qty = max ? `${formatQuantity(d.quantity)}–${formatQuantity(max.quantity)}` : formatQuantity(d.quantity);
  const name = parseIngredient(i.original_text).name; // keeps the original capitalisation
  return [`${qty} ${d.unit} ${name}`.trim(), i.preparation].filter(Boolean).join(", ");
}
