/**
 * @medikiosk/interview-engine
 *
 * The deterministic clinical interview runtime. This package is the domain heart of MediKiosk:
 * it selects the next question, evaluates a patient response, decides when the interview is
 * complete, and specifies the clinical evidence each fact implies.
 *
 * Non-negotiable properties (see docs/PHASE-3-PLAN.md §2):
 *  - Pure and deterministic: identical input + identical pathway version => identical output.
 *    The package never reads the wall clock (`Date.now` is banned); time is an injected input.
 *  - No DB, no network, no LLM, no I/O of any kind.
 *  - `DECLINED` / `UNKNOWN` / `SKIPPED` are distinct and never coerced to "no".
 *  - Every clinical fact carries the evidence specification it requires (ADR-005).
 */

import type {
  SeverityScale,
  SocratesDimension,
  QuestionKind,
  QuestionCategory,
} from "@medikiosk/clinical-schema";
import type { ResponseState as SharedResponseState } from "@medikiosk/shared-types";

/** Version of this runtime. Recorded on every interview so outcomes are reproducible. */
export const INTERVIEW_RUNTIME_VERSION = "1.0.0";

/**
 * The state of an interview question. Identical in meaning to shared-types `ResponseState`;
 * re-exported here (via the type alias) so engine consumers never need to import shared-types.
 */
export type InterviewQuestionState = SharedResponseState;

/** The clinical severity scale, re-exported from clinical-schema primitives. */
export type Severity = SeverityScale;

/** An immutable, append-only row recording one (or one revision of an) answer. */
export interface ResponseRecord {
  readonly questionKey: string;
  readonly pathwayKey: string;
  readonly kind: QuestionKind;
  readonly category: QuestionCategory;
  readonly state: InterviewQuestionState;
  readonly rawAnswer: string | null;
  /** NormalisedAnswer serialised, or null when no interpretation was performed (SKIPPED). */
  readonly normalisedJson: unknown | null;
  readonly confidence: number | null;
  readonly askCount: number;
  /** ISO-8601 instant, injected by the caller (the engine never reads the clock). */
  readonly answeredAt: string;
}

/** The kind of clinical fact a matched concept represents. */
export type FactKind =
  "SYMPTOM" | "CONDITION" | "MEDICATION" | "ALLERGY" | "HISTORY";

/** Mirror of clinical-schema `socratesSlotSchema`, keeping the engine dependency-light. */
export interface SocratesSlotFact {
  readonly dimension: SocratesDimension;
  readonly state: InterviewQuestionState;
  readonly answerJson: unknown | null;
  readonly evidenceIds: readonly string[];
  readonly askCount: number;
}

/** A symptom fact with optional characterisation, keyed by clinical concept code. */
export interface SymptomFact {
  readonly conceptCode: string;
  readonly severity: Severity | null;
  /** ISO date of onset, when established. */
  readonly onsetDate: string | null;
  readonly durationDays: number | null;
  readonly socrates: Readonly<
    Partial<Record<SocratesDimension, SocratesSlotFact>>
  >;
}

/** Fixed demographic information about the patient. */
export interface PatientContext {
  readonly ageYears?: number;
  readonly sex?: "MALE" | "FEMALE" | "OTHER";
  readonly pregnant?: boolean;
}

/** The full, immutable clinical input the engine reasons over. */
export interface InterviewInput {
  /** Complaint concept codes from the encounter. */
  readonly complaints: readonly string[];
  readonly patient: PatientContext;
  readonly responses: readonly ResponseRecord[];
  readonly symptomFacts: readonly SymptomFact[];
  readonly conditionCodes: readonly string[];
  readonly medicationCodes: readonly string[];
  readonly allergyCategories: readonly (
    "DRUG" | "FOOD" | "ENVIRONMENTAL" | "OTHER"
  )[];
  readonly vitals: Readonly<Record<string, number>>;
  readonly labFlaggedHigh: readonly string[];
  readonly labFlaggedLow: readonly string[];
  readonly documentCount: number;
}

