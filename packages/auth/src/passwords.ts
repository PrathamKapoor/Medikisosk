/**
 * Password hashing and secret comparison.
 *
 * bcrypt with a per-user salt and a configurable cost. A pepper is folded in before hashing so that a
 * database theft alone is insufficient without the application secret; the pepper is configured at
 * deployment and never stored beside the hashes.
 *
 * Verification deliberately uses bcrypt's own comparison rather than a hand-rolled one, because
 * hand-rolled comparisons are exactly where timing attacks come from.
 */

import bcrypt from 'bcryptjs';
import { randomBytes, randomFillSync, timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto';

/** bcrypt cost. 12 balances security against the infrequent-login workload of an OPD. */
export const BCRYPT_COST = 12;

export interface HashResult {
  readonly hash: string;
  readonly cost: number;
}

export async function hashPassword(plain: string, pepper: string): Promise<HashResult> {
  if (plain.length < 8) {
    throw new RangeError('Password must be at least 8 characters.');
  }
  const salt = await bcrypt.genSalt(BCRYPT_COST);
  const hash = await bcrypt.hash(fold(plain, pepper), salt);
  return { hash, cost: BCRYPT_COST };
}

/**
 * Verify a password.
 *
 * Returns `false` for any malformed input rather than throwing, because a login attempt must never
 * produce a 500, and a malformed hash in the database is a data problem that must not surface as an
 * internal error to a client.
 */
export async function verifyPassword(
  plain: string,
  pepper: string,
  storedHash: string,
): Promise<boolean> {
  if (!plain || !storedHash) return false;
  try {
    return await bcrypt.compare(fold(plain, pepper), storedHash);
  } catch {
    return false;
  }
}

function fold(plain: string, pepper: string): string {
  return `${pepper}:${plain}`;
}

/**
 * Generate a cryptographically random secret.
 *
 * Used by the deployment tooling so operators are not tempted to type a memorable secret. The
 * base64url form is shell-safe and needs no quoting.
 */
export function generateSecret(bytes = 48): string {
  return randomBytes(bytes).toString('base64url');
}

/** Mask a sensitive identifier for logs and audit rows, e.g. an ABHA number. */
export function maskIdentifier(value: string, visible = 4): string {
  if (value.length <= visible) return '*'.repeat(value.length);
  const head = value.slice(0, value.length - visible);
  return `${'*'.repeat(Math.min(8, head.length))}${value.slice(-visible)}`;
}

/** Mask a display name for a kiosk, so a waiting room does not read out a full name. */
export function maskDisplayName(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0] ?? '*'}${'*'.repeat(Math.max(0, part.length - 1))}`)
    .join(' ');
}

/**
 * Constant-time comparison for non-password secrets such as kiosk device tokens.
 *
 * Used instead of `===` because a token comparison that returns early on the first differing byte
 * discloses, through timing, how much of the token was correct. On a shared hospital network that is
 * a real, if modest, information leak.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) {
    // Burn comparable time so the length itself is not disclosed through timing either, then reject.
    randomFillSync(Buffer.alloc(Math.max(left.length, right.length, 16)));
    return false;
  }
  return nodeTimingSafeEqual(left, right);
}

/** Kiosk device credential generation. */
export function generateDeviceToken(): string {
  return randomBytes(32).toString('base64url');
}