import { useEffect, useRef, useState } from "react";
import { createRecipe, getRecipe, listTags, photoUrl, updateRecipe, uploadPhoto, type Tag } from "../api";
import type { FodmapRating, RecipeInput } from "../../shared/types";
import { parseIngredientBlock } from "../../shared/ingredients";
import { preparePhoto } from "../photo";
import { go } from "../router";
import { takeDraft } from "../draft";

interface StepDraft {
  key: string;
  text: string;
  photo_id: string | null;
}

const newStep = (text = ""): StepDraft => ({ key: crypto.randomUUID(), text, photo_id: null });

export function EditRecipe({ id }: { id?: string }) {
  const [loaded, setLoaded] = useState(!id);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [servings, setServings] = useState("");
  const [prep, setPrep] = useState("");
  const [cook, setCook] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceType, setSourceType] = useState<RecipeInput["source_type"]>("manual");
  const [fromDraft, setFromDraft] = useState(false);
  const [notes, setNotes] = useState("");
  const [fodmap, setFodmap] = useState<FodmapRating | "">("");
  const [tags, setTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [newTag, setNewTag] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>([newStep()]);
  const [hero, setHero] = useState<string | null>(null);
  const [originals, setOriginals] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTags().then(setAllTags).catch(() => setAllTags([]));
    if (!id) {
      const d = takeDraft();
      if (d) {
        setFromDraft(true);
        setTitle(d.title ?? "");
        setSummary(d.summary ?? "");
        setServings(d.servings?.toString() ?? "");
        setPrep(d.prep_minutes?.toString() ?? "");
        setCook(d.cook_minutes?.toString() ?? "");
        setSourceUrl(d.source_url ?? "");
        setSourceName(d.source_name ?? "");
        setSourceType(d.source_type ?? "manual");
        setNotes(d.notes ?? "");
        setTags(d.tags ?? []);
        setHero(d.hero_photo_id ?? null);
        setOriginals(d.original_photo_ids ?? []);
        setIngredients(d.ingredients_text ?? "");
        if (d.steps?.length) setSteps(d.steps.map((s) => ({ ...newStep(s.text), photo_id: s.photo_id ?? null })));
      }
      return;
    }
    getRecipe(id)
      .then((r) => {
        setTitle(r.title);
        setSummary(r.summary ?? "");
        setServings(r.servings?.toString() ?? "");
        setPrep(r.prep_minutes?.toString() ?? "");
        setCook(r.cook_minutes?.toString() ?? "");
        setSourceUrl(r.source_url ?? "");
        setSourceName(r.source_name ?? "");
        setNotes(r.notes ?? "");
        setFodmap(r.fodmap_override ? (r.fodmap_rating ?? "") : "");
        setTags(r.tags.map((t) => t.name));
        setHero(r.hero_photo_id);
        let section: string | null = null;
        const lines: string[] = [];
        for (const i of r.ingredients) {
          if (i.section !== section) {
            section = i.section;
            if (section) lines.push(`${lines.length ? "\n" : ""}${section}:`);
          }
          lines.push(i.original_text);
        }
        setIngredients(lines.join("\n"));
        setSteps(r.steps.length ? r.steps.map((s) => ({ key: s.id, text: s.text, photo_id: s.photo_id })) : [newStep()]);
        // "Read recipe from photo" on the recipe page: fill in what the AI read, keeping the title and photos.
        const d = takeDraft(id);
        if (d) {
          setFromDraft(true);
          if (d.replace) setSummary(d.summary ?? "");
          else if (!r.summary && d.summary) setSummary(d.summary);
          if (d.servings) setServings(String(d.servings));
          if (d.prep_minutes) setPrep(String(d.prep_minutes));
          if (d.cook_minutes) setCook(String(d.cook_minutes));
          if (d.replace) setNotes(d.notes ?? "");
          else if (d.notes) setNotes([r.notes, d.notes].filter(Boolean).join("\n\n"));
          if (d.tags?.length) setTags((t) => [...new Set([...t, ...d.tags!])]);
          if (d.ingredients_text) setIngredients(d.ingredients_text);
          // Keep step photos in place when tidying (matched by position).
          if (d.steps?.length) setSteps(d.steps.map((s, n) => ({ ...newStep(s.text), photo_id: d.replace ? (r.steps[n]?.photo_id ?? null) : null })));
        }
        setLoaded(true);
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  const toggleTag = (name: string) =>
    setTags((t) => (t.includes(name) ? t.filter((x) => x !== name) : [...t, name]));

  const addTag = () => {
    const name = newTag.trim();
    if (name && !tags.some((t) => t.toLowerCase() === name.toLowerCase())) setTags([...tags, name]);
    setNewTag("");
  };

  const upload = async (file: File, kind: string): Promise<string | null> => {
    setBusy("Uploading photo…");
    try {
      const { blob, width, height } = await preparePhoto(file);
      const { id: photoId } = await uploadPhoto(blob, kind, width, height);
      return photoId;
    } catch (e) {
      setError(`Photo upload failed: ${(e as Error).message}`);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const updateStep = (key: string, patch: Partial<StepDraft>) =>
    setSteps((s) => s.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  /** Pasting several paragraphs into a step splits them into separate steps. */
  const pasteSteps = (key: string, text: string): boolean => {
    const parts = text.split(/\n\s*\n|\n(?=\s*\d+[.)]\s)/).map((p) => p.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean);
    if (parts.length < 2) return false;
    setSteps((s) => {
      const i = s.findIndex((x) => x.key === key);
      const current = s[i]!;
      const first = { ...current, text: current.text ? `${current.text} ${parts[0]}` : parts[0]! };
      return [...s.slice(0, i), first, ...parts.slice(1).map((p) => newStep(p)), ...s.slice(i + 1)];
    });
    return true;
  };

  const save = async () => {
    setError(null);
    if (!title.trim()) {
      setError("Please give the recipe a title.");
      return;
    }
    const body: RecipeInput = {
      title,
      summary,
      servings: servings ? Number(servings) : null,
      prep_minutes: prep ? Number(prep) : null,
      cook_minutes: cook ? Number(cook) : null,
      source_url: sourceUrl || null,
      source_name: sourceName || null,
      source_type: sourceType,
      notes,
      fodmap_rating: fodmap || null,
      hero_photo_id: hero,
      original_photo_ids: originals,
      tags,
      ingredients_text: ingredients,
      steps: steps.map((s) => ({ text: s.text, photo_id: s.photo_id }))
    };
    setBusy("Saving…");
    try {
      const res = id ? await updateRecipe(id, body) : await createRecipe(body);
      go(`#/recipe/${encodeURIComponent(res.id)}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!loaded) return <p className="muted">{error ?? "Loading…"}</p>;

  const parsedCount = parseIngredientBlock(ingredients).length;
  const ofKind = (k: Tag["kind"]) => allTags.filter((t) => t.kind === k).map((t) => t.name);
  const known = new Set(allTags.filter((t) => t.kind !== "custom").map((t) => t.name.toLowerCase()));
  const otherTags = [...new Set([...ofKind("custom"), ...tags])].filter((n) => !known.has(n.toLowerCase()));
  const tagGroup = (label: string, names: string[]) => (
    <>
      <span className="tag-group-label">{label}</span>
      <div className="chips">
        {names.map((n) => (
          <button key={n} type="button" className={tags.includes(n) ? "chip on" : "chip"} onClick={() => toggleTag(n)}>
            {n}
          </button>
        ))}
      </div>
    </>
  );

  return (
    <section className="form">
      <a className="back" href={id ? `#/recipe/${encodeURIComponent(id)}` : "#/"}>← Cancel</a>
      <h1>{id ? "Edit recipe" : "New recipe"}</h1>
      {fromDraft && <p className="notice">Check the details below, then tap Save.</p>}

      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Chicken traybake" />
      </label>

      <div className="field">
        <span>Main photo</span>
        <PhotoPicker photoId={hero} onPick={async (f) => setHero(await upload(f, "hero"))} onRemove={() => setHero(null)} />
      </div>

      {originals.length > 0 && (
        <div className="field">
          <span>Original page{originals.length > 1 ? "s" : ""} <span className="muted small">kept with the recipe</span></span>
          <div className="row wrap">
            {originals.map((p) => (
              <img key={p} className="page-thumb" src={photoUrl(p)} alt="" />
            ))}
          </div>
        </div>
      )}

      <label>
        Short description
        <textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </label>

      <div className="grid3">
        <label>
          Serves
          <input inputMode="decimal" value={servings} onChange={(e) => setServings(e.target.value)} />
        </label>
        <label>
          Prep (min)
          <input inputMode="numeric" value={prep} onChange={(e) => setPrep(e.target.value)} />
        </label>
        <label>
          Cook (min)
          <input inputMode="numeric" value={cook} onChange={(e) => setCook(e.target.value)} />
        </label>
      </div>

      <div className="field">
        <span>Tags</span>
        {tagGroup("Meal", ofKind("course"))}
        {tagGroup("Cuisine", ofKind("cuisine"))}
        {tagGroup("Diet", ofKind("diet"))}
        <span className="tag-group-label">Other</span>
        <div className="chips">
          {otherTags.map((n) => (
            <button key={n} type="button" className={tags.includes(n) ? "chip on" : "chip"} onClick={() => toggleTag(n)}>
              {n}
            </button>
          ))}
          <input
            className="chip-input"
            value={newTag}
            placeholder="New tag (e.g. Weeknight)"
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            onBlur={addTag}
          />
        </div>
      </div>

      <label>
        FODMAP rating
        <select value={fodmap} onChange={(e) => setFodmap(e.target.value as FodmapRating | "")}>
          <option value="">Work it out from the ingredients</option>
          <option value="low">Low</option>
          <option value="moderate">Moderate</option>
          <option value="high">High</option>
        </select>
      </label>

      <label>
        Ingredients <span className="muted small">one per line; a line ending in ":" starts a section</span>
        <textarea
          rows={10}
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
          placeholder={"600 g chicken thighs\n2 lemons, zested\n1 1/2 cups stock\n\nFor the sauce:\n2 tbsp olive oil"}
        />
        <span className="muted small">{parsedCount} ingredient{parsedCount === 1 ? "" : "s"}</span>
      </label>

      <div className="field">
        <span>Method <span className="muted small">pasting several paragraphs splits them into steps</span></span>
        <ol className="step-editor">
          {steps.map((s, i) => (
            <li key={s.key}>
              <textarea
                rows={3}
                value={s.text}
                placeholder={`Step ${i + 1}`}
                onChange={(e) => updateStep(s.key, { text: e.target.value })}
                onPaste={(e) => {
                  if (pasteSteps(s.key, e.clipboardData.getData("text"))) e.preventDefault();
                }}
              />
              <div className="row">
                <PhotoPicker
                  small
                  photoId={s.photo_id}
                  onPick={async (f) => updateStep(s.key, { photo_id: await upload(f, "step") })}
                  onRemove={() => updateStep(s.key, { photo_id: null })}
                />
                {steps.length > 1 && (
                  <button type="button" className="link" onClick={() => setSteps(steps.filter((x) => x.key !== s.key))}>
                    Remove step
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
        <button type="button" className="button" onClick={() => setSteps([...steps, newStep()])}>+ Add step</button>
      </div>

      <label>
        Notes
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <label>
        Source link
        <input type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://" />
      </label>

      {error && <p className="error">{error}</p>}
      <div className="row actions sticky">
        <button className="button primary" onClick={save} disabled={!!busy}>
          {busy ?? "Save recipe"}
        </button>
      </div>
    </section>
  );
}

function PhotoPicker(props: { photoId: string | null; small?: boolean; onPick: (f: File) => void; onRemove: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className={props.small ? "photo-picker small" : "photo-picker"}>
      {props.photoId && <img src={photoUrl(props.photoId)} alt="" />}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) props.onPick(f);
          e.target.value = "";
        }}
      />
      <button type="button" className="button" onClick={() => input.current?.click()}>
        {props.photoId ? "Change photo" : props.small ? "+ Photo" : "Add photo"}
      </button>
      {props.photoId && (
        <button type="button" className="link" onClick={props.onRemove}>Remove</button>
      )}
    </div>
  );
}
