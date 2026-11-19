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

## 5. Deploy

Merge to `main` (or run the Deploy workflow by hand). It builds the app, applies
database migrations and deploys to your domain. Then open the domain on each
device and use "Add to Home Screen" / "Install app".
