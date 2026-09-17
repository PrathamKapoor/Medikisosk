/**
 * Response states for interview questions.
 *
 * The single most important rule in this file: a question that was never answered is NOT a
 * negative answer. "No known allergies" and "patient did not answer" are different clinical
 * facts, and treating them as equivalent is a documented cause of medication error. See ADR-008.
 */

export const RESPONSE_STATES = [
  "UNANSWERED",
  "ANSWERED",
  "SKIPPED",
  "DECLINED",
  "UNKNOWN",
  "CONTRADICTORY",
  "LOW_CONFIDENCE",
  "NEEDS_CLARIFICATION",
  "VERIFIED",
  "NOT_APPLICABLE",
] as const;

export type ResponseState = (typeof RESPONSE_STATES)[number];

export const RESPONSE_STATE_LABELS: Record<ResponseState, string> = {
  UNANSWERED: "Not answered",
  ANSWERED: "Answered",
  SKIPPED: "Skipped",
  DECLINED: "Patient declined to answer",
  UNKNOWN: "Patient does not know",
  CONTRADICTORY: "Conflicts with earlier information",
  LOW_CONFIDENCE: "Understood with low confidence",
  NEEDS_CLARIFICATION: "Clarification needed",
  VERIFIED: "Verified with patient",
  NOT_APPLICABLE: "Not applicable",
};

/** States that carry a usable clinical answer. */
export const ANSWERED_STATES: readonly ResponseState[] = [
  "ANSWERED",
  "VERIFIED",
];

export function isAnswered(state: ResponseState): boolean {
  return ANSWERED_STATES.includes(state);
}

/**
 * States that must never be silently coerced to "no". Consumers such as the allergy engine and
 * the safety engine consult this list rather than re-deriving the rule.
 */
export const NOT_A_NEGATIVE_STATES: readonly ResponseState[] = [
  "UNANSWERED",
  "SKIPPED",
  "DECLINED",
  "UNKNOWN",
  "LOW_CONFIDENCE",
  "CONTRADICTORY",
  "NEEDS_CLARIFICATION",
];

/**
 * True when a state means "we still do not know", so the interview may try again (possibly via
 * a different modality) rather than treating the topic as closed.
 */
export function isOpen(state: ResponseState): boolean {
  return (
    state === "UNANSWERED" ||
    state === "LOW_CONFIDENCE" ||
    state === "NEEDS_CLARIFICATION" ||
    state === "CONTRADICTORY"
  );
}

/**
 * True when the topic is closed, so the interview engine must stop asking. `DECLINED` and
 * `UNKNOWN` are terminal: a patient has the right to refuse, and the system records the refusal
 * rather than nagging.
 */
export function isTerminal(state: ResponseState): boolean {
  return (
    state === "ANSWERED" ||
    state === "VERIFIED" ||
    state === "DECLINED" ||
    state === "UNKNOWN" ||
    state === "NOT_APPLICABLE"
  );
}

/** Why a response was captured, used for the evidence trail. */
export const RESPONSE_MODALITIES = [
  "VOICE",
  "TOUCH",
  "STAFF_ASSISTED",
  "IMPORTED",
] as const;
export type ResponseModality = (typeof RESPONSE_MODALITIES)[number];

export const MODALITY_LABELS: Record<ResponseModality, string> = {
  VOICE: "Spoken by patient",
  TOUCH: "Selected on screen",
  STAFF_ASSISTED: "Entered with staff assistance",
  IMPORTED: "Imported from record",
};