/** The subset of a question a client needs to render it. */
export interface QuestionView {
  readonly key: string;
  readonly kind: QuestionKind;
  readonly category: QuestionCategory;
  readonly pathwayKey: string;
  /** Localisation key; always equal to the question key. */
  readonly promptKey: string;
  readonly options: readonly {
    readonly key: string;
    readonly conceptCodes: readonly string[];
    readonly severity?: Severity;
  }[];
  readonly socratesDimensions: readonly SocratesDimension[];
  readonly rationale: string;
  readonly required: boolean;
  readonly askCount: number;
}

/** Question-progression metrics, surfaced to the UI progress bar. */
export interface ProgressView {
  readonly asked: number;
  readonly activeCount: number;
  readonly requiredClosed: number;
  readonly requiredTotal: number;
  readonly socratesRequiredRatio: number;
}

export type InterviewStatus =
  | "IN_PROGRESS"
  | "COMPLETE"
  | "INCOMPLETE"
  | "NEEDS_CLARIFICATION"
  | "SAFETY_ESCALATION";

/** Completion / clarification state of the whole interview. */
export interface CompletionView {
  readonly status: InterviewStatus;
  readonly outstandingRequired: readonly string[];
  readonly outstandingReason: Readonly<Record<string, string>>;
  readonly canFinishAnyway: boolean;
  readonly maxQuestionsReached: boolean;
}

export interface NextQuestionResult {
  /** null when nothing remains to ask (complete, or budget exhausted). */
  readonly question: QuestionView | null;
  readonly progress: ProgressView;
  readonly completion: CompletionView;
  /** Why this question was selected (debug / physician display). */
  readonly rationale: string | null;
}

/** A clinical fact delta implied by a response, with its evidence requirements. */
export interface FactDelta {
  readonly kind: FactKind;
  readonly conceptCode: string;
  readonly displayName: string;
  readonly severity?: Severity;
  readonly onsetDate?: string;
  readonly durationDays?: number;
  readonly negated: boolean;
  readonly socratesDimension?: SocratesDimension;
  readonly rawAnswer: string;
  readonly confidence: number;
}

/** An advisory asking for clinician attention. Does NOT set the triage level (ADR-009). */
export interface EscalationAdvisory {
  readonly key: string;
  readonly advisory: string;
}

/** The full outcome of evaluating one response, including the post-response state. */
export interface ResponseOutcome {
  readonly state: InterviewQuestionState;
  /** Server-computed NormalisedAnswer, when one was produced. */
  readonly normalisedJson: unknown | null;
  readonly facts: readonly FactDelta[];
  /** declined/unknown/NOT_APPLICABLE and answered facts imply evidence; skipped does not. */
  readonly evidenceExpected: boolean;
  readonly advisories: readonly EscalationAdvisory[];
  /** Interview state AFTER this response was applied. */
  readonly next: NextQuestionResult;
  /** True when the client's own interpretation disagreed with the server's parse. */
  readonly hintMismatch: boolean;
}

/** A client-submitted response to one active question. */
export interface ResponseRequest {
  readonly questionKey: string;
  readonly state?:
    "ANSWERED" | "SKIPPED" | "DECLINED" | "UNKNOWN" | "NOT_APPLICABLE";
  readonly rawAnswer: string | null;
  readonly modality: "VOICE" | "TOUCH" | "STAFF_ASSISTED" | "IMPORTED";
  readonly asrConfidence?: number;
  readonly asrLanguage?: string;
  /** Client-supplied normalisedAnswer (untrusted; compared against the server parse). */
  readonly clientHintJson?: unknown;
  /**
   * Injected clock. The engine never reads `Date.now()`: relative dates and timestamps are
   * computed from this instant so evaluation runs are reproducible.
   */
  readonly now: Date;
}
