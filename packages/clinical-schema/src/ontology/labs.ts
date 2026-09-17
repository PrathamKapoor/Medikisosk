/**
 * Laboratory test definitions and reference-range policy.
 *
 * A laboratory test is defined by its identity (code, specimen, canonical unit) and by whether a
 * *default* reference range exists.
 *
 * Reference-range precedence, which is enforced where flagging happens:
 *   1. The range printed on the source report is preferred whenever present, because ranges differ
 *      by assay, analyser and population.
 *   2. Otherwise a tenant-configured range is used.
 *   3. Only as a last resort is the MediKiosk default below used, and the resulting flag records
 *      `referenceSource = MEDIKIOSK_DEFAULT` so a clinician can see the provenance of the call.
 *
 * This ordering exists because applying a universal range to a report from a different laboratory
 * is a known source of false "abnormal" flags, and false flags erode clinician trust in the product
 * faster than almost any other defect.
 */

import type { StandardCoding } from "../concept";

export interface LabTestDefinition {
  readonly code: string;
  readonly display: string;
  readonly specimen:
    "BLOOD" | "URINE" | "STOOL" | "SPUTUM" | "SWAB" | "IMAGING" | "OTHER";
  readonly canonicalUnit: string;
  readonly alternativeUnits: readonly {
    readonly unit: string;
    readonly factor: number;
  }[];
  /**
   * Default reference range in the canonical unit. `undefined` means MediKiosk deliberately claims
   * no default for this test, so no flag can be produced without a source range.
   */
  readonly defaultReference?: { readonly low?: number; readonly high?: number };
  /**
   * Values beyond these bounds in the canonical unit are implausible as a real measurement, and are
   * treated as extraction or transcription errors rather than as clinical findings.
   */
  readonly plausibleMin: number;
  readonly plausibleMax: number;
  readonly precision: number;
  /** Aliases for the deterministic extractor, including common Indian report abbreviations. */
  readonly aliases: readonly string[];
  readonly standardCoding?: readonly StandardCoding[];
}

const LOINC = "http://loinc.org";

