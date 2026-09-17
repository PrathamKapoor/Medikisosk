/**
 * Therapy records: medications and allergies.
 *
 * Two safety-critical properties live here.
 *
 * First, MediKiosk performs **no autonomous prescribing and no autonomous dose calculation**. It
 * records, reconciles and displays what a clinician or a document already stated. Any cross-reactivity
 * finding is surfaced as a warning for human review and never as an automatic change.
 *
 * Second, "no known allergies" and "the patient was never asked" are different clinical facts. A
 * medication decision made on the assumption that a patient with an UNKNOWN allergy status is safe is a
 * documented cause of harm, so `safeToAssumeNoAllergy` is true for exactly one status value and for
 * nothing else.
 */

import { z } from "zod";
import {
  type OriginClass,
  type VerificationState,
  type Confidence,
} from "@medikiosk/shared-types";
import {
  confidenceSchema,
  idSchema,
  isoDateSchema,
  originClassSchema,
  verificationStateSchema,
} from "./primitives";
import type { LabFlag } from "./answer";
import {
  ALLERGY_CATEGORIES,
  ALLERGY_STATUSES,
  REACTION_SEVERITIES,
  CROSS_REACTIVITY_NOTES,
  type AllergyCategory,
  type AllergyStatus,
  type ReactionSeverity,
} from "./ontology/allergies";

export const MEDICATION_STATUSES = [
  "CURRENT",
  "STOPPED",
  "COMPLETED",
  "UNKNOWN",
] as const;
export type MedicationStatus = (typeof MEDICATION_STATUSES)[number];

export const MEDICATION_STATUS_LABELS: Record<MedicationStatus, string> = {
  CURRENT: "Currently taking",
  STOPPED: "Stopped",
  COMPLETED: "Course completed",
  UNKNOWN: "Status not established",
};

export const MEDICATION_ROUTES = [
  "ORAL",
  "SUBLINGUAL",
  "INHALED",
  "TOPICAL",
  "INJECTION_IM",
  "INJECTION_IV",
  "INJECTION_SC",
  "RECTAL",
  "NASAL",
  "OPHTHALMIC",
  "UNKNOWN",
] as const;

export const MEDICATION_FREQUENCIES = [
  "OD",
  "BD",
  "TDS",
  "QID",
  "HS",
  "SOS",
  "WEEKLY",
  "ALTERNATE_DAY",
  "UNKNOWN",
] as const;

export type MedicationFrequency = (typeof MEDICATION_FREQUENCIES)[number];

export const MEDICATION_FREQUENCY_LABELS: Record<MedicationFrequency, string> =
  {
    OD: "Once daily",
    BD: "Twice daily",
    TDS: "Three times daily",
    QID: "Four times daily",
    HS: "At night",
    SOS: "As needed",
    WEEKLY: "Weekly",
    ALTERNATE_DAY: "Alternate day",
    UNKNOWN: "Frequency not stated",
  };

export const medicationRecordSchema = z.object({
  id: idSchema,
  patientId: idSchema,
  encounterId: idSchema,
  /** Generic ingredient concept code, e.g. `MK-MED-001`. Reconciliation operates on ingredients. */
  conceptCode: z.string().min(1).max(64),
  /** The name exactly as written on the prescription or stated by the patient. Never rewritten. */
  asWrittenName: z.string().min(1).max(200),
  strengthValue: z.number().optional(),
  strengthUnit: z.string().max(16).optional(),
  doseValue: z.number().optional(),
  doseUnit: z.string().max(16).optional(),
  frequency: z.enum(MEDICATION_FREQUENCIES).default("UNKNOWN"),
  route: z.enum(MEDICATION_ROUTES).default("UNKNOWN"),
  durationDays: z.number().int().nonnegative().optional(),
  status: z.enum(MEDICATION_STATUSES).default("CURRENT"),
  startedOn: isoDateSchema.optional(),
  stoppedOn: isoDateSchema.optional(),
  /** True when a clinician or document prescribed it, as opposed to the patient self-reporting it. */
  isPrescribed: z.boolean().default(false),
  documentId: idSchema.optional(),
  confidence: confidenceSchema,
  originClass: originClassSchema,
  verificationState: verificationStateSchema,
  evidenceIds: z.array(idSchema).default([]),
  notes: z.string().max(400).optional(),
});

