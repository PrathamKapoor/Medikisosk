/**
 * Vital signs — identity, units and plausibility.
 *
 * Two responsibilities live here: defining what a vital *is* (code, canonical unit, permissible
 * alternative units, and the range outside which a reading is implausible), and the unit
 * arithmetic. The definitions themselves are appended below.
 *
 * What deliberately does NOT live here: clinical thresholds that raise a safety advisory. Those
 * belong to `@medikiosk/safety-rules`, because "systolic below 90 is an amber flag" is a policy a
 * hospital may need to tune without altering how a measurement is validated or converted. Keeping
 * measurement facts and clinical policy apart also means the safety rule set can be versioned and
 * clinically reviewed on its own.
 */

export interface UnitConversion {
  /** Unit as it may be entered or reported, e.g. `mmol/L`. */
  readonly unit: string;
  /** Multiply by this factor to reach the canonical unit. */
  readonly factor: number;
  /** Offset added after the factor, for affine conversions such as Fahrenheit to Celsius. */
  readonly offset?: number;
}

export interface VitalDefinition {
  readonly code: string;
  readonly display: string;
  /** Canonical unit. Volumes are stored in this; display conversion happens in the UI. */
  readonly canonicalUnit: string;
  readonly alternativeUnits: readonly UnitConversion[];
  /**
   * Plausibility bounds in the canonical unit. A value outside these bounds is retained but flagged
   * as likely erroneous, and is never consumed silently as a clinical input. Retaining it matters:
   * replacing an impossible device reading with a "reasonable" one would conceal a device or
   * transcription fault, which is exactly what a clinician needs to see.
   */
  readonly plausibleMin: number;
  readonly plausibleMax: number;
  /** Decimal places for display, so a value is never presented with false precision. */
  readonly precision: number;
  /** Aliases understood by the deterministic parser, including Indian-language forms. */
  readonly aliases: readonly string[];
}

/**
 * Fahrenheit to Celsius as an affine conversion: C = (F - 32) * 5/9.
 * Expressed as factor plus offset so one code path handles affine and ratio conversions alike, and
 * so a future unit cannot be added incorrectly by forgetting the offset.
 */
const FAHRENHEIT_TO_CELSIUS: UnitConversion = {
  unit: "F",
  factor: 5 / 9,
  offset: -32 * (5 / 9),
};

/** Populated from the definitions appended at the end of this file. */
export const VITAL_BY_CODE: Map<string, VitalDefinition> = new Map();

export function vitalDefinition(code: string): VitalDefinition | undefined {
  return VITAL_BY_CODE.get(code);
}

/**
 * Convert a value into the vital's canonical unit.
 *
 * Returns undefined for an unknown vital or an unknown unit rather than guessing. A silent wrong
 * unit conversion is a patient-safety defect, so refusing to convert is the correct behaviour.
 */
export function convertToCanonical(
  vitalCode: string,
  value: number,
  fromUnit: string,
): { readonly value: number; readonly unit: string } | undefined {
  const definition = VITAL_BY_CODE.get(vitalCode);
  if (!definition) return undefined;

  const normalised = fromUnit.trim();
  const conversion = definition.alternativeUnits.find(
    (candidate) => candidate.unit.toLowerCase() === normalised.toLowerCase(),
  );
  if (!conversion) return undefined;

  return {
    value: value * conversion.factor + (conversion.offset ?? 0),
    unit: definition.canonicalUnit,
  };
}

/**
 * Whether a value is plausible for the vital.
 *
 * An implausible reading is recorded and flagged, never discarded and never auto-interpreted.
 */
export function isPlausible(
  vitalCode: string,
  canonicalValue: number,
): boolean {
  const definition = VITAL_BY_CODE.get(vitalCode);
  if (!definition) return false;
  return (
    canonicalValue >= definition.plausibleMin &&
    canonicalValue <= definition.plausibleMax
  );
}

/**
 * Body mass index, computed only when both inputs are present and positive.
 *
 * Returns undefined rather than a number when inputs are missing, so a caller cannot accidentally
 * treat "no BMI" as a numeric BMI of zero and flag the patient as severely underweight.
 */
export function computeBmi(
  heightCm?: number,
  weightKg?: number,
): number | undefined {
  if (heightCm === undefined || weightKg === undefined) return undefined;
  if (heightCm <= 0 || weightKg <= 0) return undefined;
  const heightMetres = heightCm / 100;
  return Number((weightKg / (heightMetres * heightMetres)).toFixed(1));
}

/**
 * Blood pressure is stored as a single vital with two components rather than as two unrelated
 * numbers, because a systolic without its diastolic is not interpretable, and storing them
 * separately allows a record to end up holding one and not the other.
 */
