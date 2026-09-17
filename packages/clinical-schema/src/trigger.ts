/**
 * A small, declarative trigger expression language.
 *
 * Pathways must be *data*, so that a hospital can adjust them without a code release, and so that
 * "why was this question asked?" has a mechanical answer. A trigger is therefore a serialisable
 * data structure with one deterministic evaluator, not a JavaScript closure.
 *
 * Deliberately not implemented: arbitrary code, configuration-supplied regular expressions, or
 * anything that could evaluate user-supplied text as logic. Untrusted patient or document input
 * must never be able to change which clinical question is asked.
 */

export type TriggerExpression =
  /** Always true. Used for entry-level and general-history pathways. */
  | { readonly always: true }
  | { readonly not: TriggerExpression }
  /** Conjunction. An empty list is true. */
  | { readonly all: readonly TriggerExpression[] }
  /** Disjunction. An empty list is false. */
  | { readonly any: readonly TriggerExpression[] }
  /** The encounter has a recognised complaint with this concept code. */
  | { readonly hasSymptom: string }
  /** The encounter has at least one of these complaint concept codes. */
  | { readonly hasSymptomAny: readonly string[] }
  /** A previously asked question was answered positively. */
  | { readonly answeredYes: string }
  /** A previously asked question was answered negatively. */
  | { readonly answeredNo: string }
  /** A previously asked question has some terminal answer (including declined and unknown). */
  | { readonly answeredAny: string }
  /** A previously asked question is still unresolved. */
  | { readonly unanswered: string }
  /** Age in whole years at least this value. An unknown age makes this false. */
  | { readonly ageAtLeast: number }
  /** Age in whole years at most this value. An unknown age makes this false. */
  | { readonly ageAtMost: number }
  | { readonly sex: "MALE" | "FEMALE" | "OTHER" }
  | { readonly pregnant: true }
  /** A recorded past or current condition with this concept code. */
  | { readonly hasCondition: string }
  /** At least one recorded medication whose concept code matches. */
  | { readonly hasMedication: string }
  | { readonly hasAllergyCategory: "DRUG" | "FOOD" | "ENVIRONMENTAL" | "OTHER" }
  /** The named symptom has been present for fewer than this many days. */
  | {
      readonly symptomDurationLessThanDays: {
        readonly code: string;
        readonly days: number;
      };
    }
  /** The named symptom has been present for at least this many days. */
  | {
      readonly symptomDurationAtLeastDays: {
        readonly code: string;
        readonly days: number;
      };
    }
  /** A recorded vital exceeds a threshold, in the vital's canonical unit. */
  | { readonly vitalAbove: { readonly code: string; readonly value: number } }
  /** A recorded vital is below a threshold, in the vital's canonical unit. */
  | { readonly vitalBelow: { readonly code: string; readonly value: number } }
  /** A recorded laboratory result is flagged high or critically high. */
  | { readonly labFlaggedHigh: string }
  /** A recorded laboratory result is flagged low or critically low. */
  | { readonly labFlaggedLow: string }
  /** The encounter has at least this many uploaded documents. */
  | { readonly documentCountAtLeast: number };

/**
 * The read-only clinical context a trigger is evaluated against.
 *
 * Kept narrow and explicit: the evaluator can consult only facts the domain has already
 * established with evidence. It has no access to the database, the network, or model output, so a
 * trigger can never cause a side effect or depend on something unreviewable.
 */
export interface TriggerContext {
  /** Concept codes of the encounter's complaints, e.g. `MK-SYM-001`. */
  readonly symptomCodes: readonly string[];
  /** Symptom code to onset duration in days, where established. */
  readonly symptomDurationDays: Readonly<Record<string, number>>;
  readonly answeredYes: Readonly<Record<string, boolean>>;
  readonly answeredNo: Readonly<Record<string, boolean>>;
  readonly answeredAny: Readonly<Record<string, boolean>>;
  readonly unanswered: Readonly<Record<string, boolean>>;
  readonly ageYears?: number;
  readonly sex?: "MALE" | "FEMALE" | "OTHER";
  readonly pregnant?: boolean;
  readonly conditionCodes: readonly string[];
  readonly medicationCodes: readonly string[];
  readonly allergyCategories: readonly (
    "DRUG" | "FOOD" | "ENVIRONMENTAL" | "OTHER"
  )[];
  /** Vital code to value in the canonical unit. */
  readonly vitals: Readonly<Record<string, number>>;
  readonly labFlaggedHigh: readonly string[];
  readonly labFlaggedLow: readonly string[];
  readonly documentCount: number;
}

/** An empty context. Useful for tests and for the very first question of a session. */
export const EMPTY_TRIGGER_CONTEXT: TriggerContext = {
  symptomCodes: [],
  symptomDurationDays: {},
  answeredYes: {},
  answeredNo: {},
  answeredAny: {},
  unanswered: {},
  conditionCodes: [],
  medicationCodes: [],
  allergyCategories: [],
  vitals: {},
  labFlaggedHigh: [],
  labFlaggedLow: [],
  documentCount: 0,
};
