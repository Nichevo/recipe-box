import type { Env } from "./env";

/**
 * Nightly backup to Dropbox (an "App folder" app, so it only sees its own folder):
 * - data/recipe-box-YYYY-MM-DD.json.gz: every table except synced grocery rows, kept 30 days
 * - photos/<id>: each photo once, a batch per run, oldest first
 */

const TOKEN_KEY = "backup.dropbox_refresh";
const STATE_KEY = "backup.dropbox_state";
const LAST_KEY = "backup.last_run";
const ERROR_KEY = "backup.last_error";
const DATA_KEY = "backup.last_data";
const PHOTO_CURSOR = "backup.photo_cursor";
/** Photos per run: keeps a run well inside the Workers subrequest limit. */
const PHOTOS_PER_RUN = 25;
const KEEP_DAYS = 30;
/** Tables left out: the grocery rows come back from the sheet, and internal tables. */
const SKIP_TABLES = new Set(["purchases", "d1_migrations"]);
/** Settings never written to the backup. */
const SECRET_SETTINGS = [TOKEN_KEY, STATE_KEY];

export const dropboxConfigured = (env: Env) => !!env.DROPBOX_APP_KEY && !!env.DROPBOX_APP_SECRET;

async function getSetting(db: D1Database, key: string) {
  return (await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>())?.value ?? null;
}
export async function putSetting(db: D1Database, key: string, value: string | null) {
  if (value === null) await db.prepare("DELETE FROM settings WHERE key = ?").bind(key).run();
  else await db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, value).run();
}

export class BackupError extends Error {}

// --- Dropbox sign-in -------------------------------------------------------

export async function connectUrl(env: Env, redirectUri: string) {
  const state = crypto.randomUUID();
  await putSetting(env.DB, STATE_KEY, state);
  const q = new URLSearchParams({ client_id: env.DROPBOX_APP_KEY!, response_type: "code", token_access_type: "offline", redirect_uri: redirectUri, state });
  return `https://www.dropbox.com/oauth2/authorize?${q}`;
}

export async function finishConnect(env: Env, code: string, state: string, redirectUri: string) {
  const expected = await getSetting(env.DB, STATE_KEY);
  if (!expected || expected !== state) throw new BackupError("The Dropbox sign-in expired. Try Connect again.");
  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, grant_type: "authorization_code", client_id: env.DROPBOX_APP_KEY!, client_secret: env.DROPBOX_APP_SECRET!, redirect_uri: redirectUri })
  });
  const body = (await res.json().catch(() => null)) as { refresh_token?: string; error_description?: string } | null;
  if (!res.ok || !body?.refresh_token) throw new BackupError(`Dropbox said no: ${body?.error_description ?? res.status}`);
  await putSetting(env.DB, TOKEN_KEY, body.refresh_token);
  await putSetting(env.DB, STATE_KEY, null);
}

export async function disconnect(env: Env) {
  const refresh = await getSetting(env.DB, TOKEN_KEY);
  if (refresh && dropboxConfigured(env)) {
    const token = await accessToken(env, refresh).catch(() => null);
    if (token) await fetch("https://api.dropboxapi.com/2/auth/token/revoke", { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  }
  await putSetting(env.DB, TOKEN_KEY, null);
}

async function accessToken(env: Env, refresh: string): Promise<string> {
  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, client_id: env.DROPBOX_APP_KEY!, client_secret: env.DROPBOX_APP_SECRET! })
  });
  const body = (await res.json().catch(() => null)) as { access_token?: string } | null;
  if (!res.ok || !body?.access_token) throw new BackupError(res.status === 400 ? "Dropbox access was removed. Connect Dropbox again." : `Dropbox sign-in failed (${res.status}).`);
  return body.access_token;
}

// --- Dropbox files ---------------------------------------------------------

async function upload(token: string, path: string, data: BodyInit) {
  const res = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({ path, mode: "overwrite", mute: true })
    },
    body: data
  });
  if (!res.ok) throw new BackupError(`Dropbox upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

async function rpc<T>(token: string, endpoint: string, args: unknown): Promise<T | null> {
  const res = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args)
  });
  if (res.status === 409) return null; // e.g. the folder doesn't exist yet
  if (!res.ok) throw new BackupError(`Dropbox ${endpoint} failed (${res.status}).`);
  return (await res.json()) as T;
}

// --- The backup ------------------------------------------------------------

/** Every table (bar the skipped ones) as { table: rows[] }. */
export async function exportData(db: D1Database) {
  const { results: tables } = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name")
    .all<{ name: string }>();
  const out: Record<string, unknown[]> = {};
  for (const { name } of tables) {
    if (SKIP_TABLES.has(name)) continue;
    const { results } = await db.prepare(`SELECT * FROM "${name.replace(/"/g, '""')}"`).all();
    out[name] = name === "settings" ? results.filter((r) => !SECRET_SETTINGS.includes((r as { key: string }).key)) : results;
  }
  return { app: "recipe-box", version: 1, exported_at: new Date().toISOString(), tables: out };
}