export type MedicationRecord = z.infer<typeof medicationRecordSchema>;

export interface MedicationConflict {
  readonly conceptCode: string;
  readonly reason: string;
}

export interface MedicationReconciliation {
  readonly continued: readonly string[];
  readonly onlyInPrevious: readonly string[];
  readonly newInCurrent: readonly string[];
  readonly stopped: readonly string[];
  readonly conflicts: readonly MedicationConflict[];
}

/**
 * Reconcile two medication lists, keying on the generic ingredient concept code.
 *
 * Keying on ingredients rather than brand names matters: a patient may bring a prescription for one
 * brand while taking another formulation of the same ingredient, and brand-name comparison would
 * report both a "new" medication and a "stopped" one for what is actually the same drug.
 *
 * Cross-reactivity findings are warnings for human review. MediKiosk never changes a prescription, so
 * this function returns information and the clinician decides what to do with it.
 */
export function reconcileMedications(
  previous: readonly MedicationRecord[],
  current: readonly MedicationRecord[],
  allergyCodes: readonly string[] = [],
): MedicationReconciliation {
  const previousByCode = new Map(
    previous.map((medication) => [medication.conceptCode, medication]),
  );
  const currentByCode = new Map(
    current.map((medication) => [medication.conceptCode, medication]),
  );

  const continued: string[] = [];
  const newInCurrent: string[] = [];
  const stopped: string[] = [];

  for (const code of currentByCode.keys()) {
    if (previousByCode.has(code)) continued.push(code);
    else newInCurrent.push(code);
  }
  for (const code of previousByCode.keys()) {
    if (!currentByCode.has(code)) stopped.push(code);
  }

  const conflicts: MedicationConflict[] = [];
  for (const note of CROSS_REACTIVITY_NOTES) {
    if (!allergyCodes.includes(note.allergenCode)) continue;
    for (const medicationCode of note.relatedMedicationCodes) {
      const inCurrent = currentByCode.has(medicationCode);
      const inPrevious = previousByCode.has(medicationCode);
      if (inCurrent || inPrevious) {
        conflicts.push({ conceptCode: medicationCode, reason: note.note });
      }
    }
  }

  return {
    continued,
    onlyInPrevious: stopped,
    newInCurrent,
    stopped,
    conflicts,
  };
}

// ---------------------------------------------------------------------------
// Allergies
// ---------------------------------------------------------------------------

export const allergyRecordSchema = z.object({
  id: idSchema,
  patientId: idSchema,
  encounterId: idSchema,
  /**
   * Undefined when the patient reports no known allergy or was not asked, because in both of those
   * cases there is no allergen to record and inventing one would be a fabrication.
   */
  conceptCode: z.string().min(1).max(64).optional(),
  /** The allergen in the patient's own words when the vocabulary has no matching concept. */
  freeTextName: z.string().max(200).optional(),
  category: z.enum(ALLERGY_CATEGORIES).optional(),
  reactionText: z.string().max(500).optional(),
  severity: z.enum(REACTION_SEVERITIES).default("UNKNOWN"),
  onsetDate: isoDateSchema.optional(),
  confidence: confidenceSchema,
  originClass: originClassSchema,
  verificationState: verificationStateSchema,
  evidenceIds: z.array(idSchema).default([]),
  recordedByRole: z.string().max(24).optional(),
  notes: z.string().max(400).optional(),
});

export type AllergyRecord = z.infer<typeof allergyRecordSchema>;

export const allergyStatusSchema = z.enum(ALLERGY_STATUSES);
export type { AllergyStatus, AllergyCategory, ReactionSeverity };

export interface AllergySummary {
  readonly status: AllergyStatus;
  readonly allergies: readonly AllergyRecord[];
  /**
   * True only when the patient explicitly and positively reported no known allergies. Every other
   * state — including "not asked" — must be treated as an unknown allergy status.
   */
  readonly safeToAssumeNoAllergy: boolean;
  /** Explanation for the physician and for the medication reconciliation warning. */
  readonly explanation: string;
}

