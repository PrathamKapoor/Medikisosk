/**
 * Normalisation of a patient answer.
 *
 * The one rule that governs this file: **the raw answer is copied through unchanged and every
 * normalisation is additive**. A patient who says "kal se" leaves the record holding both "kal se"
 * and the resolved date. Overwriting the original would make a misparse undetectable and would
 * remove the patient's own account from their medical record. See ADR-005.
 */

import type { Confidence } from '@medikiosk/shared-types';
import { normalisedAnswerSchema, type NormalisedAnswer } from './answer';
import { dedupeMatches, findConceptMatches } from './concept-match';
import { CONCEPT_INDEX } from './ontology';
import {
  detectNegation,
  detectScriptLanguage,
  detectUncertainty,
  isCodeMixed,
  parseRelativeDate,
  parseSeverity,
} from './normalisation-parse';
import { parseDuration } from './normalisation-quantity';

export interface NormalisationContext {
  /**
   * Reference instant for relative dates. Injected rather than read from `Date.now()` so that tests
   * and evaluation runs are reproducible — an evaluation that changes its answer depending on the
   * day it is run is not an evaluation.
   */
  readonly now: Date;
  /** Language the recogniser believed it heard (BCP-47). Recorded, never trusted blindly. */
  readonly asrLanguage?: string;
  /**
   * Recogniser confidence, if the provider supplies one. Browser speech recognition frequently does
   * not, in which case a documented neutral default is used and the resulting answer confidence is
   * correspondingly capped.
   */
  readonly asrConfidence?: number;
}

/** Neutral recogniser confidence used when a provider supplies none. */
export const DEFAULT_ASR_CONFIDENCE = 0.85;

/**
 * Normalise a patient answer into structured values while preserving the original text.
 *
 * Confidence is deliberately conservative. The interpretation is only as trustworthy as the weaker
 * of recognition and matching, so a strong matcher cannot rescue text that a recogniser may already
 * have corrupted.
 */
export function normaliseAnswer(raw: string, context: NormalisationContext): NormalisedAnswer {
  const matches = dedupeMatches(findConceptMatches(raw, CONCEPT_INDEX));
  const duration = parseDuration(raw);
  const severity = parseSeverity(raw);
  const resolvedOnsetDate = parseRelativeDate(raw, context.now);
  const negated = detectNegation(raw);
  const uncertain = detectUncertainty(raw);

  const asrConfidence = context.asrConfidence ?? DEFAULT_ASR_CONFIDENCE;
  const matchConfidence = matches.length > 0 ? Math.max(...matches.map((match) => match.score)) : 0;

  // When nothing was recognised, the answer is only as good as the recogniser, and is discounted
  // further because there is no corroborating structure.
  const combined =
    matches.length > 0 ? Math.min(asrConfidence, 0.5 + matchConfidence / 2) : asrConfidence * 0.6;

  // Uncertainty expressed by the patient is a genuine reduction in reliability and must be visible.
  const penalty = uncertain ? 0.1 : 0;
  const confidence = Math.max(0, Math.min(1, combined - penalty)) as Confidence;

  const language = detectScriptLanguage(raw);
  const asrLanguage = context.asrLanguage ?? language;

  return normalisedAnswerSchema.parse({
    rawAnswer: raw,
    conceptCodes: matches.map((match) => match.concept.code),
    ...(duration === undefined ? {} : { duration }),
    ...(severity === undefined ? {} : { severity }),
    ...(resolvedOnsetDate === undefined ? {} : { resolvedOnsetDate }),
    ...(duration?.verbatim === undefined ? {} : { quantityVerbatim: duration.verbatim }),
    confidence,
    language: asrLanguage,
    codeMixed: isCodeMixed(raw) || language !== asrLanguage,
    negated,
    uncertain,
  });
}

/**
 * Physician-facing rendering.
 *
 * The verbatim wording is always appended, so the clinician never has to trust the interpretation
 * without being able to see what the patient actually said. This is the textual half of the
 * evidence-trace feature.
 */
export function describeNormalisedAnswer(answer: NormalisedAnswer): string {
  const parts: string[] = [];
  if (answer.negated) parts.push('Denies');
  if (answer.conceptCodes.length > 0) parts.push(answer.conceptCodes.join(', '));
  if (answer.duration) {
    parts.push(
      `${answer.duration.approximate ? 'about ' : ''}${answer.duration.value} ${answer.duration.unit
        .toLowerCase()
        .replace(/s$/, '')}${answer.duration.value === 1 ? '' : 's'}`,
    );
  }
  if (answer.severity && answer.severity !== 'UNKNOWN') {
    parts.push(`severity ${answer.severity.toLowerCase().replace(/_/g, ' ')}`);
  }
  if (answer.resolvedOnsetDate) parts.push(`from ${answer.resolvedOnsetDate}`);
  if (parts.length === 0) return `Patient said: "${answer.rawAnswer}"`;
  return `${parts.join(', ')} — patient said: "${answer.rawAnswer}"`;
}

/**
 * Whether the answer needs the patient to confirm the interpretation before it is stored as fact.
 *
 * A low-confidence interpretation of a safety-relevant answer must never be silently promoted into
 * the record, because the safety engine reads the record.
 */
export function needsPatientConfirmation(answer: NormalisedAnswer, threshold = 0.7): boolean {
  return answer.confidence < threshold;
}