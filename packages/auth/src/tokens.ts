/**
 * Token issuance and verification.
 *
 * Tokens are deliberately short-lived and carry the minimum the authoriser needs: who, in which
 * tenant, in which roles, and (for kiosk sessions) which patient session they belong to. Nothing
 * clinical is embedded in a token, because tokens are readable by the client and a token must never
 * become a channel for PHI.
 */

import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { Role } from "./permissions";

export const STAFF_TOKEN_TTL_MINUTES = 12 * 60;
export const KIOSK_TOKEN_TTL_MINUTES = 45;

export interface StaffTokenClaims {
  readonly kind: "STAFF";
  readonly sub: string;
  readonly tenantId: string;
  readonly username: string;
  readonly displayName: string;
  readonly roles: readonly Role[];
}

export interface KioskTokenClaims {
  readonly kind: "KIOSK";
  readonly sub: string;
  readonly tenantId: string;
  readonly kioskId: string;
  readonly sessionId: string;
  readonly patientId?: string;
}

export type TokenClaims = StaffTokenClaims | KioskTokenClaims;

/** Reasons a token may be rejected, surfaced as distinct error codes by the caller. */
export type TokenRejection =
  "EXPIRED" | "MALFORMED" | "WRONG_AUDIENCE" | "UNVERIFIED";

function secretKey(secret: string): Uint8Array {
  // A weak secret is rejected at start-up by the configuration validator; this function only
  // converts, and does not decide whether the secret is safe.
  return new TextEncoder().encode(secret);
}

export async function signStaffToken(
  claims: Omit<StaffTokenClaims, "kind">,
  secret: string,
  options: { readonly ttlMinutes?: number; readonly now?: Date } = {},
): Promise<string> {
  const now = Math.floor((options.now?.getTime() ?? Date.now()) / 1000);
  const ttl = options.ttlMinutes ?? STAFF_TOKEN_TTL_MINUTES;
  return new SignJWT({ ...claims, kind: "STAFF" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setIssuer("medikiosk")
    .setAudience("medikiosk.staff")
    .setExpirationTime(now + ttl * 60)
    .sign(secretKey(secret));
}

export async function signKioskToken(
  claims: Omit<KioskTokenClaims, "kind">,
  secret: string,
  options: { readonly ttlMinutes?: number; readonly now?: Date } = {},
): Promise<string> {
  const now = Math.floor((options.now?.getTime() ?? Date.now()) / 1000);
  const ttl = options.ttlMinutes ?? KIOSK_TOKEN_TTL_MINUTES;
  return new SignJWT({ ...claims, kind: "KIOSK" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setIssuer("medikiosk")
    .setAudience("medikiosk.kiosk")
    .setExpirationTime(now + ttl * 60)
    .sign(secretKey(secret));
}

/**
 * Verify a token and narrow it to its kind.
 *
 * Audience separation is the important property: a kiosk session token must not be usable as a staff
 * token even if it were stolen, because the two grant very different access. Verifying the audience
 * here means the route layer cannot accidentally accept the wrong kind of token.
 */
export async function verifyToken<T extends TokenClaims>(
  token: string,
  secret: string,
  expectedKind: T["kind"],
  options: { readonly now?: Date } = {},
): Promise<
  | { readonly ok: true; readonly claims: T }
  | { readonly ok: false; readonly reason: TokenRejection }
> {
  try {
    const audience =
      expectedKind === "STAFF" ? "medikiosk.staff" : "medikiosk.kiosk";
    const { payload } = await jwtVerify(token, secretKey(secret), {
      issuer: "medikiosk",
      audience,
      currentDate: options.now,
    });

    if (payload.kind !== expectedKind)
      return { ok: false, reason: "WRONG_AUDIENCE" };
    return { ok: true, claims: payload as unknown as T };
  } catch (error) {
    return { ok: false, reason: classifyRejection(error) };
  }
}

function classifyRejection(error: unknown): TokenRejection {
  const message = error instanceof Error ? error.message : String(error);
  // Audience first: jose's audience failure text contains "unexpected", whose "exp"
  // substring otherwise reads as token expiry and mislabels a wrong-kind token.
  if (/audience|aud/i.test(message)) return "WRONG_AUDIENCE";
  if (/\bexp\b|expired/i.test(message)) return "EXPIRED";
  if (/signature|verify/i.test(message)) return "UNVERIFIED";
  return "MALFORMED";
}

/** Strip a bearer prefix. Returns undefined when the header is absent or malformed. */
export function bearerToken(
  authorization: string | undefined,
): string | undefined {
  if (!authorization) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match ? match[1] : undefined;
}

/** Extract claims shape without verifying. Never used for authorisation, only for diagnostics. */
export function inspectClaims(token: string): JWTPayload | undefined {
  try {
    const [, payload] = token.split(".");
    if (!payload) return undefined;
    return JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as JWTPayload;
  } catch {
    return undefined;
  }
}
