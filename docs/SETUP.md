# One-time setup

Everything here is done in the Cloudflare and GitHub dashboards, so none of these
values ever appear in the repository. Placeholders like `recipes.example.com`
stand for your own values.

## 1. Cloudflare resources

From a terminal in the repo (after `npx wrangler login`), or in the dashboard:

```sh
npx wrangler d1 create recipe-box        # note the database_id it prints
npx wrangler r2 bucket create recipe-box-photos
```

## 2. Cloudflare API token for GitHub Actions

Dashboard → My Profile → API Tokens → Create Token → "Edit Cloudflare Workers"
template. Add **Account → D1 → Edit**. Limit it to your account and to the zone
your domain is on. Copy the token.

## 3. GitHub repository settings

Settings → Secrets and variables → Actions:

| Name | Type | Value |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Secret | token from step 2 |
| `CLOUDFLARE_ACCOUNT_ID` | Secret | Cloudflare dashboard → account home, right sidebar |
| `D1_DATABASE_ID` | Secret | from step 1 |
| `APP_DOMAIN` | Secret | e.g. `recipes.example.com` |
| `PRIVACY_DENYLIST` | Secret | words that must never be committed, comma separated (your name, domain, email user name...) |
| `DEPLOY_ENABLED` | Variable | `true` once the secrets above are in place |

Also turn on Settings → Code security → **Secret scanning** and **Push protection**,
and in your GitHub email settings tick **Keep my email addresses private**.

## 4. Cloudflare Access (the sign-in)

Zero Trust → Access → Applications → Add → Self-hosted:

- Application domain: your `APP_DOMAIN`
- Session duration: 1 month
- Policy: Allow → Include → Emails → the family email addresses
- Login method: One-time PIN (and Google, if you like)

Copy the application's **AUD tag** and add two more GitHub Actions secrets. The
deploy workflow copies them into the Worker on every deploy:

- `ACCESS_TEAM_DOMAIN`, e.g. `yourteam.cloudflareaccess.com`
- `ACCESS_AUD`, the AUD tag

The API refuses every request without a valid Access token once deployed.

## 5. AI (optional)

The app works without AI; the scan and draft screens just say it isn't set up.

**Claude (recommended).** At console.anthropic.com, create an API key (Settings →
API keys) and add a little credit under Billing. Add it as the GitHub Actions
secret `ANTHROPIC_API_KEY`, then run the Deploy workflow again. A scanned page or
drafted recipe costs a few cents. You can switch Claude off any time in the
app's Settings.

**Ollama on a home PC (optional).** Install Ollama and pull a model that can read
images (for example a "vl" vision model). Expose it with a Cloudflare Tunnel on its
own hostname, protect that hostname with a Cloudflare Access application whose
policy is **Service Auth**, and create a service token for it. Then add these
GitHub Actions secrets and run Deploy again:

- `OLLAMA_URL`, the tunnel address, e.g. `https://ollama.example.com`
- `OLLAMA_ACCESS_CLIENT_ID` and `OLLAMA_ACCESS_CLIENT_SECRET`, the service token

In the app, open Add → Settings, switch on "Use the home PC", and type the model
name. With "Use Claude when the PC is off" on, requests go to Claude whenever the
PC doesn't answer.

**Recipe search (Add → Find a recipe online).** With Claude, this uses Claude's web
search, which must be allowed for your organisation in the Claude Console
(Settings → Privacy). To search with the home PC instead, add a Brave Search API
key as the GitHub Actions secret `BRAVE_API_KEY` and run Deploy: Brave finds pages
and the PC's model picks the best. With the key but no AI, the app lists Brave's
results as they are.

## 6. Grocery sheet (optional)

The pantry check and recipe costs read a Google Sheet of grocery purchases. The
sheet needs a header row with at least `Date` and `Item`; `Shop`, `Category`,
`Size`, `SizeType` (g, kg, ml, l, pk), `Qty`, `Price`, `Total`, `kg` and `Brand`
are used when present. Other columns are never read. Rows in the categories Dog,
House and Medical are skipped.

1. At console.cloud.google.com, create a project and enable the **Google Sheets API**.
2. IAM & Admin → Service accounts → create one (no roles needed) → Keys → Add key → JSON.
3. Share the sheet with the service account's email address as **Viewer**.
4. Add GitHub Actions secrets: `GOOGLE_SERVICE_ACCOUNT` (the whole JSON file) and
   `GROCERY_SHEET_ID` (the id in the sheet's address, between `/d/` and `/edit`).
   Then delete the downloaded key file and run Deploy.
5. In the app, Settings → "Sync the whole sheet now" once. After that, new rows
   are picked up every night. If the purchases tab isn't called `Data`, set a
   `GROCERY_SHEET_TAB` variable in `wrangler.jsonc` vars.

## 7. Deploy

Merge to `main` (or run the Deploy workflow by hand). It builds the app, applies
database migrations and deploys to your domain. Then open the domain on each
device and use "Add to Home Screen" / "Install app".

## 8. Dropbox backup (optional)

Each night the app saves every table (recipes, ingredients, notes, pantry, plan,
cook log, settings; not the grocery rows, which come back from the sheet) as
`data/recipe-box-YYYY-MM-DD.json.gz`, keeps 30 days of those, and copies each
photo once to `photos/`.

1. At dropbox.com/developers/apps, create an app: **Scoped access**, **App
   folder**. Name it anything.
2. On its Permissions tab tick `files.metadata.read`, `files.content.write` and
   `files.content.read`, then Submit.
3. On its Settings tab, under OAuth 2 Redirect URIs, add
   `https://<your app address>/api/backup/dropbox/callback` (Settings → Backup in
   the app shows the exact address).
4. Add the app key and app secret as GitHub Actions secrets `DROPBOX_APP_KEY` and
   `DROPBOX_APP_SECRET`, then run Deploy.
5. In the app, open Settings → Backup → Connect Dropbox and allow access. Tap
   "Back up now" for the first full copy, or let the nightly run catch up (25
   photos a night).

**Restoring.** Download a `data/…json.gz` file, then:

```
node scripts/restore-backup.mjs recipe-box-YYYY-MM-DD.json.gz > restore.sql
npx wrangler d1 execute DB --remote --file restore.sql -c wrangler.deploy.json
```

This replaces the database contents. Upload the `photos/` files to the R2 bucket
as `photos/<id>` (without the extension) to bring back the pictures.
