/**
 * Laboratory records: reference-range precedence, deterministic flagging, trends.
 *
 * Reference-range precedence is the most important behaviour in this file, and it is deliberately
 * ordered:
 *
 *   1. The range printed on the source report.
 *   2. A range configured for this hospital or laboratory.
 *   3. A MediKiosk default, and the flag records that the default was used.
 *
 * The order exists because a universal range applied to a report from a different laboratory is a
 * known source of false "abnormal" flags, and false flags destroy clinician trust faster than almost
 * any other defect. The source of the range that produced a flag is stored on the flag, so a clinician
 * can always see whether "high" was the laboratory's judgement or ours.
 *
 * Flagging is deterministic and never model-driven (ADR-009): a laboratory value can directly influence
 * triage, so it must be reproducible and auditable.
 */

import { z } from "zod";
import { quantitySchema, type LabFlag } from "./answer";
import {
  idSchema,
  isoDateTimeSchema,
  confidenceSchema,
  originClassSchema,
  verificationStateSchema,
} from "./primitives";
import {
  convertLabToCanonical,
  isPlausibleLabValue,
  labTestDefinition,
} from "./ontology/labs";

export type ReferenceSource =
  | "SOURCE_DOCUMENT"
  | "TENANT_CONFIGURED"
  | "MEDIKIOSK_DEFAULT"
  | "NOT_AVAILABLE";

export interface FlagResult {
  readonly flag: LabFlag;
  readonly referenceSource: ReferenceSource;
  /** Names the range that was applied and where it came from, so the judgement is inspectable. */
  readonly explanation: string;
}

export const LAB_FLAG_VALUES = [
  "NORMAL",
  "HIGH",
  "LOW",
  "CRITICAL_HIGH",
  "CRITICAL_LOW",
  "UNKNOWN",
] as const;

export const labResultSchema = z.object({
  id: idSchema,
  patientId: idSchema,
  encounterId: idSchema,
  /** Laboratory test concept code, e.g. `MK-LAB-001`. */
  testCode: z.string().min(1).max(64),
  /** Value, unit, and the reference range exactly as the source stated it. */
  quantity: quantitySchema,
  flag: z.enum(LAB_FLAG_VALUES),
  /** True when the value is outside the test's plausibility bounds, i.e. likely a data error. */
  implausible: z.boolean().default(false),
  collectedAt: isoDateTimeSchema,
  reportedAt: isoDateTimeSchema,
  /** Source document, when the result came from an upload rather than manual entry. */
  documentId: idSchema.optional(),
  /** Interpretation printed on the report, retained verbatim for the physician. */
  sourceComment: z.string().max(1000).optional(),
  confidence: confidenceSchema,
  originClass: originClassSchema,
  verificationState: verificationStateSchema,
  evidenceIds: z.array(idSchema).default([]),
});

export type LabResult = z.infer<typeof labResultSchema>;

/**
 * Critical thresholds per test code.
 *
 * Used only to distinguish CRITICAL from an ordinary HIGH or LOW. These are a curated starter set,
 * tenant-overridable, and require clinical review before clinical reliance (debt TD-06).
 */
export const CRITICAL_LAB_THRESHOLDS: Readonly<
  Record<
    string,
    { readonly criticalLow?: number; readonly criticalHigh?: number }
  >
> = {
  "MK-LAB-001": { criticalLow: 7, criticalHigh: 20 },
  "MK-LAB-002": { criticalLow: 50, criticalHigh: 400 },
  "MK-LAB-005": { criticalHigh: 4 },
  "MK-LAB-006": { criticalLow: 120, criticalHigh: 160 },
  "MK-LAB-007": { criticalLow: 2.5, criticalHigh: 6.5 },
  "MK-LAB-009": { criticalLow: 50, criticalHigh: 1000 },
};

/**
 * Interpret a laboratory value.
 *
 * Never flags without a reference range. When none is available the flag is `UNKNOWN` and the
 * explanation says so, rather than defaulting to `NORMAL`. Reporting a value as normal when nobody
 * established a range for it is a clinical claim the system has no basis for making.
 */
export function flagLabResult(input: {
  readonly testCode: string;
  readonly value: number;
  readonly unit: string;
  readonly sourceLow?: number;
  readonly sourceHigh?: number;
  readonly tenantLow?: number;
  readonly tenantHigh?: number;
}): FlagResult {
  const definition = labTestDefinition(input.testCode);

  let low = input.sourceLow;
  let high = input.sourceHigh;
  let referenceSource: ReferenceSource =
    low !== undefined || high !== undefined
      ? "SOURCE_DOCUMENT"
      : "NOT_AVAILABLE";

  if (low === undefined && high === undefined) {
    if (input.tenantLow !== undefined || input.tenantHigh !== undefined) {
      low = input.tenantLow;
      high = input.tenantHigh;
      referenceSource = "TENANT_CONFIGURED";
    } else if (definition?.defaultReference) {
      low = definition.defaultReference.low;
      high = definition.defaultReference.high;
      referenceSource = "MEDIKIOSK_DEFAULT";
    }
  }

  if (low === undefined && high === undefined) {
    return {
      flag: "UNKNOWN",
      referenceSource: "NOT_AVAILABLE",
      explanation:
        "No reference range was available for this test, so no interpretation is offered. The value is recorded as reported.",
    };
  }

  const criticals = CRITICAL_LAB_THRESHOLDS[input.testCode];
  let flag: LabFlag = "NORMAL";

  if (high !== undefined && input.value > high) {
    flag =
      criticals?.criticalHigh !== undefined &&
      input.value >= criticals.criticalHigh
        ? "CRITICAL_HIGH"
        : "HIGH";
  } else if (low !== undefined && input.value < low) {
    flag =
      criticals?.criticalLow !== undefined &&
      input.value <= criticals.criticalLow
        ? "CRITICAL_LOW"
        : "LOW";
  }

  const sourceText =
    referenceSource === "SOURCE_DOCUMENT"
      ? "the range printed on the report"
      : referenceSource === "TENANT_CONFIGURED"
        ? "the range configured for this facility"
        : "the MediKiosk default range, which has not been validated against this laboratory";

  return {
    flag,
    referenceSource,
    explanation: `Value ${input.value} ${input.unit} interpreted against ${low ?? "—"} to ${high ?? "—"} ${input.unit} from ${sourceText}.`,
  };
}

