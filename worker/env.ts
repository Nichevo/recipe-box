export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  ASSETS: Fetcher;
  /** "true" in production: require a valid Cloudflare Access token. */
  ACCESS_REQUIRED: string;
  /** Secret, e.g. "yourteam.cloudflareaccess.com". */
  ACCESS_TEAM_DOMAIN?: string;
  /** Secret: the Access application's AUD tag. */
  ACCESS_AUD?: string;
  AI_PROVIDER_DEFAULT: string;
  /** Secret: Claude API key. AI features stay off without it. */
  ANTHROPIC_API_KEY?: string;
  /** Secret: address of the Ollama server (e.g. through a Cloudflare Tunnel). */
  OLLAMA_URL?: string;
  /** Secrets: Cloudflare Access service token protecting the Ollama tunnel. */
  OLLAMA_ACCESS_CLIENT_ID?: string;
  OLLAMA_ACCESS_CLIENT_SECRET?: string;
  /** Secrets: the Dropbox app's key and secret, for the nightly backup. */
  DROPBOX_APP_KEY?: string;
  DROPBOX_APP_SECRET?: string;
  /** Secret: Google service account JSON key, for reading the grocery sheet. */
  GOOGLE_SERVICE_ACCOUNT?: string;
  /** Secret: the grocery spreadsheet's id. */
  GROCERY_SHEET_ID?: string;
  /** Optional: the tab holding purchases (default "Data"). */
  GROCERY_SHEET_TAB?: string;
}
