/**
 * The deterministic evaluator for trigger expressions.
 *
 * Total by design: for any expression and any context it returns a boolean and cannot throw.
 *
 * A missing fact makes a positive predicate false rather than raising. That is the correct default
 * for *pathway entry* — the interview must not invent a pathway for a patient we know nothing
 * about. It is deliberately NOT the default for the safety engine, which treats missing
 * safety-critical data as requiring human review rather than as absent. The two behaviours differ
 * because the two decisions have different failure costs. See ADR-009.
 */

import type { TriggerContext, TriggerExpression } from './trigger';

export function evaluateTrigger(expression: TriggerExpression, context: TriggerContext): boolean {
  if ('always' in expression) return true;
  if ('not' in expression) return !evaluateTrigger(expression.not, context);
  if ('all' in expression) return expression.all.every((child) => evaluateTrigger(child, context));
  if ('any' in expression) return expression.any.some((child) => evaluateTrigger(child, context));

  if ('hasSymptom' in expression) return context.symptomCodes.includes(expression.hasSymptom);
  if ('hasSymptomAny' in expression) {
    return expression.hasSymptomAny.some((code) => context.symptomCodes.includes(code));
  }
  if ('answeredYes' in expression) return context.answeredYes[expression.answeredYes] === true;
  if ('answeredNo' in expression) return context.answeredNo[expression.answeredNo] === true;
  if ('answeredAny' in expression) return context.answeredAny[expression.answeredAny] === true;
  if ('unanswered' in expression) return context.unanswered[expression.unanswered] === true;

  if ('ageAtLeast' in expression) {
    return context.ageYears !== undefined && context.ageYears >= expression.ageAtLeast;
  }
  if ('ageAtMost' in expression) {
    return context.ageYears !== undefined && context.ageYears <= expression.ageAtMost;
  }
  if ('sex' in expression) return context.sex === expression.sex;
  if ('pregnant' in expression) return context.pregnant === true;

  if ('hasCondition' in expression) return context.conditionCodes.includes(expression.hasCondition);
  if ('hasMedication' in expression) {
    return context.medicationCodes.includes(expression.hasMedication);
  }
  if ('hasAllergyCategory' in expression) {
    return context.allergyCategories.includes(expression.hasAllergyCategory);
  }

  if ('symptomDurationLessThanDays' in expression) {
    const { code, days } = expression.symptomDurationLessThanDays;
    const actual = context.symptomDurationDays[code];
    return actual !== undefined && actual < days;
  }
  if ('symptomDurationAtLeastDays' in expression) {
    const { code, days } = expression.symptomDurationAtLeastDays;
    const actual = context.symptomDurationDays[code];
    return actual !== undefined && actual >= days;
  }

  if ('vitalAbove' in expression) {
    const actual = context.vitals[expression.vitalAbove.code];
    return actual !== undefined && actual > expression.vitalAbove.value;
  }
  if ('vitalBelow' in expression) {
    const actual = context.vitals[expression.vitalBelow.code];
    return actual !== undefined && actual < expression.vitalBelow.value;
  }

  if ('labFlaggedHigh' in expression) {
    return context.labFlaggedHigh.includes(expression.labFlaggedHigh);
  }
  if ('labFlaggedLow' in expression) {
    return context.labFlaggedLow.includes(expression.labFlaggedLow);
  }

  if ('documentCountAtLeast' in expression) {
    return context.documentCount >= expression.documentCountAtLeast;
  }

  // Exhaustive by construction: adding a variant without handling it becomes a compile error
  // rather than a silent `false`.
  return unhandledTrigger(expression);
}

function unhandledTrigger(value: never): never {
  throw new Error(`Unhandled trigger expression: ${JSON.stringify(value)}`);
}

/**
 * True when the expression references the given fact at all.
 *
 * Used by the safety engine's coverage report to answer "does any rule watch for this red flag
 * input?". A rule set that silently watches nothing is the failure mode this exists to detect.
 */
export function triggerReferences(expression: TriggerExpression, fact: string): boolean {
  const keys = JSON.stringify(expression);
  return keys.includes(`"${fact}"`);
}