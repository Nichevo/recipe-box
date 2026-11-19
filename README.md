# Recipe Box

A self-hosted family recipe manager that runs on phones, tablets and laptops as an
installable web app (PWA).

- Browse and search recipes, filter by diet tags (Keto, Vegetarian, Low FODMAP...)
- Photos for each recipe and step, readable offline in the kitchen
- Metric, imperial or as-written quantities
- Planned: import from websites and book photos (Claude API or a local Ollama
  model), pantry check and recipe costing from a grocery purchase log, Notion
  import, nightly backup to Dropbox

## Architecture

| Part | Technology |
| --- | --- |
| App | React + Vite, installable PWA (`src/`) |
| API | Cloudflare Worker with Hono (`worker/`) |
| Data | Cloudflare D1 (SQLite), schema in `migrations/` |
| Photos | Cloudflare R2 |
| Sign-in | Cloudflare Access in front of the app, verified again in the API |

The app and API deploy together as one Worker with static assets.

## Privacy

This repository is public and holds **code only**. No names, email addresses,
domains, document links, recipe or grocery data, or keys are ever committed.

- Secrets live in Cloudflare and GitHub Actions secrets. See `.env.example`.
- Account-specific config (database id, domain) is filled in at deploy time by
  `scripts/render-wrangler-config.mjs`.
- `scripts/privacy-check.mjs` runs as a pre-commit hook and in CI. Add your own
  words to block in a git-ignored `.privacy-denylist` file (one per line) and in
  the `PRIVACY_DENYLIST` repository secret (comma separated).
- gitleaks scans every pull request.

## Development

```sh
npm install                 # also installs the pre-commit hook
npm run db:migrate:local    # create the local D1 database
npm run dev:worker          # app + API on http://localhost:8787
npm run dev                 # optional: Vite dev server with hot reload (proxies /api)
npm test
```

## Deploying

See [docs/SETUP.md](docs/SETUP.md) for the one-time Cloudflare and GitHub setup.
After that, every merge to `main` deploys automatically.
