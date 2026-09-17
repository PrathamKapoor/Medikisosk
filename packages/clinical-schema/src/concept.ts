/**
 * Clinical concept ontology.
 *
 * MediKiosk needs a stable internal vocabulary. Two decisions drive the shape of this file:
 *
 * 1. **Local codes are used where no real standard code exists.** Inventing a LOINC or SNOMED code
 *    that merely looks plausible is worse than being honest, because a downstream system would
 *    trust it. Real codings are recorded in `standardCoding` only when genuinely known.
 *
 * 2. **Synonyms carry Indian-language forms, including transliterated and code-mixed ones.**
 *    Patients say "seene mein dard", "saans phoolna", "bukhar", "chakkar". A matcher that
 *    understands only English clinical vocabulary cannot serve the patients this product exists
 *    for. These synonyms are curated clinical content, not machine translation, because a
 *    mistranslated symptom term is a clinical error rather than a cosmetic one.
 */

import { z } from "zod";

export const CONCEPT_CATEGORIES = [
  "SYMPTOM",
  "VITAL",
  "LAB_TEST",
  "MEDICATION",
  "ALLERGY",
  "CONDITION",
  "PROCEDURE",
  "HISTORY_FACT",
  "AYUSH",
] as const;

export type ConceptCategory = (typeof CONCEPT_CATEGORIES)[number];

export const BODY_SYSTEMS = [
  "CARDIOVASCULAR",
  "RESPIRATORY",
  "GASTROINTESTINAL",
  "NEUROLOGICAL",
  "MUSCULOSKELETAL",
  "GENITOURINARY",
  "ENDOCRINE",
  "DERMATOLOGICAL",
  "PSYCHIATRIC",
  "HAEMATOLOGICAL",
  "OPHTHALMIC",
  "ENT",
  "GENERAL",
] as const;

export type BodySystem = (typeof BODY_SYSTEMS)[number];

/** A real coding from an external terminology, recorded only when genuinely known. */
export const standardCodingSchema = z.object({
  /** e.g. `http://loinc.org`, `http://snomed.info/sct`, `http://hl7.org/fhir/sid/icd-10` */
  system: z.string().url(),
  code: z.string().min(1).max(32),
  display: z.string().max(200),
});

export type StandardCoding = z.infer<typeof standardCodingSchema>;

/**
 * A canonical clinical concept.
 *
 * `synonyms` is intentionally a flat list rather than a per-language map, because patients
 * code-mix ("seene mein chest pain"), so matching must consider all languages simultaneously
 * rather than requiring a language to be chosen first. The language of a matched synonym is still
 * recorded on the evidence, so the provenance of the match is not lost.
 */
export const clinicalConceptSchema = z.object({
  /** Local, stable, human-readable code, e.g. `MK-SYM-001`. Never renumbered once published. */
  code: z.string().min(1).max(64),
  category: z.enum(CONCEPT_CATEGORIES),
  /** English display name. The UI shows a localised label resolved by the i18n layer. */
  display: z.string().min(1).max(200),
  bodySystem: z.enum(BODY_SYSTEMS).optional(),
  synonyms: z.array(z.string().min(1).max(120)).default([]),
  standardCoding: z.array(standardCodingSchema).default([]),
  /** Pathway keys this concept activates. */
  pathways: z.array(z.string().max(64)).default([]),
  /**
   * True when the concept participates in any deterministic red-flag rule. Lets the safety
   * coverage report answer "is anything watching for this?".
   */
  redFlagRelevant: z.boolean().default(false),
  /**
   * True when a positive answer about this concept may indicate an emergency needing immediate
   * human attention. Used only to prioritise questions earlier, never to set the triage level.
   */
  potentiallyEmergent: z.boolean().default(false),
  notes: z.string().max(500).optional(),
});

export type ClinicalConcept = z.infer<typeof clinicalConceptSchema>;

/** A synonym match produced by the concept matcher. */
export interface ConceptMatch {
  readonly concept: ClinicalConcept;
  /** The synonym text that matched, exactly as it appeared in the input. */
  readonly matchedText: string;
  /** Character span in the folded input, for evidence highlighting. */
  readonly start: number;
  readonly end: number;
  /** True when the match came from a non-Latin-script synonym. */
  readonly indicativeOfLanguageSwitch: boolean;
  /** 0..1 specificity proxy. Longer, more specific matches score higher. Not a probability. */
  readonly score: number;
}

/**
 * Fold text for matching: lower-case, collapse whitespace, strip combining marks and punctuation.
 *
 * Stripping combining marks makes Devanagari and Latin transliterations comparable, which is what
 * allows "saans" and "साँस" to reach the same concept.
 */
export function foldForMatching(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the string contains characters from a major Indic script. */
export function containsNonLatinScript(input: string): boolean {
  return /\p{Script=Devanagari}|\p{Script=Bengali}|\p{Script=Gurmukhi}|\p{Script=Gujarati}|\p{Script=Oriya}|\p{Script=Tamil}|\p{Script=Telugu}|\p{Script=Kannada}/u.test(
    input,
  );
}
