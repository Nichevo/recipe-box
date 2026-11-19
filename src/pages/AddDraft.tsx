import { useEffect, useState } from "react";
import { aiDraft, aiStatus, listTags, type AiStatus, type Tag } from "../api";
import { draftToInput } from "../ai-draft";
import { setDraft } from "../draft";
import { go } from "../router";
import { AiOffNotice } from "./Settings";

/** Describe a dish and let the AI write a first version of the recipe. */
export function AddDraft() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    aiStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  const write = async () => {
    setBusy(true);
    setError(null);
    try {
      const [res, known] = await Promise.all([aiDraft(prompt), listTags().catch(() => [] as Tag[])]);
      if (!res.draft.ok) {
        setError(res.draft.problem || "The AI couldn't write that one. Try describing it differently.");
        return;
      }
      const input = draftToInput(res.draft, known);
      setDraft({ ...input, source_type: "ai", notes: [input.notes, `Drafted with AI from: “${prompt.trim()}”`].filter(Boolean).join("\n\n") });
      go("#/new");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="form">
      <a className="back" href="#/add">← Back</a>
      <h1>Draft with AI</h1>
      <p className="muted">Describe what you'd like to make. The AI writes a first version for you to check and change before saving.</p>
      {status && !status.available && <AiOffNotice />}
      <label>
        What would you like to make?
        <textarea
          rows={4}
          value={prompt}
          maxLength={2000}
          disabled={busy}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="A quick low FODMAP chicken curry for 4, no onion or garlic, ready in 40 minutes"
        />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="row actions sticky">
        <button className="button primary" disabled={busy || !prompt.trim() || status?.available === false} onClick={write}>
          {busy ? "Writing the recipe… (up to a minute)" : "Write recipe"}
        </button>
      </div>
    </section>
  );
}
