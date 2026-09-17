/**
 * Cross-cutting primitives shared by every MediKiosk layer.
 *
 * Nothing in this package may depend on a database, an HTTP framework, a browser API, or an AI
 * provider. It is pure types plus tiny deterministic helpers, so the API runtime and the browser
 * applications can both depend on it safely.
 */

export * from "./ids";
export * from "./provenance";
export * from "./response-state";
export * from "./triage";
export * from "./result";
export * from "./errors";
export * from "./clock";
