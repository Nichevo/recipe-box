import { afterEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runBackup, putSetting } from "../worker/backup";
import type { Env } from "../worker/env";

/** A small D1 stand-in over SQLite, with the app's migrations applied. */
function fakeD1() {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync("migrations").sort()) db.exec(readFileSync(join("migrations", f), "utf8"));
  const prep = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => prep(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...(args as never[])) }),
    first: async () => db.prepare(sql).get(...(args as never[])) ?? null,
    run: async () => db.prepare(sql).run(...(args as never[]))
  });
  return { sqlite: db, d1: { prepare: (sql: string) => prep(sql), batch: async (s: { run: () => Promise<unknown> }[]) => Promise.all(s.map((x) => x.run())) } };
}

afterEach(() => vi.unstubAllGlobals());

describe("Dropbox backup", () => {
  it("uploads the data and photos, leaves out secrets, and restores", async () => {
    const { sqlite, d1 } = fakeD1();
    sqlite.exec("INSERT INTO recipes (id, title) VALUES ('r1', 'Test soup')");
    sqlite.exec("INSERT INTO photos (id, kind, r2_key, recipe_id) VALUES ('p1', 'hero', 'photos/p1', 'r1')");
    const env = {
      DB: d1 as unknown as D1Database,
      PHOTOS: { get: async () => ({ httpMetadata: { contentType: "image/jpeg" }, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }) } as unknown as R2Bucket,
      DROPBOX_APP_KEY: "k",
      DROPBOX_APP_SECRET: "s"
    } as Env;
    await putSetting(env.DB, "backup.dropbox_refresh", "refresh-token");

    const uploads = new Map<string, ArrayBuffer>();
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      if (url.endsWith("/oauth2/token")) return new Response(JSON.stringify({ access_token: "a" }));
      if (url.endsWith("/files/upload")) {
        const arg = JSON.parse((init.headers as Record<string, string>)["Dropbox-API-Arg"]!);
        uploads.set(arg.path, await new Response(init.body).arrayBuffer());
        return new Response("{}");
      }
      if (url.endsWith("/files/list_folder")) return new Response(JSON.stringify({ entries: [{ name: "recipe-box-2020-01-01.json.gz", path_lower: "/data/old" }] }));
      if (url.endsWith("/files/delete_batch")) return new Response("{}");
      throw new Error(`unexpected ${url}`);
    });

    const r = await runBackup(env);
    expect(r).toEqual({ data: true, photos: 1, photosLeft: 0 });
    expect([...uploads.keys()].sort()).toEqual([`/data/recipe-box-${new Date().toISOString().slice(0, 10)}.json.gz`, "/photos/p1.jpg"]);

    // A second run the same day sends nothing new.
    uploads.clear();
    expect(await runBackup(env)).toEqual({ data: false, photos: 0, photosLeft: 0 });

    // Rebuild a fresh database from the backup file.
    const r2 = await runBackup(env, { force: true });
    expect(r2.data).toBe(true);
    const gz = [...uploads.values()][0]!;
    const dump = JSON.parse(gunzipSync(Buffer.from(gz)).toString("utf8"));
    expect(dump.tables.purchases).toBeUndefined();
    expect(JSON.stringify(dump.tables.settings)).not.toContain("refresh-token");
    const dir = mkdtempSync(join(tmpdir(), "rb-"));
    writeFileSync(join(dir, "b.json.gz"), Buffer.from(gz));
    const sql = execFileSync("node", ["scripts/restore-backup.mjs", join(dir, "b.json.gz")], { encoding: "utf8" });
    const fresh = fakeD1().sqlite;
    fresh.exec(sql);
    expect(fresh.prepare("SELECT title FROM recipes").all()).toEqual([{ title: "Test soup" }]);
  });
});