async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

export interface BackupResult {
  data: boolean;
  photos: number;
  photosLeft: number;
}

/**
 * One backup step: today's data file (once a day unless forced) and the next
 * batch of photos. Call again while photosLeft > 0 to catch up.
 */
export async function runBackup(env: Env, opts: { force?: boolean } = {}): Promise<BackupResult> {
  if (!dropboxConfigured(env)) throw new BackupError("Dropbox isn't set up (see the setup guide).");
  const refresh = await getSetting(env.DB, TOKEN_KEY);
  if (!refresh) throw new BackupError("Dropbox isn't connected yet.");
  try {
    const token = await accessToken(env, refresh);
    const today = new Date().toISOString().slice(0, 10);
    let data = false;
    if (opts.force || (await getSetting(env.DB, DATA_KEY)) !== today) {
      const dump = await exportData(env.DB);
      await upload(token, `/data/recipe-box-${today}.json.gz`, await gzip(JSON.stringify(dump)));
      await putSetting(env.DB, DATA_KEY, today);
      data = true;
      // Keep the last month of daily files.
      const list = await rpc<{ entries: { name: string; path_lower: string }[] }>(token, "files/list_folder", { path: "/data" });
      const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
      const old = (list?.entries ?? []).filter((e) => /^recipe-box-(\d{4}-\d{2}-\d{2})\.json\.gz$/.test(e.name) && e.name.slice(11, 21) < cutoff);
      if (old.length) await rpc(token, "files/delete_batch", { entries: old.slice(0, 100).map((e) => ({ path: e.path_lower })) });
    }

    // Photos, oldest first, picking up after the last one sent.
    const cursor = (await getSetting(env.DB, PHOTO_CURSOR)) ?? "";
    const { results: photos } = await env.DB.prepare(
      "SELECT id, r2_key, created_at || '|' || id AS k FROM photos WHERE created_at || '|' || id > ? ORDER BY k LIMIT ?"
    )
      .bind(cursor, PHOTOS_PER_RUN)
      .all<{ id: string; r2_key: string; k: string }>();
    let sent = 0;
    for (const p of photos) {
      const obj = await env.PHOTOS.get(p.r2_key);
      if (obj) {
        const ext = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" }[obj.httpMetadata?.contentType ?? ""] ?? "";
        await upload(token, `/photos/${p.id}${ext}`, await obj.arrayBuffer());
        sent++;
      }
      await putSetting(env.DB, PHOTO_CURSOR, p.k);
    }
    const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM photos WHERE created_at || '|' || id > ?")
      .bind(photos.at(-1)?.k ?? cursor)
      .first<{ n: number }>();
    await putSetting(env.DB, LAST_KEY, new Date().toISOString());
    await putSetting(env.DB, ERROR_KEY, null);
    return { data, photos: sent, photosLeft: left?.n ?? 0 };
  } catch (e) {
    await putSetting(env.DB, ERROR_KEY, `${new Date().toISOString()} ${(e as Error).message}`.slice(0, 500));
    throw e;
  }
}

export async function backupStatus(env: Env) {
  const [refresh, last, error, cursor, total] = await Promise.all([
    getSetting(env.DB, TOKEN_KEY),
    getSetting(env.DB, LAST_KEY),
    getSetting(env.DB, ERROR_KEY),
    getSetting(env.DB, PHOTO_CURSOR),
    env.DB.prepare("SELECT COUNT(*) AS n FROM photos").first<{ n: number }>()
  ]);
  const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM photos WHERE created_at || '|' || id > ?").bind(cursor ?? "").first<{ n: number }>();
  return {
    configured: dropboxConfigured(env),
    connected: !!refresh,
    lastRun: last,
    lastError: error,
    photosTotal: total?.n ?? 0,
    photosLeft: left?.n ?? 0
  };
}
