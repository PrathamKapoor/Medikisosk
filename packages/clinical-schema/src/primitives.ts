/**
 * Shared Zod primitives for the clinical domain.
 *
 * Every clinical value that crosses a boundary is described here once. Duplicating a confidence
 * range or an onset-duration grammar across modules is how clinical schemas drift, and drift in a
 * clinical schema is a safety defect rather than a style issue.
 */

import { z } from 'zod';
import { CERTAINTIES, ORIGIN_CLASSES, VERIFICATION_STATES } from '@medikiosk/shared-types';

/** ISO-8601 UTC instant, e.g. `2026-09-15T10:30:00.000Z`. */
export const isoDateTimeSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/,
    'Expected an ISO-8601 UTC instant ending in Z',
  );

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a calendar date in YYYY-MM-DD form');

export const idSchema = z.string().min(1).max(64);

/**
 * Confidence in the range [0, 1]. This expresses how sure we are of our extraction, not a
 * probability of disease. The name is enforced here so a caller cannot present it as one.
 */
export const confidenceSchema = z.number().min(0).max(1);

export const certaintySchema = z.enum(CERTAINTIES);
export const originClassSchema = z.enum(ORIGIN_CLASSES);
export const verificationStateSchema = z.enum(VERIFICATION_STATES);

/**
 * Severity: a fixed ordinal scale plus the patient's own words.
 *
 * Patients do not answer on a numeric scale spontaneously; they say "thoda" or "bahut zyada".
 * Both are retained. The mapped ordinal drives logic; the verbatim wording is what the physician
 * reads. See ADR-005.
 */
export const SEVERITY_SCALE = [
  'NONE',
  'MILD',
  'MODERATE',
  'SEVERE',
  'VERY_SEVERE',
  'UNKNOWN',
] as const;
export type SeverityScale = (typeof SEVERITY_SCALE)[number];

export const severitySchema = z.enum(SEVERITY_SCALE);

export const SEVERITY_LABELS: Record<SeverityScale, string> = {
  NONE: 'None',
  MILD: 'Mild',
  MODERATE: 'Moderate',
  SEVERE: 'Severe',
  VERY_SEVERE: 'Very severe',
  UNKNOWN: 'Not stated',
};

/**
 * Numeric rank used only for ordering and trend comparison, never as a measurement.
 * `UNKNOWN` is null so it can never be compared as if it were a low severity.
 */
export const SEVERITY_ORDINAL: Record<SeverityScale, number | null> = {
  NONE: 0,
  MILD: 1,
  MODERATE: 2,
  SEVERE: 3,
  VERY_SEVERE: 4,
  UNKNOWN: null,
};

/**
 * Temporal pattern of a symptom. `UNKNOWN` is a legitimate value and is never silently coerced
 * to `CONTINUOUS`, because that coercion would change a clinical statement.
 */
export const TEMPORAL_PATTERNS = [
  'CONTINUOUS',
  'INTERMITTENT',
  'EPISODIC',
  'NOCTURNAL',
  'EXERTIONAL',
  'POSTPRANDIAL',
  'UNKNOWN',
] as const;
export type TemporalPattern = (typeof TEMPORAL_PATTERNS)[number];

export const temporalPatternSchema = z.enum(TEMPORAL_PATTERNS);

/**
 * A duration with an explicit unit.
 *
 * Stores both `value`/`unit` (machine-usable) and `verbatim` (what the patient actually said).
 * Storing only the parsed value would destroy the patient's own account, and could hide a
 * misparse from the physician.
 */
export const DURATION_UNITS = [
  'MINUTES',
  'HOURS',
  'DAYS',
  'WEEKS',
  'MONTHS',
  'YEARS',
] as const;
export type DurationUnit = (typeof DURATION_UNITS)[number];

export const durationSchema = z.object({
  value: z.number().nonnegative(),
  unit: z.enum(DURATION_UNITS),
  /** The patient's original wording, e.g. "do din", "since Monday". Never overwritten. */
  verbatim: z.string().max(200).optional(),
  /** True when the patient gave an approximate quantity ("about two days", "thoda time se"). */
  approximate: z.boolean().default(false),
});

export type Duration = z.infer<typeof durationSchema>;

/** Convert a duration to whole and fractional days, for trend and comparison logic. */
export function durationToDays(duration: Duration): number {
  switch (duration.unit) {
    case 'MINUTES':
      return duration.value / 1440;
    case 'HOURS':
      return duration.value / 24;
    case 'DAYS':
      return duration.value;
    case 'WEEKS':
      return duration.value * 7;
    case 'MONTHS':
      return duration.value * 30.4375;
    case 'YEARS':
      return duration.value * 365.25;
  }
}

/**
 * Coarse anatomical vocabulary.
 *
 * Coarse on purpose: it can be extracted reliably from patient speech and from documents,
 * whereas a fine-grained anatomy ontology would be extracted unreliably and would create a false
 * impression of precision in the record.
 */
export const ANATOMICAL_SITES = [
  'HEAD',
  'FACE',
  'EYE',
  'EAR',
  'NOSE',
  'THROAT',
  'NECK',
  'CHEST',
  'LEFT_CHEST',
  'RIGHT_CHEST',
  'UPPER_ABDOMEN',
  'LOWER_ABDOMEN',
  'LEFT_ABDOMEN',
  'RIGHT_ABDOMEN',
  'BACK',
  'UPPER_BACK',
  'LOWER_BACK',
  'PELVIS',
  'PERINEUM',
  'LEFT_ARM',
  'RIGHT_ARM',
  'SHOULDER',
  'LEFT_LEG',
  'RIGHT_LEG',
  'JOINT',
  'SKIN',
  'GENERALISED',
  'UNKNOWN',
] as const;

export type AnatomicalSite = (typeof ANATOMICAL_SITES)[number];
export const anatomicalSiteSchema = z.enum(ANATOMICAL_SITES);

export const LATERALITIES = ['LEFT', 'RIGHT', 'BILATERAL', 'NOT_APPLICABLE'] as const;
export type Laterality = (typeof LATERALITIES)[number];
export const lateralitySchema = z.enum(LATERALITIES);