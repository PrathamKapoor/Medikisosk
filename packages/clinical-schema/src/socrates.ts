/**
 * SOCRATES: a formal, per-complaint symptom characterisation.
 *
 * S - Site            O - Onset        C - Character      R - Radiation
 * A - Associated      T - Timing       E - Exacerbating / relieving
 * S - Severity
 *
 * The important design point is that SOCRATES is **per complaint**, not global. Asking a patient
 * with a headache whether the pain radiates to the left arm is not thoroughness, it is an error:
 * it wastes the patient's time and dilutes the questions that matter. Each complaint therefore
 * declares which dimensions are relevant, and whether each is required or optional. See ADR-008.
 */

import { z } from 'zod';
import { RESPONSE_STATES } from '@medikiosk/shared-types';
import { normalisedAnswerSchema } from './answer';

export const SOCRATES_DIMENSIONS = [
  'SITE',
  'ONSET',
  'CHARACTER',
  'RADIATION',
  'ASSOCIATED',
  'TIMING',
  'EXACERBATING_RELIEVING',
  'SEVERITY',
] as const;

export type SocratesDimension = (typeof SOCRATES_DIMENSIONS)[number];

export const SOCRATES_DIMENSION_LABELS: Record<
  SocratesDimension,
  { letter: string; label: string }
> = {
  SITE: { letter: 'S', label: 'Site' },
  ONSET: { letter: 'O', label: 'Onset' },
  CHARACTER: { letter: 'C', label: 'Character' },
  RADIATION: { letter: 'R', label: 'Radiation' },
  ASSOCIATED: { letter: 'A', label: 'Associated symptoms' },
  TIMING: { letter: 'T', label: 'Timing' },
  EXACERBATING_RELIEVING: { letter: 'E', label: 'Aggravating and relieving factors' },
  SEVERITY: { letter: 'S', label: 'Severity' },
};

/**
 * Relevance of one SOCRATES dimension for one complaint.
 *
 * `required: true` means the interview does not consider that complaint characterised until the
 * dimension has reached a terminal state. `required: false` means it is asked only if the
 * interview still has budget, which keeps short interviews short for genuinely minor complaints.
 */
export const socratesRelevanceSchema = z.object({
  dimension: z.enum(SOCRATES_DIMENSIONS),
  required: z.boolean(),
  /**
   * Question key used to resolve the localised wording. Never an inline English string, so that
   * every question can be translated and clinically reviewed. See the i18n design.
   */
  questionKey: z.string().min(1).max(120),
  /**
   * Touch options offered alongside voice. A patient who cannot read must be able to answer by
   * tapping a word-and-icon card, so no dimension may be voice-only.
   */
  optionKeys: z.array(z.string().min(1).max(120)).default([]),
  /** Clinical rationale. Shown to the physician and used to justify the question in review. */
  rationale: z.string().max(400),
});

export type SocratesRelevance = z.infer<typeof socratesRelevanceSchema>;

/** Which SOCRATES dimensions apply to a complaint, and why. */
export const socratesProfileSchema = z.object({
  complaintCode: z.string().min(1).max(64),
  version: z.string().min(1).max(24),
  dimensions: z.array(socratesRelevanceSchema).min(1),
});

export type SocratesProfile = z.infer<typeof socratesProfileSchema>;

/** The captured state of one SOCRATES dimension. */
export const socratesSlotSchema = z.object({
  dimension: z.enum(SOCRATES_DIMENSIONS),
  state: z.enum(RESPONSE_STATES).default('UNANSWERED'),
  answer: normalisedAnswerSchema.optional(),
  /** Evidence rows supporting this slot, so the claim can be traced back to its source. */
  evidenceIds: z.array(z.string().min(1).max(64)).default([]),
  /** How many times this dimension has been asked. Bounds repetition. */
  askCount: z.number().int().nonnegative().default(0),
});

export type SocratesSlot = z.infer<typeof socratesSlotSchema>;

export type SocratesSlotMap = Partial<Record<SocratesDimension, SocratesSlot>>;

export function emptySocratesState(profile: SocratesProfile): SocratesSlotMap {
  const slots: SocratesSlotMap = {};
  for (const relevance of profile.dimensions) {
    slots[relevance.dimension] = {
      dimension: relevance.dimension,
      state: 'UNANSWERED',
      evidenceIds: [],
      askCount: 0,
    };
  }
  return slots;
}

export interface SocratesCompleteness {
  readonly requiredTotal: number;
  readonly requiredClosed: number;
  readonly optionalTotal: number;
  readonly optionalClosed: number;
  /** 0..1 over required dimensions only. The interview's completion criterion uses this. */
  readonly requiredRatio: number;
  /** Dimensions that are still open, in the order the interview should retry them. */
  readonly outstanding: readonly SocratesDimension[];
}

/**
 * The single place that decides whether a SOCRATES state is complete.
 *
 * Uses terminal-state semantics: `DECLINED` and `UNKNOWN` close a dimension. A patient who
 * declines to describe the character of their pain has answered, and the system records the
 * refusal rather than asking again. It must never treat that refusal as "no character".
 */
export function socratesCompleteness(
  profile: SocratesProfile,
  slots: SocratesSlotMap,
): SocratesCompleteness {
  const closedStates = new Set<string>([
    'ANSWERED',
    'VERIFIED',
    'DECLINED',
    'UNKNOWN',
    'NOT_APPLICABLE',
  ]);

  let requiredTotal = 0;
  let requiredClosed = 0;
  let optionalTotal = 0;
  let optionalClosed = 0;
  const outstanding: SocratesDimension[] = [];

  for (const relevance of profile.dimensions) {
    const slot = slots[relevance.dimension];
    const closed = slot !== undefined && closedStates.has(slot.state);
    if (relevance.required) {
      requiredTotal += 1;
      if (closed) requiredClosed += 1;
      else outstanding.push(relevance.dimension);
    } else {
      optionalTotal += 1;
      if (closed) optionalClosed += 1;
    }
  }

  return {
    requiredTotal,
    requiredClosed,
    optionalTotal,
    optionalClosed,
    requiredRatio: requiredTotal === 0 ? 1 : requiredClosed / requiredTotal,
    outstanding,
  };
}