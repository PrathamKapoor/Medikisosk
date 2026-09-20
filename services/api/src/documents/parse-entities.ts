/**
 * Deterministic document entity extraction.
 *
 * A rule-based parser over the (mock-)OCR text: known line shapes ("Tab Metformin 500 mg BD",
 * "Haemoglobin: 9.2 g/dL", "Patient: ...", "Date: ...", "Dr. ...", "Diagnosis: ...") are matched
 * against the clinical vocabulary so extracted values carry concept codes and normalised units.
 *
 * MOCKED-ADJACENT: the parser reads only text the OCR layer returned; it recognises the fixture
 * vocabulary below and nothing else. Unrecognised lines produce no entities and no guesses. A
 * real NER/OCR provider replaces this module behind the same evidence contract (ADR-003).
 */

import {
  LAB_TEST_DEFINITIONS,
  VITAL_DEFINITIONS,
  ALL_CONCEPTS,
  type ClinicalConcept,
} from "@medikiosk/clinical-schema";

export type ExtractedKind =
  | "MEDICATION"
  | "LAB_RESULT"
  | "VITAL"
  | "PATIENT_NAME"
  | "PROVIDER"
  | "DIAGNOSIS"
  | "DATE";

export interface ExtractedEntity {
  kind: ExtractedKind;
  /** Best human-readable value as written in the document. */
  rawText: string;
  conceptCode: string | null;
  testCode: string | null;
  /** Normalised payload (units, dose parts, dates) per kind. */
  normalised: Record<string, unknown>;
  confidence: number;
}

/** One matched vocabulary entry: either a lab test or a vital definition. */
interface VocabularyMatch {
  code: string;
  display: string;
  isVital: boolean;
}

const MEDICATION_LINE =
  /^(Tab|Cap|Capsule|Syrup|Syp|Injection|Inj)?\.?\s*([A-Z][A-Za-z0-9-]+(?:\s+[A-Za-z0-9-]+)*)\s+(\d+(?:\.\d+)?)\s*(mg|ml|mcg|g|IU)\b\s*(OD|BD|TDS|QID|HS|SOS)?/i;
const LAB_LINE =
  /^([A-Z][A-Za-z0-9 .\-]*?)\s*[:=]\s*(-?\d+(?:\.\d+)?)\s*(g\/dL|g\/L|mg\/dL|mmol\/L|%|beats\/min|breaths\/min|Cel|°C|mmHg|kg\/m2|kg\/m²)?/i;
const PATIENT_LINE = /^Patient\s*[:=]\s*(.+)$/im;
const DATE_LINE = /^Date\s*[:=]\s*(\d{4}-\d{2}-\d{2})/im;
const PROVIDER_LINE = /^(?:Dr\.?|Provider|Reported by|Pathologist)\s*:?\s*(.+)$/im;
const DIAGNOSIS_LINE = /^Diagnosis\s*[:=]\s*(.+)$/im;

function matchLabOrVital(name: string): VocabularyMatch | undefined {
  const folded = name.trim().toLowerCase();
  for (const definition of LAB_TEST_DEFINITIONS) {
    if (definition.display.toLowerCase() === folded)
      return { code: definition.code, display: definition.display, isVital: false };
    if (definition.aliases.some((alias) => alias.toLowerCase() === folded))
      return { code: definition.code, display: definition.display, isVital: false };
  }
  for (const definition of VITAL_DEFINITIONS) {
    if (definition.display.toLowerCase() === folded)
      return { code: definition.code, display: definition.display, isVital: true };
    if (definition.aliases.some((alias) => alias.toLowerCase() === folded))
      return { code: definition.code, display: definition.display, isVital: true };
  }
  for (const definition of LAB_TEST_DEFINITIONS) {
    if (folded.includes(definition.display.toLowerCase()))
      return { code: definition.code, display: definition.display, isVital: false };
  }
  return undefined;
}

function matchConceptByName(name: string): ClinicalConcept | undefined {
  const folded = name.trim().toLowerCase();
  for (const concept of ALL_CONCEPTS) {
    if (concept.display.toLowerCase() === folded) return concept;
    if (concept.synonyms.some((synonym) => synonym.toLowerCase() === folded))
      return concept;
  }
  return undefined;
}

/**
 * Parse the OCR text into extracted entities. Deterministic: identical text always produces the
 * identical entity list, in fixed line order.
 */
export function parseDocumentEntities(text: string): readonly ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];

  const patient = PATIENT_LINE.exec(text);
  if (patient) {
    entities.push({
      kind: "PATIENT_NAME",
      rawText: patient[1]!.trim(),
      conceptCode: null,
      testCode: null,
      normalised: {},
      confidence: 0.9,
    });
  }

  const date = DATE_LINE.exec(text);
  if (date) {
    entities.push({
      kind: "DATE",
      rawText: date[1]!,
      conceptCode: null,
      testCode: null,
      normalised: { date: date[1] },
      confidence: 0.95,
    });
  }

  const provider = PROVIDER_LINE.exec(text);
  if (provider) {
    entities.push({
      kind: "PROVIDER",
      rawText: provider[1]!.trim(),
      conceptCode: null,
      testCode: null,
      normalised: {},
      confidence: 0.85,
    });
  }

  const diagnosis = DIAGNOSIS_LINE.exec(text);
  if (diagnosis) {
    const value = diagnosis[1]!.trim();
    const concept = matchConceptByName(value.split(",")[0]!);
    entities.push({
      kind: "DIAGNOSIS",
      rawText: value,
      conceptCode: concept?.code ?? null,
      testCode: null,
      normalised: { text: value },
      confidence: concept ? 0.85 : 0.6,
    });
  }

  for (const line of text.split(/\r?\n/)) {
    const medication = MEDICATION_LINE.exec(line);
    if (medication) {
      const name = medication[2]!.trim();
      const concept = matchConceptByName(name);
      entities.push({
        kind: "MEDICATION",
        rawText: line.trim(),
        conceptCode: concept?.code ?? null,
        testCode: null,
        normalised: {
          name,
          strengthValue: Number(medication[3]),
          strengthUnit: medication[4]!.toLowerCase(),
          ...(medication[5] ? { frequency: medication[5]!.toUpperCase() } : {}),
        },
        confidence: concept ? 0.91 : 0.7,
      });
      continue;
    }

    const lab = LAB_LINE.exec(line);
    if (lab) {
      const testName = lab[1]!.trim();
      const value = Number(lab[2]);
      const unit = lab[3] ?? "";
      const test = matchLabOrVital(testName);
      if (test) {
        entities.push({
          kind: test.isVital ? "VITAL" : "LAB_RESULT",
          rawText: line.trim(),
          conceptCode: test.isVital ? test.code : null,
          testCode: test.isVital ? null : test.code,
          normalised: { name: testName, value, unit },
          confidence: 0.88,
        });
      }
    }
  }

  return entities;
}