/**
 * True when a flag requires a physician to look before the record is treated as settled.
 *
 * `UNKNOWN` is included deliberately: an uninterpretable value in a patient with relevant symptoms is
 * exactly the case a clinician should see, and treating it as benign would be the wrong default.
 */
export function flagNeedsAttention(flag: LabFlag): boolean {
  return flag !== "NORMAL";
}

/** A change between two results for the same test. */
export interface LabTrend {
  readonly testCode: string;
  readonly previous: {
    readonly value: number;
    readonly unit: string;
    readonly at: string;
  };
  readonly current: {
    readonly value: number;
    readonly unit: string;
    readonly at: string;
  };
  readonly delta: number;
  readonly direction: "INCREASED" | "DECREASED" | "UNCHANGED";
  /** Percentage change. Undefined when the previous value was zero, never Infinity. */
  readonly percentChange?: number;
  /** True when the change is large enough to be worth a physician's attention. */
  readonly notable: boolean;
}

/**
 * Compare two results for the same test.
 *
 * `notable` uses a relative threshold, because a 5 unit change means something entirely different for
 * haemoglobin than for a platelet count. It is a display aid for the "what changed" view and is never
 * itself a clinical conclusion.
 */
export function compareLabResults(
  previous: {
    readonly value: number;
    readonly unit: string;
    readonly at: string;
  },
  current: {
    readonly value: number;
    readonly unit: string;
    readonly at: string;
  },
  testCode: string,
  notableThreshold = 0.15,
): LabTrend {
  const delta = current.value - previous.value;
  const percentChange =
    previous.value === 0
      ? undefined
      : Number(((delta / Math.abs(previous.value)) * 100).toFixed(1));
  const direction: LabTrend["direction"] =
    delta === 0 ? "UNCHANGED" : delta > 0 ? "INCREASED" : "DECREASED";

  const notable =
    direction !== "UNCHANGED" &&
    percentChange !== undefined &&
    Math.abs(percentChange) >= notableThreshold * 100;

  const base: LabTrend = {
    testCode,
    previous,
    current,
    delta,
    direction,
    notable,
  };
  return percentChange === undefined ? base : { ...base, percentChange };
}

/** A laboratory result ready to be persisted, before identity linkage is attached. */
export type PreparedLabResult = Pick<
  LabResult,
  "testCode" | "quantity" | "flag" | "implausible"
>;

/**
 * Prepare a laboratory result for storage, converting to the canonical unit where possible.
 *
 * Returns an issue instead of a record when the unit is unknown, because a value in an unrecognised
 * unit cannot be compared, trended or flagged, and storing it would create a false impression that it
 * had been interpreted. An implausible value IS stored but flagged, because the fact that a report
 * produced it is itself clinically relevant.
 */
export function prepareLabResult(input: {
  readonly testCode: string;
  readonly value: number;
  readonly unit: string;
  readonly sourceLow?: number;
  readonly sourceHigh?: number;
}): {
  readonly prepared?: PreparedLabResult;
  readonly issues: readonly string[];
} {
  const issues: string[] = [];
  const definition = labTestDefinition(input.testCode);

  if (!definition) {
    return { issues: [`Unknown laboratory test code: ${input.testCode}`] };
  }

  const converted = convertLabToCanonical(
    input.testCode,
    input.value,
    input.unit,
  );
  if (!converted) {
    return {
      issues: [
        `Unit "${input.unit}" is not recognised for ${definition.display}, so the result was not recorded.`,
      ],
    };
  }

  const implausible = !isPlausibleLabValue(input.testCode, converted.value);
  if (implausible) {
    issues.push(
      `${definition.display} value ${converted.value} ${converted.unit} is outside the plausible range and may be a transcription error. Confirm against the source report.`,
    );
  }

  const flagResult = flagLabResult({
    testCode: input.testCode,
    value: converted.value,
    unit: converted.unit,
    ...(input.sourceLow === undefined ? {} : { sourceLow: input.sourceLow }),
    ...(input.sourceHigh === undefined ? {} : { sourceHigh: input.sourceHigh }),
  });
  issues.push(flagResult.explanation);

  return {
    prepared: {
      testCode: input.testCode,
      quantity: {
        value: converted.value,
        unit: converted.unit,
        ...(input.sourceLow === undefined
          ? {}
          : { referenceLow: input.sourceLow }),
        ...(input.sourceHigh === undefined
          ? {}
          : { referenceHigh: input.sourceHigh }),
        referenceSource: flagResult.referenceSource,
      },
      flag: flagResult.flag,
      implausible,
    },
    issues,
  };
}
