/**
 * The triage assessor: level selection, human-review escalation and explanation rendering.
 *
 * Level is the maximum severity over non-advisory hits; advisory-only hits never raise the level but
 * still appear and can require human review. The separation matters: an unresolved safety question
 * demands attention without asserting an acuity it has no evidence for.
 */

import { evaluateTrigger } from '@medikiosk/clinical-schema';
import { levelToPriority, maxTriageLevel, TRIAGE_SEVERITY_RANK, type TriageLevel } from '@medikiosk/shared-types';
import {
  RULE_SET_VERSION,
  type RedFlagHit,
  type RedFlagRule,
  type RuleEvaluationInput,
  type TriageAssessmentResult,
} from './types';
import { buildTriggerContext, collectEvidenceFacts, DEFAULT_RULES } from './engine';

export function evaluateTriage(
  input: RuleEvaluationInput,
  rules: readonly RedFlagRule[] = DEFAULT_RULES,
): TriageAssessmentResult {
  const context = buildTriggerContext(input);
  const facts = collectEvidenceFacts(input);

  const hits: RedFlagHit[] = [];
  const evidenceGated: { identifier: string; missing: readonly string[] }[] = [];
  const ageSkipped: string[] = [];

  for (const rule of rules) {
    if (rule.identifier === 'DATA_INCOMPLETE_SAFETY_001') {
      if (input.safetyCriticalUnresolvedQuestionKeys.length > 0) {
        hits.push(makeHit(rule, `Unresolved safety-critical question(s): ${input.safetyCriticalUnresolvedQuestionKeys.join(', ')}`, [
          ...input.safetyCriticalUnresolvedQuestionKeys,
        ]));
      }
      continue;
    }

    if (rule.minAgeYears !== undefined || rule.maxAgeYears !== undefined) {
      if (input.ageYears === undefined) {
        ageSkipped.push(rule.identifier);
        continue;
      }
      if (rule.minAgeYears !== undefined && input.ageYears < rule.minAgeYears) continue;
      if (rule.maxAgeYears !== undefined && input.ageYears > rule.maxAgeYears) continue;
    }

    if (!evaluateTrigger(rule.trigger, context)) continue;

    const missing = rule.evidenceRequired.filter(
      (fact) => !facts.has(fact) && !facts.has((fact.split(':')[0] as string) ?? fact),
    );
    if (missing.length > 0) {
      evidenceGated.push({ identifier: rule.identifier, missing });
      continue;
    }

    hits.push(makeHit(rule, rule.description, [...rule.evidenceRequired]));
  }

  const decisiveHits = hits.filter((hit) => !hit.advisoryOnly);
  const level: TriageLevel = maxTriageLevel(decisiveHits.map((hit) => hit.severity));

  const requiresHumanReview =
    hits.some((hit) => hit.action === 'IMMEDIATE_HUMAN_TRIAGE') ||
    hits.some((hit) => hit.advisoryOnly);

  return {
    level,
    priority: levelToPriority(level),
    hits,
    requiresHumanReview,
    ruleSetVersion: RULE_SET_VERSION,
    explanation: renderExplanation(hits, evidenceGated, ageSkipped, level, requiresHumanReview),
  };
}

function makeHit(
  rule: RedFlagRule,
  description: string,
  evidenceRefs: readonly string[],
): RedFlagHit {
  return {
    ruleIdentifier: rule.identifier,
    ruleVersion: rule.version,
    severity: rule.severity,
    action: rule.action,
    description,
    clinicalRationale: rule.clinicalRationale,
    source: rule.source,
    evidenceRefs,
    evidenceIds: [],
    advisoryOnly: rule.advisoryOnly ?? false,
  };
}

/**
 * Render the full explanation.
 *
 * The explanation is a safety artefact, not marketing copy. It names every fired rule with its
 * version and evidence, it names every rule that could not be evaluated and why, and it states
 * explicitly that a rule evaluation is not a diagnosis. A RED assessment never uses the word
 * "emergency" as a conclusion; it states that a priority human assessment is required.
 */
function renderExplanation(
  hits: readonly RedFlagHit[],
  evidenceGated: readonly { identifier: string; missing: readonly string[] }[],
  ageSkipped: readonly string[],
  level: TriageLevel,
  requiresHumanReview: boolean,
): string {
  const gatedText =
    evidenceGated.length > 0
      ? ` Not evaluated to a hit for lack of evidence: ${evidenceGated
          .map((gated) => `${gated.identifier} (missing ${gated.missing.join(', ')})`)
          .join('; ')}.`
      : '';
  const ageText =
    ageSkipped.length > 0
      ? ` Not evaluated for lack of age: ${ageSkipped.join(', ')}. The unknown age requires human review rather than being assumed safe.`
      : '';

  if (hits.length === 0) {
    return (
      `No red-flag rule fired. This is a routine assessment from rule set ${RULE_SET_VERSION}.${gatedText}${ageText} ` +
      'A clear rule evaluation is not a diagnosis and does not exclude serious illness; the physician review remains the clinical authority.'
    );
  }

  const hitText = hits
    .map(
      (hit) =>
        `${hit.ruleIdentifier} (${hit.ruleVersion}): ${hit.description}. Evidence: ${hit.evidenceRefs.join(', ')}.`,
    )
    .join(' ');

  const levelWord =
    TRIAGE_SEVERITY_RANK[level] === 2 ? 'Priority assessment required' : 'Priority review advised';
  const reviewWord = requiresHumanReview
    ? ' The patient must be seen by a human before routine handling.'
    : '';

  return `${levelWord}. ${hitText}${gatedText}${ageText}${reviewWord} Rule set ${RULE_SET_VERSION}. A rule evaluation is not a diagnosis.`;
}