/**
 * Summarise allergy knowledge for a patient.
 *
 * The critical rule is encoded in `safeToAssumeNoAllergy`. For `NOT_ASKED` the explanation states
 * explicitly that allergy status is unknown and must not be treated as "no allergies". This is the
 * documented cause of medication error that this function exists to prevent: a clinician reading a
 * blank allergy field should see "unknown", not silence.
 */
export function summariseAllergies(
  status: AllergyStatus,
  allergies: readonly AllergyRecord[],
): AllergySummary {
  const safeToAssumeNoAllergy = status === "CONFIRMED_NO_KNOWN_ALLERGIES";

  const explanations: Record<AllergyStatus, string> = {
    NOT_ASKED:
      'Allergy status is UNKNOWN because the patient was not asked. This must not be treated as "no known allergies". Ask before prescribing.',
    CONFIRMED_NO_KNOWN_ALLERGIES:
      "Patient explicitly reports no known allergies. Recorded as a positive statement with evidence.",
    HAS_ALLERGIES: `${allergies.length} allergy record(s) recorded. Review against any planned prescription.`,
    PATIENT_UNSURE:
      "Patient is unsure about allergies. Treat allergy status as unknown until clarified.",
    PATIENT_DECLINED:
      'Patient declined to discuss allergies. Treat allergy status as unknown; do not infer "no allergies".',
  };

  return {
    status,
    allergies,
    safeToAssumeNoAllergy,
    explanation: explanations[status],
  };
}

/**
 * Allergens relevant to a proposed medication, for cross-reactivity review.
 *
 * Returns the warning notes that apply, or an empty list. This is used by the contradiction engine to
 * place a visible warning beside the medication, and it is always a prompt for human review.
 */
export function allergenWarningsForMedication(
  medicationConceptCode: string,
  allergies: readonly AllergyRecord[],
): readonly string[] {
  const recordedAllergenCodes = allergies
    .map((allergy) => allergy.conceptCode)
    .filter((code): code is string => code !== undefined);

  const warnings: string[] = [];
  for (const note of CROSS_REACTIVITY_NOTES) {
    if (!note.relatedMedicationCodes.includes(medicationConceptCode)) continue;
    if (!recordedAllergenCodes.includes(note.allergenCode)) continue;
    warnings.push(note.note);
  }
  return warnings;
}

/** Fields a caller must supply to persist a medication, before identity linkage is attached. */
export type PreparedMedication = Omit<
  MedicationRecord,
  | "id"
  | "patientId"
  | "encounterId"
  | "confidence"
  | "originClass"
  | "verificationState"
  | "evidenceIds"
> & {
  readonly verificationState: VerificationState;
};

/** Convenience constructor for a medication parsed from a document or a patient statement. */
export function makeMedication(
  input: {
    readonly conceptCode: string;
    readonly asWrittenName: string;
    readonly frequency?: MedicationFrequency;
    readonly doseValue?: number;
    readonly doseUnit?: string;
    readonly strengthValue?: number;
    readonly strengthUnit?: string;
    readonly route?: MedicationRecord["route"];
    readonly status?: MedicationStatus;
    readonly isPrescribed?: boolean;
    readonly documentId?: string;
    readonly notes?: string;
  },
  provenance: {
    readonly originClass: OriginClass;
    readonly confidence: Confidence;
  },
): PreparedMedication {
  return {
    conceptCode: input.conceptCode,
    asWrittenName: input.asWrittenName,
    ...(input.doseValue === undefined ? {} : { doseValue: input.doseValue }),
    ...(input.doseUnit === undefined ? {} : { doseUnit: input.doseUnit }),
    ...(input.strengthValue === undefined
      ? {}
      : { strengthValue: input.strengthValue }),
    ...(input.strengthUnit === undefined
      ? {}
      : { strengthUnit: input.strengthUnit }),
    frequency: input.frequency ?? "UNKNOWN",
    route: input.route ?? "UNKNOWN",
    status: input.status ?? "CURRENT",
    isPrescribed: input.isPrescribed ?? false,
    ...(input.documentId === undefined ? {} : { documentId: input.documentId }),
    ...(input.notes === undefined ? {} : { notes: input.notes }),
    verificationState: "UNVERIFIED" as VerificationState,
  };
}
