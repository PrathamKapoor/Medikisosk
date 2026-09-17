/**
 * @medikiosk/clinical-schema
 *
 * The canonical clinical domain model. This package is the shared vocabulary and the shared
 * validation rules for every layer: the kiosk, the API and the physician console all describe a
 * symptom, a vital or an allergy in exactly the terms defined here.
 *
 * Design rules that hold throughout this package:
 *  - No inline English strings for anything a patient or clinician reads. Every user-visible
 *    string is a key resolved by `@medikiosk/i18n`, so every question and every safety message can
 *    be translated and reviewed.
 *  - No clinical threshold that sets a triage level. Triage is produced only by the deterministic
 *    rule engine in `@medikiosk/safety-rules`.
 *  - No destructive normalisation. A patient's own words are preserved beside every interpretation.
 */

export * from "./primitives";
export * from "./answer";
export * from "./socrates";
export * from "./trigger";
export * from "./trigger-eval";
export * from "./trigger-describe";
export * from "./pathway";
export * from "./pathway-model";
export * from "./concept";
export * from "./concept-index";
export * from "./concept-match";
export * from "./normalisation-lexicon";
export * from "./normalisation-lexicon-words";
export * from "./normalisation-quantity";
export * from "./normalisation-parse";
export * from "./normalisation";
export * from "./ontology";
export * from "./vital-models";
export * from "./lab-analysis";
export * from "./therapy-models";
export * from "./pathways";