export const LAB_TEST_DEFINITIONS: readonly LabTestDefinition[] = [
  {
    code: "MK-LAB-001",
    display: "Haemoglobin",
    specimen: "BLOOD",
    canonicalUnit: "g/dL",
    alternativeUnits: [
      { unit: "g/dL", factor: 1 },
      { unit: "g/L", factor: 0.1 },
    ],
    defaultReference: { low: 12, high: 17 },
    plausibleMin: 1,
    plausibleMax: 25,
    precision: 1,
    aliases: ["haemoglobin", "hemoglobin", "hb", "hgb", "हीमोग्लोबिन"],
    standardCoding: [
      {
        system: LOINC,
        code: "718-7",
        display: "Hemoglobin [Mass/volume] in Blood",
      },
    ],
  },
  {
    code: "MK-LAB-002",
    display: "Fasting plasma glucose",
    specimen: "BLOOD",
    canonicalUnit: "mg/dL",
    alternativeUnits: [
      { unit: "mg/dL", factor: 1 },
      { unit: "mmol/L", factor: 18.0182 },
    ],
    defaultReference: { low: 70, high: 100 },
    plausibleMin: 10,
    plausibleMax: 900,
    precision: 0,
    aliases: [
      "fasting glucose",
      "fasting blood sugar",
      "fbs",
      "fpg",
      "उपवास शर्करा",
    ],
    standardCoding: [
      {
        system: LOINC,
        code: "1558-6",
        display: "Fasting glucose [Mass/volume] in Serum or Plasma",
      },
    ],
  },
  {
    code: "MK-LAB-003",
    display: "HbA1c",
    specimen: "BLOOD",
    canonicalUnit: "%",
    alternativeUnits: [{ unit: "%", factor: 1 }],
    defaultReference: { low: 4, high: 5.7 },
    plausibleMin: 2,
    plausibleMax: 20,
    precision: 1,
    aliases: [
      "hba1c",
      "glycated haemoglobin",
      "glycosylated hemoglobin",
      "a1c",
    ],
    standardCoding: [
      {
        system: LOINC,
        code: "4548-4",
        display: "Hemoglobin A1c/Hemoglobin.total in Blood",
      },
    ],
  },
  {
    code: "MK-LAB-004",
    display: "Total cholesterol",
    specimen: "BLOOD",
    canonicalUnit: "mg/dL",
    alternativeUnits: [
      { unit: "mg/dL", factor: 1 },
      { unit: "mmol/L", factor: 38.67 },
    ],
    defaultReference: { high: 200 },
    plausibleMin: 20,
    plausibleMax: 900,
    precision: 0,
    aliases: ["total cholesterol", "cholesterol", "कोलेस्ट्रॉल"],
    standardCoding: [
      {
        system: LOINC,
        code: "2093-3",
        display: "Cholesterol [Mass/volume] in Serum or Plasma",
      },
    ],
  },
  {
    code: "MK-LAB-005",
    display: "Serum creatinine",
    specimen: "BLOOD",
    canonicalUnit: "mg/dL",
    alternativeUnits: [
      { unit: "mg/dL", factor: 1 },
      { unit: "umol/L", factor: 0.0113 },
    ],
    defaultReference: { low: 0.6, high: 1.3 },
    plausibleMin: 0.1,
    plausibleMax: 30,
    precision: 2,
    aliases: ["creatinine", "serum creatinine", "क्रिएटिनिन"],
    standardCoding: [
      {
        system: LOINC,
        code: "2160-0",
        display: "Creatinine [Mass/volume] in Serum or Plasma",
      },
    ],
  },
  {
    code: "MK-LAB-006",
    display: "Sodium",
    specimen: "BLOOD",
    canonicalUnit: "mmol/L",
    alternativeUnits: [
      { unit: "mmol/L", factor: 1 },
      { unit: "mEq/L", factor: 1 },
    ],
    defaultReference: { low: 135, high: 145 },
    plausibleMin: 90,
    plausibleMax: 200,
    precision: 0,
    aliases: ["sodium", "serum sodium", "सोडियम"],
    standardCoding: [
      {
        system: LOINC,
        code: "2951-2",
        display: "Sodium [Moles/volume] in Serum or Plasma",
      },
    ],
  },
  {
    code: "MK-LAB-007",
    display: "Potassium",
    specimen: "BLOOD",
    canonicalUnit: "mmol/L",
    alternativeUnits: [
      { unit: "mmol/L", factor: 1 },
      { unit: "mEq/L", factor: 1 },
    ],
    defaultReference: { low: 3.5, high: 5.1 },
    plausibleMin: 1,
    plausibleMax: 10,
    precision: 1,
    aliases: ["potassium", "serum potassium", "पोटैशियम"],
    standardCoding: [
      {
        system: LOINC,
        code: "2823-3",
        display: "Potassium [Moles/volume] in Serum or Plasma",
      },
    ],
  },
  {
    code: "MK-LAB-008",
    display: "Total leucocyte count",
    specimen: "BLOOD",
    canonicalUnit: "10^3/uL",
    alternativeUnits: [
      { unit: "10^3/uL", factor: 1 },
      { unit: "/uL", factor: 0.001 },
    ],
    defaultReference: { low: 4, high: 11 },
    plausibleMin: 0.1,
    plausibleMax: 200,
    precision: 1,
    aliases: [
      "total leucocyte count",
      "total leukocyte count",
      "tlc",
      "wbc",
      "श्वेत रक्त कोशिका",
    ],
    standardCoding: [
      {
        system: LOINC,
        code: "6690-2",
        display: "Leukocytes [#/volume] in Blood",
      },
    ],
  },
  {
    code: "MK-LAB-009",
    display: "Platelet count",
    specimen: "BLOOD",
    canonicalUnit: "10^3/uL",
    alternativeUnits: [
      { unit: "10^3/uL", factor: 1 },
      { unit: "/uL", factor: 0.001 },
    ],
    defaultReference: { low: 150, high: 450 },
    plausibleMin: 1,
    plausibleMax: 2000,
    precision: 0,
    aliases: ["platelet count", "platelets", "बिंबाणु"],
    standardCoding: [
      {
        system: LOINC,
        code: "777-3",
        display: "Platelets [#/volume] in Blood",
      },
    ],
  },
  {
    code: "MK-LAB-010",
    display: "Serum TSH",
    specimen: "BLOOD",
    canonicalUnit: "mIU/L",
    alternativeUnits: [
      { unit: "mIU/L", factor: 1 },
      { unit: "uIU/mL", factor: 1 },
    ],
    defaultReference: { low: 0.4, high: 4.0 },
    plausibleMin: 0.001,
    plausibleMax: 500,
    precision: 2,
    aliases: ["tsh", "thyroid stimulating hormone", "थायरॉइड"],
    standardCoding: [
      {
        system: LOINC,
        code: "3016-3",
        display: "Thyrotropin [Units/volume] in Serum or Plasma",
      },
    ],
  },
  {
    code: "MK-LAB-011",
    display: "C-reactive protein",
    specimen: "BLOOD",
    canonicalUnit: "mg/L",
    alternativeUnits: [
      { unit: "mg/L", factor: 1 },
      { unit: "mg/dL", factor: 10 },
    ],
    defaultReference: { high: 5 },
    plausibleMin: 0,
    plausibleMax: 600,
    precision: 1,
    aliases: ["crp", "c reactive protein", "c-reactive protein"],
    standardCoding: [
      {
        system: LOINC,
        code: "1988-5",
        display: "C reactive protein [Mass/volume] in Serum or Plasma",
      },
    ],
  },
];

export const LAB_TEST_BY_CODE: ReadonlyMap<string, LabTestDefinition> = new Map(
  LAB_TEST_DEFINITIONS.map((test) => [test.code, test]),
);

export function labTestDefinition(code: string): LabTestDefinition | undefined {
  return LAB_TEST_BY_CODE.get(code);
}

/**
 * Convert a reported value into the test's canonical unit.
 *
 * Returns undefined for an unknown unit rather than assuming the canonical unit, because silently
 * misinterpreting `g/L` as `g/dL` produces a tenfold error in a reported haemoglobin.
 */
export function convertLabToCanonical(
  labCode: string,
  value: number,
  fromUnit: string,
): { readonly value: number; readonly unit: string } | undefined {
  const definition = LAB_TEST_BY_CODE.get(labCode);
  if (!definition) return undefined;
  const conversion = definition.alternativeUnits.find(
    (candidate) =>
      candidate.unit.toLowerCase() === fromUnit.trim().toLowerCase(),
  );
  if (!conversion) return undefined;
  return { value: value * conversion.factor, unit: definition.canonicalUnit };
}

export function isPlausibleLabValue(
  labCode: string,
  canonicalValue: number,
): boolean {
  const definition = LAB_TEST_BY_CODE.get(labCode);
  if (!definition) return false;
  return (
    canonicalValue >= definition.plausibleMin &&
    canonicalValue <= definition.plausibleMax
  );
}
