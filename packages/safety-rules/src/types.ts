/**
 * Deterministic red-flag rule types.
 *
 * One rule per file group, one rule set, one engine, zero model calls. A triage decision is
 * reproducible from its inputs plus the rule-set version, which is why it is defensible in a way a
 * model output never can be. See ADR-009.
 */

import type { TriggerExpression } from '@medikiosk/clinical-schema';
import type { TriageLevel, TriagePriority } from '@medikiosk/shared-types';

/** The active clinical rule-set version. Recorded on every triage assessment for replay. */
export const RULE_SET_VERSION = '1.0.0';

export interface RedFlagRule {
  /** Stable, human-readable, e.g. `CHEST_PAIN_HIGH_RISK_001`. Never renumbered once published. */
  readonly identifier: string;
  /** Plain-language statement of what the rule detects. */
  readonly description: string;
  readonly trigger: TriggerExpression;
  /**
   * Facts that MUST be present for the rule to fire, e.g. `['MK-SYM-001', 'MK-SYM-002']`.
   * A rule whose trigger is true but whose evidence is absent does not fire; the mechanical
   * enforcement of "no hit without evidence".
   */
  readonly evidenceRequired: readonly string[];
  readonly severity: TriageLevel;
  readonly action: 'IMMEDIATE_HUMAN_TRIAGE' | 'PRIORITY_CLINICIAN_REVIEW' | 'ROUTINE';
  /** Why this matters clinically, shown to the physician with the hit. */
  readonly clinicalRationale: string;
  /** Provenance of the basis. A curated starter set says so; it never claims a guideline. */
  readonly source: string;
  readonly version: string;
  readonly minAgeYears?: number;
  readonly maxAgeYears?: number;
  /** Advisory rules request clinician attention without asserting an acuity level. */
  readonly advisoryOnly?: boolean;
}

export interface RuleEvaluationInput {
  readonly symptomCodes: readonly string[];
  readonly symptomFacts: readonly {
    readonly code: string;
    readonly severity?: 'NONE' | 'MILD' | 'MODERATE' | 'SEVERE' | 'VERY_SEVERE' | 'UNKNOWN';
    readonly durationDays?: number;
    readonly negated: boolean;
  }[];
  readonly vitalFacts: readonly {
    readonly code: string;
    readonly componentCode?: 'SYSTOLIC' | 'DIASTOLIC';
    readonly value: number;
    readonly implausible?: boolean;
  }[];
  readonly labFacts: readonly {
    readonly testCode: string;
    readonly flag: 'NORMAL' | 'HIGH' | 'LOW' | 'CRITICAL_HIGH' | 'CRITICAL_LOW' | 'UNKNOWN';
    readonly value: number;
  }[];
  readonly conditionCodes: readonly string[];
  readonly medicationCodes: readonly string[];
  readonly allergyCodes: readonly string[];
  readonly ageYears?: number;
  readonly sex?: 'MALE' | 'FEMALE' | 'OTHER';
  readonly pregnant?: boolean;
  /** Safety-critical question keys whose state is NOT terminal. Never treated as negative. */
  readonly safetyCriticalUnresolvedQuestionKeys: readonly string[];
  /** Question keys answered YES, so a rule can key on e.g. `q.special.trauma_mechanism`. */
  readonly answeredYesQuestionKeys: readonly string[];
  readonly documentCount: number;
}

export interface RedFlagHit {
  readonly ruleIdentifier: string;
  readonly ruleVersion: string;
  readonly severity: TriageLevel;
  readonly action: RedFlagRule['action'];
  readonly description: string;
  readonly clinicalRationale: string;
  readonly source: string;
  /** Facts the rule relied on. Non-empty by construction; an evidence-less hit is a bug. */
  readonly evidenceRefs: readonly string[];
  /** Evidence row ids, resolved by the caller from evidenceRefs. */
  readonly evidenceIds: readonly string[];
  readonly advisoryOnly: boolean;
}

export interface TriageAssessmentResult {
  readonly level: TriageLevel;
  readonly priority: TriagePriority;
  readonly hits: readonly RedFlagHit[];
  /** True when the patient must be seen by a human before routine handling. */
  readonly requiresHumanReview: boolean;
  readonly ruleSetVersion: string;
  /** A complete clinician-readable paragraph. It never diagnoses. */
  readonly explanation: string;
}