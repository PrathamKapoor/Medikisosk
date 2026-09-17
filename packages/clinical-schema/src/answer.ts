/**
 * A normalised patient answer.
 *
 * `rawAnswer` is mandatory and immutable. Every normalisation is additive, never destructive:
 * when a patient says "kal se", the physician sees both "kal se" and a resolved date. Destroying
 * the raw answer would make a misparse undetectable and would remove the patient's own account
 * from the record. See ADR-005 and ADR-008.
 */

import { z } from "zod";
import {
  confidenceSchema,
  durationSchema,
  isoDateSchema,
  severitySchema,
} from "./primitives";

export const normalisedAnswerSchema = z.object({
  /** The patient's own words or the option they selected. Never overwritten or rewritten. */
  rawAnswer: z.string().max(4000),
  /** Canonical concept codes recognised in the answer, e.g. `MK-SYM-001`. */
  conceptCodes: z.array(z.string().max(64)).default([]),
  duration: durationSchema.optional(),
  severity: severitySchema.optional(),
  /** ISO date when a resolvable date reference was found ("yesterday", "since Monday"). */
  resolvedOnsetDate: isoDateSchema.optional(),
  /** Verbatim quantity wording, e.g. "do din", preserved for display beside the parsed value. */
  quantityVerbatim: z.string().max(200).optional(),
  confidence: confidenceSchema,
  /** Language the raw answer was given in (BCP-47), e.g. `hi-IN`. */
  language: z.string().min(2).max(16),
  /** True when the answer mixed languages ("mere chest mein kal se pain hai"). */
  codeMixed: z.boolean().default(false),
  /**
   * True when the normaliser recognised a negation ("no fever", "bukhar nahi hai").
   * A negation is a real clinical finding and must not be stored as an absent value.
   */
  negated: z.boolean().default(false),
  /** True when the patient expressed uncertainty ("I think", "maybe", "pata nahi"). */
  uncertain: z.boolean().default(false),
});

export type NormalisedAnswer = z.infer<typeof normalisedAnswerSchema>;

/**
 * A structured quantity as reported by a patient or read from a document.
 *
 * Never stored without its unit. A bare number in a clinical record is meaningless and dangerous:
 * "temp 102" could be Fahrenheit or Celsius, and those are very different patients.
 */
export const quantitySchema = z.object({
  value: z.number(),
  unit: z.string().min(1).max(24),
  /** Reference range *as stated by the source*, when the source provided one. */
  referenceLow: z.number().optional(),
  referenceHigh: z.number().optional(),
  referenceText: z.string().max(120).optional(),
  /**
   * Where the reference range came from. Stored because MediKiosk prefers the reporting
   * laboratory's own range over a universal table: ranges differ by assay and by population.
   */
  referenceSource: z
    .enum([
      "SOURCE_DOCUMENT",
      "TENANT_CONFIGURED",
      "MEDIKIOSK_DEFAULT",
      "NOT_AVAILABLE",
    ])
    .default("NOT_AVAILABLE"),
});

export type Quantity = z.infer<typeof quantitySchema>;

/** Deterministic interpretation of a quantity against its reference range. */
export const LAB_FLAGS = [
  "NORMAL",
  "HIGH",
  "LOW",
  "CRITICAL_HIGH",
  "CRITICAL_LOW",
  "UNKNOWN",
] as const;
export type LabFlag = (typeof LAB_FLAGS)[number];

export const LAB_FLAG_LABELS: Record<LabFlag, string> = {
  NORMAL: "Normal",
  HIGH: "Above range",
  LOW: "Below range",
  CRITICAL_HIGH: "Critically high",
  CRITICAL_LOW: "Critically low",
  UNKNOWN: "No reference range available",
};
