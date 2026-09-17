/**
 * Provenance primitives.
 *
 * Where a clinical fact came from decides how much a clinician may trust it, how it must be
 * displayed, and whether it may be auto-accepted. See ADR-005.
 */

/**
 * The origin class of a clinical fact.
 *
 * These four classes must never be mixed or silently converted. A physician must be able to see
 * whether a fact was said by the patient, read off a document, typed by a colleague, or inferred
 * by a model.
 */
export const ORIGIN_CLASSES = [
  "PATIENT_REPORTED",
  "DOCUMENT_DERIVED",
  "CLINICIAN_ENTERED",
  "AI_INFERRED",
] as const;

export type OriginClass = (typeof ORIGIN_CLASSES)[number];

export const ORIGIN_CLASS_LABELS: Record<OriginClass, string> = {
  PATIENT_REPORTED: "Patient reported",
  DOCUMENT_DERIVED: "From document",
  CLINICIAN_ENTERED: "Clinician entered",
  AI_INFERRED: "AI suggested",
};

/**
 * Origins that represent a deliberate human statement of truth and may therefore be treated as
 * authoritative without further review. Note that `AI_INFERRED` is deliberately excluded, and so
 * is `DOCUMENT_DERIVED` when its extraction confidence is low.
 */
export const TRUSTED_ORIGINS: readonly OriginClass[] = [
  "PATIENT_REPORTED",
  "CLINICIAN_ENTERED",
];

/** Provenance of an extracted or generated value, carried alongside the value itself. */
export interface Provenance {
  readonly originClass: OriginClass;
  /** Identifier of the record or artifact the value came from, if any. */
  readonly sourceRef?: string;
  /** Provider / model / rule-set identity that produced the value, when machine-generated. */
  readonly generatedBy?: string;
}

// ---------------------------------------------------------------------------
// Human review state
// ---------------------------------------------------------------------------

export const VERIFICATION_STATES = [
  "UNVERIFIED",
  "VERIFIED",
  "REJECTED",
  "CORRECTED",
] as const;

export type VerificationState = (typeof VERIFICATION_STATES)[number];

export const VERIFICATION_STATE_LABELS: Record<VerificationState, string> = {
  UNVERIFIED: "Not yet reviewed",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  CORRECTED: "Corrected by clinician",
};

// ---------------------------------------------------------------------------
// Confidence and certainty
// ---------------------------------------------------------------------------

/**
 * Normalised confidence in the range [0, 1]. This is confidence in our extraction, not a probability of
 * disease. Presenting it as a probability would be a clinical misrepresentation.
 *
 * Branded locally rather than imported from `ids.ts` so that this module stays dependency-free: provenance
 * primitives are used by every other package and must not pull identifier branding along with them.
 */
declare const confidenceBrand: unique symbol;

export type Confidence = number & { readonly [confidenceBrand]: "Confidence" };

export function confidence(value: number): Confidence {
  if (!Number.isFinite(value)) {
    throw new RangeError(
      `confidence must be a finite number, received ${String(value)}`,
    );
  }
  return Math.min(1, Math.max(0, value)) as Confidence;
}

/** At or above this value an interpretation is treated as reliable. */
export const CONFIDENCE_RELIABLE = 0.7;
/** Below this value the patient must be asked to confirm, or touch fallback offered. */
export const CONFIDENCE_REVIEW_REQUIRED = 0.5;

export type ConfidenceBand = "high" | "moderate" | "low";

export function describeConfidence(c: Confidence): ConfidenceBand {
  if (c >= CONFIDENCE_RELIABLE) return "high";
  if (c >= CONFIDENCE_REVIEW_REQUIRED) return "moderate";
  return "low";
}

/** Requires mandatory clinician verification before the value may influence the record. */
export function requiresClinicianReview(c: Confidence): boolean {
  return c < CONFIDENCE_REVIEW_REQUIRED;
}

/**
 * Clinical certainty. Deliberately separate from `Confidence`: confidence describes the quality of
 * extraction, certainty describes the patient's own epistemic state ("I think", "definitely",
 * "it is not"). Conflating the two discards information a clinician needs.
 */
export const CERTAINTIES = [
  "SUSPECTED",
  "PROBABLE",
  "CONFIRMED",
  "NEGATED",
  "UNKNOWN",
] as const;

export type Certainty = (typeof CERTAINTIES)[number];

export const CERTAINTY_LABELS: Record<Certainty, string> = {
  SUSPECTED: "Suspected",
  PROBABLE: "Probable",
  CONFIRMED: "Confirmed",
  NEGATED: "Denied",
  UNKNOWN: "Unknown",
};

/** Evidence may be attached to support a negation; a negation is itself a clinical fact. */
export function isNegation(certainty: Certainty): boolean {
  return certainty === "NEGATED";
}
