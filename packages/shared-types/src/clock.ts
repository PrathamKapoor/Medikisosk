/**
 * Injectable clock.
 *
 * Clinical logic touches dates constantly: relative-date normalisation ("kal se" -> yesterday),
 * session expiry, consent expiry, retention sweeps, and encounter ordering. If those read
 * `Date.now()` directly they cannot be tested deterministically, and an evaluation run cannot be
 * reproduced. Every date-sensitive code path therefore takes a `Clock`.
 */

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/** A clock frozen at one instant. Used by unit tests, integration tests and evaluation runs. */
export function fixedClock(at: Date): Clock {
  return { now: () => new Date(at.getTime()) };
}

/** A clock that advances by a fixed step on every read, for TTL and expiry tests. */
export function steppingClock(start: Date, stepMs: number): Clock {
  let current = start.getTime();
  return {
    now: () => {
      const value = new Date(current);
      current += stepMs;
      return value;
    },
  };
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

export function addHours(instant: Date, hours: number): Date {
  return new Date(instant.getTime() + hours * 3_600_000);
}

export function addDays(instant: Date, days: number): Date {
  return new Date(instant.getTime() + days * 86_400_000);
}

export function isExpired(instant: Date, now: Date): boolean {
  return instant.getTime() <= now.getTime();
}

/** UTC ISO string, the canonical wire and storage representation of an instant. */
export function toIso(instant: Date): string {
  return instant.toISOString();
}

/** `YYYY-MM-DD` in UTC, for dates where time-of-day is clinically meaningless. */
export function toIsoDate(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

export function parseIso(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new RangeError(`Not a valid ISO-8601 instant: ${value}`);
  }
  return parsed;
}

/** Whole days between two instants, ignoring time of day. Negative when `to` precedes `from`. */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((b - a) / 86_400_000);
}