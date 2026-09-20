/**
 * Kiosk inactivity policy — one place for the session-isolation timeouts.
 *
 * Defaults: warn after two idle minutes, reset after three. A `?idle=N` query parameter
 * shortens both (N seconds to the warning, N+10 to the reset) so the privacy reset is
 * demonstrable without waiting minutes; values below five seconds are ignored.
 */

export interface IdlePolicy {
  readonly warningMs: number;
  readonly resetMs: number;
}

const DEFAULT_WARNING_MS = 120000;
const DEFAULT_RESET_MS = 180000;

export function idlePolicy(): IdlePolicy {
  try {
    const raw = new URLSearchParams(window.location.search).get("idle");
    const seconds = raw === null ? Number.NaN : Number(raw);
    if (
      Number.isFinite(seconds) &&
      seconds >= 5 &&
      seconds <= DEFAULT_WARNING_MS / 1000
    ) {
      return {
        warningMs: Math.round(seconds * 1000),
        resetMs: Math.round((seconds + 10) * 1000),
      };
    }
  } catch {
    // A malformed query string must never break the kiosk shell.
  }
  return { warningMs: DEFAULT_WARNING_MS, resetMs: DEFAULT_RESET_MS };
}
