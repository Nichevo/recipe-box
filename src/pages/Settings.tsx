import { useEffect, useState } from "react";
import { aiStatus, getSettings, putSettings, type AiStatus, type Settings as SettingsMap } from "../api";

/** Shown on the AI screens when no AI is switched on and set up. */
export function AiOffNotice() {
  return (
    <p className="notice">
      AI isn't available right now. Switch it on, or check it's set up, in <a href="#/settings">Settings</a>.
    </p>
  );
}

export function Settings() {
  const [values, setValues] = useState<SettingsMap | null>(null);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [model, setModel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const refresh = () => aiStatus().then(setStatus).catch(() => setStatus(null));
  useEffect(() => {
    getSettings()
      .then((s) => {
        setValues(s);
        setModel(s["ai.ollama_model"] ?? "");
      })
      .catch((e: Error) => setError(e.message));
    void refresh();
  }, []);

  const save = async (patch: SettingsMap) => {
    setError(null);
    setSaved(false);
    const before = values;
    setValues({ ...values, ...patch });
    try {
      await putSettings(patch);
      setSaved(true);
      await refresh();
    } catch (e) {
      setValues(before);
      setError((e as Error).message);
    }
  };

  if (!values) return <p className="muted">{error ?? "Loading…"}</p>;
  const on = (key: string, dflt: boolean) => (values[key] ?? String(dflt)) === "true";

  const toggle = (key: string, dflt: boolean, label: string, hint: string) => (
    <label className="switch-row">
      <input type="checkbox" checked={on(key, dflt)} onChange={(e) => void save({ [key]: String(e.target.checked) })} />
      <span>
        <strong>{label}</strong>
        <span className="muted small"> {hint}</span>
      </span>
    </label>
  );

  return (
    <section className="form">
      <a className="back" href="#/add">← Back</a>
      <h1>Settings</h1>

      <h2>AI</h2>
      <p className="muted small">Used to scan book pages, read recipes from photos and draft new recipes.</p>
      {toggle("ai.claude_enabled", true, "Use Claude", "Anthropic's AI, over the internet. Each use costs a few cents.")}
      {status && !status.claude.configured && (
        <p className="small warn">Claude isn't set up yet: its API key hasn't been added (see the setup guide).</p>
      )}

      {toggle("ai.ollama_enabled", false, "Use the home PC (Ollama)", "Runs on your own computer, free, but it has to be switched on.")}
      {on("ai.ollama_enabled", false) && (
        <>
          <label>
            Ollama model
            <div className="row">
              <input className="grow" value={model} placeholder="e.g. qwen2.5vl:32b" onChange={(e) => setModel(e.target.value.trim())} />
              <button
                className="button"
                disabled={model === (values["ai.ollama_model"] ?? "")}
                onClick={() => void save({ "ai.ollama_model": model })}
              >
                Save
              </button>
            </div>
            <span className="muted small">Pick a model that can read images, so scanning works.</span>
          </label>
          {status && !status.ollama.configured && (
            <p className="small warn">The home PC's address hasn't been added yet (see the setup guide).</p>
          )}
          {toggle("ai.fallback_to_claude", true, "Use Claude when the PC is off", "If the home PC doesn't answer, ask Claude instead.")}
        </>
      )}

      {status && (
        <p className={status.available ? "muted small" : "small warn"}>
          {status.available
            ? `AI is ready${on("ai.ollama_enabled", false) && status.ollama.configured && status.ollama.model ? " (home PC first)" : " (Claude)"}.`
            : "AI is not available: nothing is both switched on and set up."}
        </p>
      )}
      {error && <p className="error">{error}</p>}
      {saved && !error && <p className="muted small">Saved.</p>}
    </section>
  );
}
