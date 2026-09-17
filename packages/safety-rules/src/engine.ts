/**
 * The deterministic triage engine: context mapping, evidence collection and rule evaluation.
 *
 * Pure function, no I/O, no clock, no randomness. The same input always yields the same triage
 * level, which is what makes the engine testable, replayable against a recorded rule-set version,
 * and defensible to a clinician. See ADR-009.
 *
 * Two behaviours are load-bearing:
 *
 * 1. No hit without evidence. A rule whose trigger is true but whose `evidenceRequired` facts are
 *    absent does not fire. The non-firing is recorded in the explanation rather than hidden.
 * 2. Unknown age cannot silently skip. An age-bounded rule does not fire when the age is unknown,
 *    and the explanation says it could not be evaluated, so the gap is visible rather than silent.
 */

import {
  EMPTY_TRIGGER_CONTEXT,
  evaluateTrigger,
  type TriggerContext,
} from '@medikiosk/clinical-schema';
import type { RuleEvaluationInput } from './types';
import { CARDIO_RESPIRATORY_RULES } from './rules/cardio-respiratory';
import { NEURO_INFECTION_RULES } from './rules/neuro-infection';
import { BLEEDING_HAEMODYNAMIC_RULES } from './rules/bleeding-metabolic';
import { ELECTROLYTE_SPECIAL_RULES } from './rules/electrolyte-special';
import { RULE_SET_VERSION, type RedFlagHit, type RedFlagRule } from './types';

export const DEFAULT_RULES: readonly RedFlagRule[] = [
  ...CARDIO_RESPIRATORY_RULES,
  ...NEURO_INFECTION_RULES,
  ...BLEEDING_HAEMODYNAMIC_RULES,
  ...ELECTROLYTE_SPECIAL_RULES,
];

export const RULE_SET_SUMMARY = {
  version: RULE_SET_VERSION,
  ruleCount: DEFAULT_RULES.length,
  redCount: DEFAULT_RULES.filter((rule) => rule.severity === 'RED' && !rule.advisoryOnly).length,
  amberCount: DEFAULT_RULES.filter(
    (rule) => rule.severity === 'AMBER' && !rule.advisoryOnly,
  ).length,
  advisoryCount: DEFAULT_RULES.filter((rule) => rule.advisoryOnly).length,
};

/**
 * Facts the input establishes, used to test `evidenceRequired`.
 *
 * Denied symptoms (`negated: true`) are EXCLUDED: a symptom the patient explicitly denied is not a
 * fact any rule may rely on, and including it would let a rule fire on a denial.
 */
export function collectEvidenceFacts(input: RuleEvaluationInput): Set<string> {
  const facts = new Set<string>();

  for (const symptom of input.symptomFacts) {
    if (!symptom.negated) facts.add(symptom.code);
  }
  for (const code of input.symptomCodes) facts.add(code);

  for (const vital of input.vitalFacts) {
    const key = vital.componentCode ? `${vital.code}:${vital.componentCode}` : vital.code;
    facts.add(key);
    facts.add(vital.code);
  }

  for (const lab of input.labFacts) {
    facts.add(lab.testCode);
    if (lab.flag === 'HIGH' || lab.flag === 'CRITICAL_HIGH') facts.add(`${lab.testCode}:HIGH`);
    if (lab.flag === 'LOW' || lab.flag === 'CRITICAL_LOW') facts.add(`${lab.testCode}:LOW`);
  }

  for (const code of input.conditionCodes) facts.add(code);
  for (const code of input.medicationCodes) facts.add(code);
  for (const code of input.allergyCodes) facts.add(code);
  for (const key of input.answeredYesQuestionKeys) facts.add(key);
  if (input.pregnant) facts.add('MK-CON-014');
  if (input.safetyCriticalUnresolvedQuestionKeys.length > 0) {
    facts.add('SAFETY_CRITICAL_UNRESOLVED');
  }

  return facts;
}

