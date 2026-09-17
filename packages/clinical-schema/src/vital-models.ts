/**
 * Vital sign records.
 *
 * The rule governing this file: a vital is never stored without its unit, its timestamp, its source
 * and its provenance. A bare number on a clinical record is not a measurement, it is a hazard.
 *
 * Blood pressure is stored as one vital concept with two components rather than as two unrelated
 * numbers, because a systolic without its diastolic is not interpretable and storing them separately
 * allows a record to end up holding one and not the other.
 *
 * Clinical thresholds that raise a safety advisory deliberately do NOT live here; they belong to
 * `@medikiosk/safety-rules`, so a hospital can tune them without altering how a measurement is
 * validated or converted. See ADR-009.
 */

import { z } from "zod";
import {
  confidenceSchema,
  idSchema,
  isoDateTimeSchema,
  originClassSchema,
  verificationStateSchema,
} from "./primitives";
import {
  computeBmi,
  convertToCanonical,
  isPlausible,
  type BloodPressureReading,
} from "./ontology/vitals";

export const VITAL_SOURCES = [
  "MANUAL_ENTRY",
  "KIOSK_DEVICE",
  "STAFF_ENTRY",
  "IMPORTED_REPORT",
] as const;

export const VITAL_SOURCE_LABELS: Record<
  (typeof VITAL_SOURCES)[number],
  string
> = {
  MANUAL_ENTRY: "Entered at kiosk",
  KIOSK_DEVICE: "Connected device",
  STAFF_ENTRY: "Entered by staff",
  IMPORTED_REPORT: "Imported from report",
};

/** Component discriminator for multi-component vitals. */
export const VITAL_COMPONENTS = ["SYSTOLIC", "DIASTOLIC"] as const;

export const vitalRecordSchema = z.object({
  id: idSchema,
  patientId: idSchema,
  encounterId: idSchema,
  /** Vital concept code, e.g. `MK-VIT-001`. */
  conceptCode: z.string().min(1).max(64),
  /** Value in the vital's canonical unit. */
  value: z.number(),
  componentCode: z.enum(VITAL_COMPONENTS).optional(),
  unit: z.string().min(1).max(24),
  measuredAt: isoDateTimeSchema,
  source: z.enum(VITAL_SOURCES),
  deviceId: z.string().max(64).optional(),
  /** True when the value fell outside the vital's plausibility bounds. */
  implausible: z.boolean().default(false),
  confidence: confidenceSchema,
  originClass: originClassSchema,
  verificationState: verificationStateSchema,
  evidenceIds: z.array(idSchema).default([]),
  notes: z.string().max(400).optional(),
});

export type VitalRecord = z.infer<typeof vitalRecordSchema>;

/** A vital ready to be persisted, before identity and encounter linkage are attached. */
export type PreparedMeasurement = Omit<
  VitalRecord,
  "id" | "patientId" | "encounterId"
>;

export interface PreparedVital {
  readonly records: readonly PreparedMeasurement[];
  /** Human-readable issues for the UI: an implausible reading, or an unrecognised unit. */
  readonly issues: readonly string[];
}

/**
 * Prepare a vital for storage: convert to the canonical unit, split blood pressure into its two
 * components, and flag implausible values.
 *
 * Refuses to guess. An unrecognised unit produces an issue and no record, because storing an
 * unconverted value would silently misrepresent the measurement. An implausible value *is* stored but
 * flagged, because the fact that a device reported it is itself clinically relevant, and replacing it
 * with something reasonable would conceal a device or transcription fault.
 */
export function prepareVital(input: {
  readonly conceptCode: string;
  readonly value: number | BloodPressureReading;
  readonly unit: string;
  readonly measuredAt: string;
  readonly source: (typeof VITAL_SOURCES)[number];
  readonly deviceId?: string;
  readonly confidence?: number;
  readonly originClass?: VitalRecord["originClass"];
}): PreparedVital {
  const issues: string[] = [];
  const records: PreparedMeasurement[] = [];

  const base = {
    conceptCode: input.conceptCode,
    measuredAt: input.measuredAt,
    source: input.source,
    ...(input.deviceId === undefined ? {} : { deviceId: input.deviceId }),
    confidence: input.confidence ?? 0.95,
    originClass: input.originClass ?? ("PATIENT_REPORTED" as const),
    verificationState: "UNVERIFIED" as const,
    evidenceIds: [] as string[],
  };

  if (input.conceptCode === "MK-VIT-001") {
    if (typeof input.value === "number") {
      issues.push(
        "Blood pressure requires both a systolic and a diastolic value.",
      );
      return { records, issues };
    }
    const { systolic, diastolic } = input.value;
    const systolicOk = isPlausible("MK-VIT-001", systolic);
    const diastolicOk = isPlausible("MK-VIT-001", diastolic);
    records.push(
      {
        ...base,
        componentCode: "SYSTOLIC",
        value: systolic,
        unit: "mmHg",
        implausible: !systolicOk,
      },
      {
        ...base,
        componentCode: "DIASTOLIC",
        value: diastolic,
        unit: "mmHg",
        implausible: !diastolicOk,
      },
    );
    if (!systolicOk || !diastolicOk) {
      issues.push(
        "Blood pressure is outside the plausible range. Confirm the measurement.",
      );
    }
    return { records, issues };
  }

  if (typeof input.value !== "number") {
    issues.push("A numeric value is required for this vital.");
    return { records, issues };
  }

  const converted = convertToCanonical(
    input.conceptCode,
    input.value,
    input.unit,
  );
  if (!converted) {
    issues.push(
      `Unit "${input.unit}" is not recognised for this vital, so the value was not recorded.`,
    );
    return { records, issues };
  }

  const implausible = !isPlausible(input.conceptCode, converted.value);
  if (implausible)
    issues.push(
      "The reading is outside the plausible range. Confirm the measurement.",
    );

  records.push({
    ...base,
    value: Number(converted.value.toFixed(4)),
    unit: converted.unit,
    implausible,
  });

  return { records, issues };
}
