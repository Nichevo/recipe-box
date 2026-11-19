import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
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

  const team = c.env.ACCESS_TEAM_DOMAIN;
  const aud = c.env.ACCESS_AUD;
  if (!team || !aud) {
    return c.json({ error: "Access is required but not configured" }, 500);
  }
  const token = c.req.header("Cf-Access-Jwt-Assertion");
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  try {
    await jwtVerify(token, jwksFor(team), { issuer: `https://${team}`, audience: aud });
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
};
