/**
 * Deterministic contradiction detection between two sources of clinical truth (e.g. a patient
 * statement vs a documented record). The detectors NEVER decide which source is correct — they
 * only surface the fact that two sources disagree, with a severity and a human-readable reason.
 * All detectors are pure and deterministic; nothing is fetched or inferred.
 */

export type ContradictionStatementKind =
  "PATIENT_REPORTED" | "DOCUMENT_DERIVED" | "VITAL_DERIVED" | "SYSTEM_DERIVED";

export interface ContradictionStatement {
  kind: ContradictionStatementKind;
  text: string;
  value?: string | number;
  timestamp?: string;
  evidenceId?: string;
}

export type ContradictionKind = "MEDICATION" | "ALLERGY" | "LAB" | "HISTORY";

export type ContradictionSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface ContradictionCandidate {
  kind: ContradictionKind;
  severity: ContradictionSeverity;
  statementA: ContradictionStatement;
  statementB: ContradictionStatement;
  reason: string;
}

/** A source-side medication statement. `status` uses the same lexicon as `MedicationRow.status`. */
export interface MedicationStatement {
  code?: string;
  name?: string;
  status?: string;
}

const ACTIVE = "CURRENT";

function nameOf(med: MedicationStatement): string {
  return med.name ?? med.code ?? "an unknown medication";
}

/**
 * Compare the patient-reported medication set against the documented medication record.
 *
 * - Patient reports no medications but the record holds an active drug → CRITICAL (a patient
 *   denying a documented active drug is high-acuity).
 * - The documented record shows the drug as discontinued but the patient currently reports taking
 *   it → WARNING.
 * - The same active drug appears in both sources → INFO overlap (dose consistency cannot be
 *   verified from these fields; the API layer may enrich).
 */
export function detectMedicationContradictions(
  reported: readonly MedicationStatement[],
  documented: readonly MedicationStatement[],
): readonly ContradictionCandidate[] {
  const candidates: ContradictionCandidate[] = [];

  if (reported.length === 0) {
    for (const documentedMed of documented) {
      if (documentedMed.status === ACTIVE) {
        candidates.push({
          kind: "MEDICATION",
          severity: "CRITICAL",
          statementA: {
            kind: "PATIENT_REPORTED",
            text: "Patient reports taking no current medications.",
          },
          statementB: {
            kind: "DOCUMENT_DERIVED",
            text: `${nameOf(documentedMed)} is active on the documented record.`,
          },
          reason:
            "Patient denies any current medication while the documented record shows an active drug.",
        });
      }
    }
    return candidates;
  }

  const reportedActive = reported.filter((m) => m.status === ACTIVE);
  for (const documentedMed of documented) {
    if (
      documentedMed.status !== "DISCONTINUED" &&
      documentedMed.status !== "STOPPED"
    )
      continue;
    const stillReported = reportedActive.some(
      (m) => m.code !== undefined && m.code === documentedMed.code,
    );
    if (stillReported) {
      candidates.push({
        kind: "MEDICATION",
        severity: "WARNING",
        statementA: {
          kind: "PATIENT_REPORTED",
          text: `Patient reports currently taking ${nameOf(documentedMed)}.`,
        },
        statementB: {
          kind: "DOCUMENT_DERIVED",
          text: `${nameOf(documentedMed)} is recorded as discontinued.`,
        },
        reason:
          "The patient reports taking a drug the documented record lists as discontinued.",
      });
    }
  }

  for (const med of reportedActive) {
    if (!med.code) continue;
    const documentMatch = documented.find(
      (d) => d.code === med.code && d.status === ACTIVE,
    );
    if (documentMatch) {
      candidates.push({
        kind: "MEDICATION",
        severity: "INFO",
        statementA: {
          kind: "PATIENT_REPORTED",
          text: `Patient reports taking ${nameOf(med)}.`,
        },
        statementB: {
          kind: "DOCUMENT_DERIVED",
          text: `${nameOf(documentMatch)} is active on the documented record.`,
        },
        reason:
          "The same active medication appears in both the patient statement and the documented record; dose consistency should be confirmed.",
      });
    }
  }

  return candidates;
}

