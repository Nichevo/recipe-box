import { importPKCS8, SignJWT } from "jose";
import type { Env } from "./env";

/**
 * Reads the grocery spreadsheet as a Google service account (a robot account
 * the sheet is shared with). The account's JSON key lives only in a Worker secret.
 */

let cached: { token: string; expires: number } | null = null;

export function sheetsConfigured(env: Env): boolean {
  return !!env.GOOGLE_SERVICE_ACCOUNT && !!env.GROCERY_SHEET_ID;
}

async function accessToken(env: Env): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  let sa: { client_email?: string; private_key?: string };
  try {
    sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT ?? "");
  } catch {
    throw new Error("The Google service account key isn't valid JSON");
  }
  if (!sa.client_email || !sa.private_key) throw new Error("The Google service account key is missing fields");
  const key = await importPKCS8(sa.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/spreadsheets.readonly" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !body.access_token) throw new Error(`Google sign-in failed: ${body.error_description ?? res.status}`);
  cached = { token: body.access_token, expires: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cached.token;
}

/** Read a range of cells, e.g. "Data!A2:Z1500". Numbers come back as numbers. */
export async function readRange(env: Env, range: string): Promise<unknown[][]> {
  const token = await accessToken(env);
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.GROCERY_SHEET_ID!)}/values/${encodeURIComponent(range)}`
  );
  url.searchParams.set("valueRenderOption", "UNFORMATTED_VALUE");
  url.searchParams.set("dateTimeRenderOption", "SERIAL_NUMBER");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 403 || res.status === 404) {
    throw new Error("Can't open the grocery sheet. Check it's shared with the service account and the sheet ID is right.");
  }
  if (!res.ok) throw new Error(`Google Sheets error (${res.status})`);
  const body = (await res.json()) as { values?: unknown[][] };
  return body.values ?? [];
}
