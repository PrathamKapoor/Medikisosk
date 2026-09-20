/**
 * Public surface of @medikiosk/i18n.
 *
 * Zero runtime dependencies by design: the kiosk may run on a locked-down
 * device, and a translation layer that can fail to load is a translation layer
 * that can block a patient interview.
 */
export * from "./types";
export * from "./catalogue";
export * from "./translate";
export * from "./clinical-terms";
export * from "./verify";
export * from "./registration";
export * from "./interview";
export * from "./details";
