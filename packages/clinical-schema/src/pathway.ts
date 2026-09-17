/**
 * Question model for the structured interview.
 *
 * Every question is identified by a stable key that doubles as its localisation key and its
 * evidence source reference. There are deliberately no inline English strings anywhere in this
 * package: a question that cannot be translated cannot be asked to a patient who does not read
 * English. See the i18n design.
 */

import { z } from 'zod';
import { SOCRATES_DIMENSIONS } from './socrates';
import { SEVERITY_SCALE } from './primitives';

/**
 * How a question is presented and answered.
 *
 * Every kind must be answerable by touch as well as by voice. Voice-only questions would exclude
 * patients who cannot or will not speak to a machine, and a kiosk in an Indian OPD must serve them.
 */
export const QUESTION_KINDS = [
  'YES_NO',
  'SINGLE_CHOICE',
  'MULTI_CHOICE',
  'FREE_TEXT',
  'SEVERITY',
  'BODY_SITE',
  'DURATION',
  'NUMBER',
  'DATE',
  'DOCUMENT_UPLOAD',
  /** A prompt with no answer, used to explain something or to request an action. */
  'INSTRUCTION',
] as const;

export type QuestionKind = (typeof QUESTION_KINDS)[number];

/**
 * Question priority.
 *
 * Fixed and testable, with safety-critical questions first so that an interrupted interview has
 * still captured what matters most. A lower rank is asked earlier.
 */
export const QUESTION_CATEGORIES = [
  'SAFETY_CRITICAL',
  'CHIEF_COMPLAINT',
  'RELEVANT_HISTORY',
  'MEDICATION_ALLERGY',
  'CONTEXTUAL',
  'COMPLETENESS',
] as const;

export type QuestionCategory = (typeof QUESTION_CATEGORIES)[number];

export const CATEGORY_PRIORITY_RANK: Record<QuestionCategory, number> = {
  SAFETY_CRITICAL: 1,
  CHIEF_COMPLAINT: 2,
  RELEVANT_HISTORY: 3,
  MEDICATION_ALLERGY: 4,
  CONTEXTUAL: 5,
  COMPLETENESS: 6,
};

/** One selectable option on a touch card. */
export const questionOptionSchema = z.object({
  /** Stable key, always resolved through localisation. Never an inline English string. */
  key: z.string().min(1).max(120),
  /** Concept codes recorded when this option is chosen. */
  conceptCodes: z.array(z.string().max(64)).default([]),
  /**
   * Severity implied by the option, when the option is a severity answer. Lets a tap on
   * "very severe" behave identically to the equivalent spoken phrase.
   */
  severity: z.enum(SEVERITY_SCALE).optional(),
  /** Icon name from the shared design system, so a non-reader can answer visually. */
  icon: z.string().max(48).optional(),
});

export type QuestionOption = z.infer<typeof questionOptionSchema>;

export const pathwayQuestionSchema = z.object({
  /** Stable question key. Doubles as the localisation key and the evidence source reference. */
  key: z.string().min(1).max(120),
  kind: z.enum(QUESTION_KINDS),
  category: z.enum(QUESTION_CATEGORIES),
  /**
   * `required: true` means the interview is not complete until this question reaches a terminal
   * state. Declining is terminal, so a patient is never trapped in a loop.
   */
  required: z.boolean(),
  options: z.array(questionOptionSchema).default([]),
  /** SOCRATES dimensions this question fills, when it characterises a symptom. */
  socratesDimensions: z.array(z.enum(SOCRATES_DIMENSIONS)).default([]),
  /** Concept codes recorded when the answer is positive. */
  positiveConceptCodes: z.array(z.string().max(64)).default([]),
  /** True when a free-text answer is captured alongside the structured answer. */
  captureVerbatim: z.boolean().default(true),
  /** Why this question is asked. Shown to the physician and required during clinical review. */
  rationale: z.string().max(400),
  /** Maximum times this question may be asked, guarding against clarification loops. */
  maxAsks: z.number().int().min(1).max(4).default(2),
  /** Inclusive minimum age, when the question is age-dependent. */
  minAgeYears: z.number().int().min(0).max(130).optional(),
  /** Inclusive maximum age, when the question is age-dependent. */
  maxAgeYears: z.number().int().min(0).max(130).optional(),
  /** Privacy / consent note shown with the question, when it touches sensitive topics. */
  privacyNoteKey: z.string().max(120).optional(),
});

export type PathwayQuestion = z.infer<typeof pathwayQuestionSchema>;

/**
 * The shape accepted before defaults are applied. Option `conceptCodes`, `options` and similar
 * lists may be omitted and are filled by the schema's defaults, so pathway data stays readable.
 */
export type PathwayQuestionInput = z.input<typeof pathwayQuestionSchema>;

/**
 * Age-appropriate applicability of a question.
 *
 * Unknown age includes the question rather than excluding it: silently skipping questions because
 * the age was not captured would reduce coverage without anyone noticing.
 */
export function questionAppliesToAge(question: PathwayQuestion, ageYears?: number): boolean {
  if (ageYears === undefined) return true;
  if (question.minAgeYears !== undefined && ageYears < question.minAgeYears) return false;
  if (question.maxAgeYears !== undefined && ageYears > question.maxAgeYears) return false;
  return true;
}