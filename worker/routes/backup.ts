import { Hono } from "hono";
import type { Env } from "../env";
import { backupStatus, BackupError, connectUrl, disconnect, dropboxConfigured, finishConnect, runBackup } from "../backup";

/** /api/backup: the nightly Dropbox backup. */
export const backup = new Hono<{ Bindings: Env }>();

const callbackUrl = (reqUrl: string) => `${new URL(reqUrl).origin}/api/backup/dropbox/callback`;

backup.get("/status", async (c) => c.json({ ...(await backupStatus(c.env)), redirectUri: callbackUrl(c.req.url) }));

/** GET /api/backup/dropbox/connect: off to Dropbox to allow access. */
backup.get("/dropbox/connect", async (c) => {
  if (!dropboxConfigured(c.env)) return c.text("Dropbox isn't set up yet (see the setup guide).", 400);
  return c.redirect(await connectUrl(c.env, callbackUrl(c.req.url)));
});

/** GET /api/backup/dropbox/callback: Dropbox sends the person back here. */
backup.get("/dropbox/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state") ?? "";
  if (!code) return c.redirect("/#/settings?backup=cancelled");
  try {
    await finishConnect(c.env, code, state, callbackUrl(c.req.url));
  } catch (e) {
    return c.text((e as Error).message, 400);
  }
  return c.redirect("/#/settings");
});

backup.post("/dropbox/disconnect", async (c) => {
  await disconnect(c.env);
  return c.json({ ok: true });
});

/** POST /api/backup/run { force? }: one step; the app calls again while photosLeft > 0. */
backup.post("/run", async (c) => {
  const body = await c.req.json<{ force?: unknown }>().catch(() => ({}) as { force?: unknown });
  try {
    return c.json(await runBackup(c.env, { force: body.force === true }));
  } catch (e) {
    if (e instanceof BackupError) return c.json({ error: e.message }, 502);
    throw e;
  }
});
