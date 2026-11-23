#!/usr/bin/env node
/**
 * Turn a Dropbox backup file (data/recipe-box-YYYY-MM-DD.json.gz) into SQL that
 * replaces the database contents:
 *
 *   node scripts/restore-backup.mjs recipe-box-2026-11-23.json.gz > restore.sql
 *   npx wrangler d1 execute DB --remote --file restore.sql -c wrangler.deploy.json
 *
 * Photos are restored separately by uploading the backup's photos/ folder to
 * R2 under photos/<id> (without the file extension).
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/restore-backup.mjs <backup.json.gz>");
  process.exit(1);
}
const raw = readFileSync(file);
const dump = JSON.parse((file.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8"));
if (dump.app !== "recipe-box") throw new Error("Not a recipe-box backup");

const lit = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const q = (n) => `"${n.replace(/"/g, '""')}"`;

// Parents before children, so foreign keys line up.
const ORDER = ["recipes", "items", "tags", "photos", "recipe_ingredients", "steps", "recipe_tags", "item_aliases"];
const names = Object.keys(dump.tables).sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));

const out = ["PRAGMA defer_foreign_keys = ON;"];
for (const n of [...names].reverse()) out.push(`DELETE FROM ${q(n)};`);
for (const n of names) {
  for (const row of dump.tables[n]) {
    const cols = Object.keys(row);
    out.push(`INSERT INTO ${q(n)} (${cols.map(q).join(", ")}) VALUES (${cols.map((c) => lit(row[c])).join(", ")});`);
  }
}
process.stdout.write(out.join("\n") + "\n");