export interface BloodPressureReading {
  readonly systolic: number;
  readonly diastolic: number;
  readonly unit: "mmHg";
}

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

export const VITAL_DEFINITIONS: readonly VitalDefinition[] = [
  {
    code: "MK-VIT-001",
    display: "Blood pressure",
    canonicalUnit: "mmHg",
    alternativeUnits: [{ unit: "mmHg", factor: 1 }],
    plausibleMin: 20,
    plausibleMax: 400,
    precision: 0,
    aliases: ["blood pressure", "bp", "rakt chaap", "बीपी", "रक्तदाब"],
  },
  {
    code: "MK-VIT-002",
    display: "Pulse rate",
    canonicalUnit: "beats/min",
    alternativeUnits: [
      { unit: "beats/min", factor: 1 },
      { unit: "bpm", factor: 1 },
    ],
    plausibleMin: 10,
    plausibleMax: 350,
    precision: 0,
    aliases: ["pulse", "heart rate", "hr", "nadi", "नाड़ी", "धड़कन"],
  },
  {
    code: "MK-VIT-003",
    display: "Body temperature",
    canonicalUnit: "Cel",
    alternativeUnits: [
      { unit: "Cel", factor: 1 },
      { unit: "C", factor: 1 },
      FAHRENHEIT_TO_CELSIUS,
    ],
    plausibleMin: 25,
    plausibleMax: 45,
    precision: 1,
    aliases: ["temperature", "temp", "तापमान", "ताप"],
  },
  {
    code: "MK-VIT-004",
    display: "Oxygen saturation",
    canonicalUnit: "%",
    alternativeUnits: [{ unit: "%", factor: 1 }],
    plausibleMin: 30,
    plausibleMax: 100,
    precision: 0,
    aliases: ["spo2", "oxygen saturation", "saturation", "o2 sat", "ऑक्सीजन"],
  },
  {
    code: "MK-VIT-005",
    display: "Respiratory rate",
    canonicalUnit: "breaths/min",
    alternativeUnits: [{ unit: "breaths/min", factor: 1 }],
    plausibleMin: 4,
    plausibleMax: 80,
    precision: 0,
    aliases: ["respiratory rate", "breathing rate", "श्वसन दर"],
  },
  {
    code: "MK-VIT-006",
    display: "Random blood glucose",
    canonicalUnit: "mg/dL",
    alternativeUnits: [
      { unit: "mg/dL", factor: 1 },
      { unit: "mmol/L", factor: 18.0182 },
    ],
    plausibleMin: 10,
    plausibleMax: 900,
    precision: 0,
    aliases: ["blood sugar", "glucose", "sugar", "शुगर"],
  },
  {
    code: "MK-VIT-007",
    display: "Height",
    canonicalUnit: "cm",
    alternativeUnits: [
      { unit: "cm", factor: 1 },
      { unit: "m", factor: 100 },
    ],
    plausibleMin: 30,
    plausibleMax: 250,
    precision: 1,
    aliases: ["height", "ऊंचाई", "उंची"],
  },
  {
    code: "MK-VIT-008",
    display: "Weight",
    canonicalUnit: "kg",
    alternativeUnits: [{ unit: "kg", factor: 1 }],
    plausibleMin: 1,
    plausibleMax: 400,
    precision: 1,
    aliases: ["weight", "वज़न", "वजन"],
  },
  {
    code: "MK-VIT-009",
    display: "Body mass index",
    canonicalUnit: "kg/m2",
    alternativeUnits: [{ unit: "kg/m2", factor: 1 }],
    plausibleMin: 8,
    plausibleMax: 90,
    precision: 1,
    aliases: ["bmi", "body mass index"],
  },
];

for (const definition of VITAL_DEFINITIONS) {
  if (VITAL_BY_CODE.has(definition.code)) {
    throw new Error(`Duplicate vital definition code: ${definition.code}`);
  }
  VITAL_BY_CODE.set(definition.code, definition);
}

/**
 * Thresholds used to pick the correct presentation band when a reference range is absent.
 *
 * These are *presentation* defaults only. The authoritative interpretation of a measurement for
 * safety purposes is produced by the versioned rule set, so a hospital that tunes its thresholds
 * changes the safety engine's behaviour and not this table.
 */
export const VITAL_REFERENCE_HINTS: Readonly<
  Record<string, { low?: number; high?: number }>
> = {
  "MK-VIT-002": { low: 60, high: 100 },
  "MK-VIT-003": { low: 36.1, high: 37.5 },
  "MK-VIT-004": { low: 95, high: 100 },
  "MK-VIT-005": { low: 12, high: 20 },
  "MK-VIT-001": { low: 90, high: 140 },
};
