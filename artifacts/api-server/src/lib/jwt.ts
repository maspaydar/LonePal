import jwt, { type SignOptions } from "jsonwebtoken";

/**
 * Centralized JWT helpers shared by all JWT-based auth middleware
 * (company, super-admin, mobile). Each middleware keeps its own
 * role-specific authorization logic and delegates only the core secret
 * lookup + sign/verify + bearer extraction to these functions, so JWT
 * handling is implemented once instead of in every middleware.
 */

/** Read the shared session signing secret, throwing if it is not configured. */
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET not configured");
  return secret;
}

/** Extract a bearer token from an Authorization header, or null if absent/malformed. */
export function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

/** Sign a payload with the shared session secret. */
export function signJwt(payload: object, expiresIn: string | number = "8h"): string {
  return jwt.sign(payload, getSessionSecret(), {
    expiresIn: expiresIn as SignOptions["expiresIn"],
  });
}

/**
 * Verify a token's signature and expiry against the shared session secret.
 * Returns the decoded payload, or null if the token is missing/invalid/expired.
 */
export function verifyJwt<T = jwt.JwtPayload>(token: string): T | null {
  try {
    return jwt.verify(token, getSessionSecret()) as T;
  } catch {
    return null;
  }
}
