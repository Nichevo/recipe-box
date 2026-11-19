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
}
