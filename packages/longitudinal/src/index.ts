/**
 * @medikiosk/longitudinal
 *
 * Deterministic longitudinal clinical view: timeline assembly and what-changed diffing between
 * encounters. Pure, DB-free, LLM-free — timestamps are injected, never read from the clock.
 */

export * from "./timeline";
export * from "./what-changed";
