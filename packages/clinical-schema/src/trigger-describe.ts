/**
 * Human-readable rendering of trigger expressions.
 *
 * The same function is used by the admin rule viewer, the physician console and the evaluation
 * report, so a rule can never be described differently in two places. Accurate description matters:
 * a clinician approving a rule must see exactly what it tests.
 */

import type { TriggerExpression } from './trigger';

export function describeTrigger(expression: TriggerExpression): string {
  if ('always' in expression) return 'always';
  if ('not' in expression) return `NOT (${describeTrigger(expression.not)})`;
  if ('all' in expression) return `ALL OF (${expression.all.map(describeTrigger).join('; ')})`;
  if ('any' in expression) return `ANY OF (${expression.any.map(describeTrigger).join('; ')})`;
  if ('hasSymptom' in expression) return `complaint is ${expression.hasSymptom}`;
  if ('hasSymptomAny' in expression) {
    return `complaint is any of ${expression.hasSymptomAny.join(' | ')}`;
  }
  if ('answeredYes' in expression) return `${expression.answeredYes} answered YES`;
  if ('answeredNo' in expression) return `${expression.answeredNo} answered NO`;
  if ('answeredAny' in expression) return `${expression.answeredAny} answered`;
  if ('unanswered' in expression) return `${expression.unanswered} unresolved`;
  if ('ageAtLeast' in expression) return `age >= ${expression.ageAtLeast} years`;
  if ('ageAtMost' in expression) return `age <= ${expression.ageAtMost} years`;
  if ('sex' in expression) return `sex is ${expression.sex}`;
  if ('pregnant' in expression) return 'pregnancy recorded';
  if ('hasCondition' in expression) return `history of ${expression.hasCondition}`;
  if ('hasMedication' in expression) return `taking ${expression.hasMedication}`;
  if ('hasAllergyCategory' in expression) return `allergy of type ${expression.hasAllergyCategory}`;
  if ('symptomDurationLessThanDays' in expression) {
    const { code, days } = expression.symptomDurationLessThanDays;
    return `${code} present for < ${days} day(s)`;
  }
  if ('symptomDurationAtLeastDays' in expression) {
    const { code, days } = expression.symptomDurationAtLeastDays;
    return `${code} present for >= ${days} day(s)`;
  }
  if ('vitalAbove' in expression) {
    return `${expression.vitalAbove.code} > ${expression.vitalAbove.value}`;
  }
  if ('vitalBelow' in expression) {
    return `${expression.vitalBelow.code} < ${expression.vitalBelow.value}`;
  }
  if ('labFlaggedHigh' in expression) return `${expression.labFlaggedHigh} flagged high`;
  if ('labFlaggedLow' in expression) return `${expression.labFlaggedLow} flagged low`;
  if ('documentCountAtLeast' in expression) {
    return `document count >= ${expression.documentCountAtLeast}`;
  }
  return 'unrecognised trigger';
}

/** Number of nodes in a trigger tree. Used to bound evaluation cost during authoring. */
export function triggerNodeCount(expression: TriggerExpression): number {
  if ('always' in expression) return 1;
  if ('not' in expression) return 1 + triggerNodeCount(expression.not);
  if ('all' in expression) {
    return 1 + expression.all.reduce((sum, child) => sum + triggerNodeCount(child), 0);
  }
  if ('any' in expression) {
    return 1 + expression.any.reduce((sum, child) => sum + triggerNodeCount(child), 0);
  }
  return 1;
}