/** Map the evaluation input onto the trigger expression context. */
export function buildTriggerContext(input: RuleEvaluationInput): TriggerContext {
  const symptomDurationDays: Record<string, number> = {};
  for (const symptom of input.symptomFacts) {
    if (symptom.durationDays !== undefined) symptomDurationDays[symptom.code] = symptom.durationDays;
  }

  const vitals: Record<string, number> = {};
  for (const vital of input.vitalFacts) {
    // Implausible readings are excluded from rule evaluation: a rule must not escalate a patient
    // on the basis of a reading the system itself believes is a data error.
    if (vital.implausible) continue;
    const key = vital.componentCode ? `${vital.code}:${vital.componentCode}` : vital.code;
    vitals[key] = vital.value;
    vitals[vital.code] = vital.value;
  }

  const labFlaggedHigh = input.labFacts
    .filter((lab) => lab.flag === 'HIGH' || lab.flag === 'CRITICAL_HIGH')
    .map((lab) => lab.testCode);
  const labFlaggedLow = input.labFacts
    .filter((lab) => lab.flag === 'LOW' || lab.flag === 'CRITICAL_LOW')
    .map((lab) => lab.testCode);

  const answeredYes: Record<string, boolean> = {};
  for (const key of input.answeredYesQuestionKeys) answeredYes[key] = true;
  const unanswered: Record<string, boolean> = {};
  for (const key of input.safetyCriticalUnresolvedQuestionKeys) unanswered[key] = true;

  return {
    ...EMPTY_TRIGGER_CONTEXT,
    symptomCodes: [...input.symptomCodes],
    symptomDurationDays,
    answeredYes,
    unanswered,
    ...(input.ageYears === undefined ? {} : { ageYears: input.ageYears }),
    ...(input.sex === undefined ? {} : { sex: input.sex }),
    ...(input.pregnant === undefined ? {} : { pregnant: input.pregnant }),
    conditionCodes: [...input.conditionCodes],
    medicationCodes: [...input.medicationCodes],
    allergyCategories: [],
    vitals,
    labFlaggedHigh,
    labFlaggedLow,
    documentCount: input.documentCount,
  };
}

interface RuleOutcome {
  readonly hit?: RedFlagHit;
  readonly evidenceGated?: { readonly identifier: string; readonly missing: readonly string[] };
  readonly ageSkipped?: { readonly identifier: string };
}

function evaluateRule(
  rule: RedFlagRule,
  context: TriggerContext,
  facts: ReadonlySet<string>,
): RuleOutcome {
  if (rule.minAgeYears !== undefined || rule.maxAgeYears !== undefined) {
    if (context.ageYears === undefined) {
      return { ageSkipped: { identifier: rule.identifier } };
    }
    if (rule.minAgeYears !== undefined && context.ageYears < rule.minAgeYears) return {};
    if (rule.maxAgeYears !== undefined && context.ageYears > rule.maxAgeYears) return {};
  }

  // DATA_INCOMPLETE_SAFETY_001 is handled by the assessor, not here: its "trigger" is the presence
  // of unresolved safety questions, which is an input property rather than a clinical predicate.
  if (rule.identifier === 'DATA_INCOMPLETE_SAFETY_001') return {};

  if (!evaluateTrigger(rule.trigger, context)) return {};

  const missing = rule.evidenceRequired.filter(
    (fact) => !facts.has(fact) && !facts.has(fact.split(':')[0] ?? fact),
  );
  if (missing.length > 0) {
    return { evidenceGated: { identifier: rule.identifier, missing } };
  }

  return {
    hit: {
      ruleIdentifier: rule.identifier,
      ruleVersion: rule.version,
      severity: rule.severity,
      action: rule.action,
      description: rule.description,
      clinicalRationale: rule.clinicalRationale,
      source: rule.source,
      evidenceRefs: [...rule.evidenceRequired],
      evidenceIds: [],
      advisoryOnly: rule.advisoryOnly ?? false,
    },
  };
}