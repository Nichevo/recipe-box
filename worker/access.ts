import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { MiddlewareHandler } from "hono";
import type { Env } from "./env";

const jwksCache = new Map<string, JWTVerifyGetKey>();

function jwksFor(teamDomain: string): JWTVerifyGetKey {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
}

/**
 * Cloudflare Access sits in front of the whole app. This middleware is a
 * second lock: it verifies the signed Access token on every API call, so the
 * API stays closed even if a route is ever exposed without Access.
 */
export const requireAccess: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  if (c.env.ACCESS_REQUIRED !== "true") return next();

  // Tolerate common copy/paste slips: "https://", trailing slashes, spaces.
  // Hostnames are case-insensitive, but the token's issuer is lowercase.
  // A bare team name ("myteam") is expanded to the full Access domain.
  let team = c.env.ACCESS_TEAM_DOMAIN?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (team && !team.includes(".")) team = `${team}.cloudflareaccess.com`;
  const aud = c.env.ACCESS_AUD?.trim();
  if (!team || !aud) {
    return c.json({ error: "Access is required but not configured" }, 500);
  }
  const token = c.req.header("Cf-Access-Jwt-Assertion");
  if (!token) return c.json({ error: "Unauthorized", reason: "no Access token on the request" }, 401);

  try {
    await jwtVerify(token, jwksFor(team), { issuer: `https://${team}`, audience: aud });
  } catch (err) {
    // The reason names the failed check (e.g. the "aud" or "iss" claim) without
    // revealing any configured value, which makes setup mistakes easy to spot.
    const e = err as { code?: string; claim?: string; message?: string };
    let reason = e.claim ? `token ${e.claim} claim did not match` : (e.code ?? "token verification failed");
    if (e.claim === "iss") {
      // The issuer is the public sign-in domain (already visible in the
      // browser's address bar during sign-in), so it is safe to show.
      const iss = String(decodeJwt(token).iss ?? "").replace(/^https:\/\//, "");
      reason += `; set ACCESS_TEAM_DOMAIN to ${iss}`;
    }
    return c.json({ error: "Unauthorized", reason }, 401);
  }
  return next();
};
