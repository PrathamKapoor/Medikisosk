/**
 * A small explicit Result type.
 *
 * Why not exceptions everywhere? Because "did this clinical operation actually succeed?" must be
 * impossible to ignore. Where a caller could plausibly continue, an API returns a `Result`; where
 * continuing would be unsafe, it throws a typed `MediKioskError` (see `errors.ts`) which the HTTP layer
 * converts into a structured response. Both paths carry a machine-readable code.
 */

import type { MediKioskError } from './errors';

export type Result<T, E = MediKioskError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}

export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw result.error instanceof Error ? result.error : new Error(String(result.error));
}

/** Map a successful value, passing failures through unchanged. */
export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}