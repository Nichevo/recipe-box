#!/usr/bin/env node
// Fails if tracked (or staged) files contain personal information.
// This repository is public: it must hold code only.
//
// Checks:
//  1. Email addresses, except no-reply and example addresses.
//  2. Links to private documents (Notion pages, Google Sheets, Dropbox shares).
//  3. Common API key formats (gitleaks runs in CI as well).
//  4. Your own denylist of words (name, domain, etc.), read from the
//     PRIVACY_DENYLIST environment variable (comma separated, used as a GitHub
//     secret in CI) and/or a local, git-ignored .privacy-denylist file
//     (one entry per line). The words themselves are never printed.
//
// Usage: node scripts/privacy-check.mjs [--staged]
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const staged = process.argv.includes("--staged");
const files = execSync(
  staged ? "git diff --cached --name-only --diff-filter=ACMR" : "git ls-files",
  { encoding: "utf8" }
)
  .split("\n")
  .filter(Boolean)
  .filter((f) => !/\.(png|jpe?g|gif|webp|ico|woff2?)$/i.test(f))
  .filter((f) => f !== "package-lock.json");

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const ALLOWED_EMAIL = /(noreply|no-reply)@|@users\.noreply\.github\.com$|@example\.(com|org|net)$/i;

const PATTERNS = [
  { name: "Notion page link", re: /notion\.(so|site|com)\/[^\s)"']*[0-9a-f]{32}/i },
  { name: "Google Sheets/Docs link", re: /docs\.google\.com\/(spreadsheets|document)\/d\/[A-Za-z0-9_-]{20,}/ },
  { name: "Dropbox share link", re: /dropbox\.com\/(s|scl|sh)\/[A-Za-z0-9]/ },
  { name: "Anthropic API key", re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "Google API key", re: /AIza[0-9A-Za-z_-]{35}/ },
  { name: "Private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "Notion token", re: /\b(secret_|ntn_)[A-Za-z0-9]{30,}/ }
];

const denylist = [
  ...(process.env.PRIVACY_DENYLIST ?? "").split(","),
  ...(existsSync(".privacy-denylist") ? readFileSync(".privacy-denylist", "utf8").split("\n") : [])
]
  .map((s) => s.trim().toLowerCase())
  .filter((s) => s.length >= 3 && !s.startsWith("#"));

const problems = [];
for (const file of files) {
  if (!existsSync(file)) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    const where = `${file}:${i + 1}`;
    for (const m of line.matchAll(EMAIL)) {
      if (!ALLOWED_EMAIL.test(m[0])) problems.push(`${where}  email address`);
    }
    for (const p of PATTERNS) if (p.re.test(line)) problems.push(`${where}  ${p.name}`);
    const lower = line.toLowerCase();
    if (denylist.some((w) => lower.includes(w))) problems.push(`${where}  denylisted word`);
  });
}

if (problems.length) {
  console.error("Privacy check failed. Remove personal information before committing:\n");
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log(`Privacy check passed (${files.length} files, ${denylist.length} denylist entries).`);