/** A documented allergy. `code`/`name` identify the allergen; `severity` is the recorded reaction severity. */
export interface DocumentedAllergy {
  code?: string;
  name?: string;
  severity?: string;
}

/**
 * Compare a patient's "no known allergies" statement against the documented allergy record.
 *
 * - Patient reports no allergies but the record holds at least one allergy → WARNING.
 *   (NEVER auto-resolved; the clinician decides which source is correct.)
 */
export function detectAllergyContradictions(
  reportedNone: boolean,
  documentedAllergies: readonly DocumentedAllergy[],
): readonly ContradictionCandidate[] {
  if (!reportedNone || documentedAllergies.length === 0) return [];

  const first = documentedAllergies[0]!;
  const label = first.name ?? first.code ?? "an allergy";
  return [
    {
      kind: "ALLERGY",
      severity: "WARNING",
      statementA: {
        kind: "PATIENT_REPORTED",
        text: "Patient reports no known allergies.",
      },
      statementB: {
        kind: "DOCUMENT_DERIVED",
        text: `${label} is recorded on the documented allergy record.`,
      },
      reason:
        "Patient states no allergies while the documented record holds at least one allergy.",
    },
  ];
}

/** A lab result taken from an encounter snapshot. */
export interface LabDelta {
  testCode: string;
  value: number;
  flag?: string;
}

/**
 * Detect a material lab delta between two encounters: an absolute value change beyond `threshold`
 * (default 0, i.e. any value difference) or a reference-range flag change.
 *
 * - A change into / further into an abnormal range, or across the CRITICAL boundary → CRITICAL.
 * - Any other material delta (including flag recovery) → WARNING.
 * The detectors never claim the direction is a diagnosis — they only flag that the numbers moved
 * materially and let the clinician interpret it.
 */
export function detectLabDeltas(
  previous: readonly LabDelta[],
  current: readonly LabDelta[],
  threshold = 0,
): readonly ContradictionCandidate[] {
  const candidates: ContradictionCandidate[] = [];
  const prevByCode = new Map(previous.map((l) => [l.testCode, l]));
  const curByCode = new Map(current.map((l) => [l.testCode, l]));

  for (const [code, currentLab] of curByCode) {
    const previousLab = prevByCode.get(code);
    if (!previousLab) continue;
    const delta = Math.abs(currentLab.value - previousLab.value);
    const flagChanged = (previousLab.flag ?? "") !== (currentLab.flag ?? "");
    if (delta <= threshold && !flagChanged) continue;

    const currentCritical = isCriticalFlag(currentLab.flag);
    const previousCritical = isCriticalFlag(previousLab.flag);
    const severity: ContradictionSeverity =
      currentCritical ||
      (!previousCritical && flagChanged && isAbnormalFlag(currentLab.flag))
        ? "CRITICAL"
        : "WARNING";

    candidates.push({
      kind: "LAB",
      severity,
      statementA: {
        kind: "DOCUMENT_DERIVED",
        text: `${code} was ${previousLab.value}${previousLab.flag ? ` (${previousLab.flag})` : ""} on the previous record.`,
        value: previousLab.value,
      },
      statementB: {
        kind: "DOCUMENT_DERIVED",
        text: `${code} is ${currentLab.value}${currentLab.flag ? ` (${currentLab.flag})` : ""} on the current record.`,
        value: currentLab.value,
      },
      reason: `Lab ${code} changed materially (${previousLab.value} → ${currentLab.value})${
        flagChanged ? " with a reference-range flag change" : ""
      }.`,
    });
  }

  return candidates;
}

function isCriticalFlag(flag: string | undefined): boolean {
  if (!flag) return false;
  return flag === "CRITICAL" || flag.startsWith("CRITICAL_");
}

function isAbnormalFlag(flag: string | undefined): boolean {
  if (!flag) return false;
  return flag !== "NORMAL" && flag !== "UNKNOWN" && flag !== "";
}
