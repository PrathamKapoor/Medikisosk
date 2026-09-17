/**
 * Capability declaration.
 *
 * Re-exported here so the app factory has a single import for configuration concerns. The
 * implementation lives in `capabilities.ts` and is generated from the same `AppConfig` the providers
 * are constructed from, so the declaration cannot drift from what is actually running.
 */

export { capabilitiesFor } from "./capabilities";
export type { AppConfig } from "./env";
