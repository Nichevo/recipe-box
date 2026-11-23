import { useEffect, useState } from "react";
import { backupStatus, disconnectDropbox, runBackup, type BackupStatus } from "../api";

/** Settings: the nightly Dropbox backup. */
export function BackupSettings() {
  const [s, setS] = useState<BackupStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => backupStatus().then(setS).catch((e: Error) => setError(e.message));
  useEffect(() => void load(), []);
  if (!s) return error ? <p className="error small">{error}</p> : null;

  const now = async () => {
    setError(null);
    try {
      let r = await runBackup(true);
      for (let i = 0; r.photosLeft > 0 && i < 200; i++) {
        setBusy(`Backing up photos… ${r.photosLeft} to go`);
        r = await runBackup();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      void load();
    }
  };
  const off = async () => {
    if (!confirm("Stop backing up to Dropbox? Files already in Dropbox stay there.")) return;
    await disconnectDropbox().catch((e: Error) => setError(e.message));
    void load();
  };

  if (!s.configured) {
    return (
      <p className="muted small">
        Not set up. Create a Dropbox app and add its key and secret as GitHub secrets (see the setup guide, section 8). Its redirect URI is{" "}
        <code>{s.redirectUri}</code>
      </p>
    );
  }
  if (!s.connected) {
    return (
      <>
        <p className="muted small">Each night the app saves all recipes, notes and settings, plus new photos, to its own folder in Dropbox.</p>
        <a className="button" href="/api/backup/dropbox/connect">
          Connect Dropbox
        </a>
        <p className="muted small">
          The Dropbox app's redirect URI must be <code>{s.redirectUri}</code>
        </p>
      </>
    );
  }
  const backed = s.photosTotal - s.photosLeft;
  return (
    <>
      <p className="small">
        Backing up to Dropbox each night.{" "}
        {s.lastRun ? `Last backup ${new Date(s.lastRun).toLocaleString()}.` : "No backup yet."} Photos: {backed} of {s.photosTotal}
        {s.photosLeft ? " (the rest go a batch a night, or tap Back up now)" : ""}.
      </p>
      {s.lastError && <p className="small warn">Last problem: {s.lastError.replace(/^\S+ /, "")}</p>}
      <div className="row">
        <button className="button" disabled={!!busy} onClick={() => void now()}>
          {busy ?? "Back up now"}
        </button>
        <button className="link small" disabled={!!busy} onClick={() => void off()}>
          Disconnect
        </button>
      </div>
      {error && <p className="error small">{error}</p>}
    </>
  );
}
