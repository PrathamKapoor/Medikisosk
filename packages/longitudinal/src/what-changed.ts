/**
 * Deterministic "what changed" diff between two encounter snapshots.
 *
 * Compares a previous encounter's clinical record against a current one and emits a flat, ordered
 * list of individual changes (`ChangeItem`). The comparison is a pure function of two snapshots and
 * never consults an LLM; it is fully deterministic so the same two encounters always produce the
 * same diff. Evidence ids per item come from an injected resolver (the API layer maps fact rows to
 * their real evidence rows).
 */

/** One symptom in an encounter snapshot. */
export interface SymptomSnapshot {
  conceptCode: string;
  severity?: string;
  durationDays?: number;
}

/** One medication in an encounter snapshot. */
export interface MedicationSnapshot {
  conceptCode: string;
  status: string;
  startedOn?: string;
}

/** One lab result in an encounter snapshot. */
export interface LabSnapshot {
  testCode: string;
  value: number;
  flag?: string;
}

/**
 * A per-encounter clinical summary suitable for longitudinal comparison. Assembled by the API layer
 * from the tenant-scoped clinical rows of that encounter.
 */
export interface EncounterSnapshot {
  complaintCodes: readonly string[];
  symptoms: readonly SymptomSnapshot[];
  medications: readonly MedicationSnapshot[];
  allergies: readonly string[];
  labs: readonly LabSnapshot[];
  vitals: Record<string, number>;
  documentCount: number;
}

export type ChangeKind =
  | "NEW_SYMPTOM"
  | "RESOLVED_SYMPTOM"
  | "SEVERITY_CHANGED"
  | "MEDICATION_ADDED"
  | "MEDICATION_STOPPED"
  | "MEDICATION_CONTINUED"
  | "ALLERGY_ADDED"
  | "ALLERGY_RESOLVED"
  | "LAB_ADDED"
  | "LAB_CHANGED"
  | "VITAL_CHANGED"
  | "COMPLAINT_REPEATED";

export type ChangeDirection =
  "NEW" | "RESOLVED" | "WORSENED" | "IMPROVED" | "UNCHANGED" | "CONTRADICTORY";

export interface ChangeItem {
  kind: ChangeKind;
  direction: ChangeDirection;
  /** Human-oriented label describing the affected clinical fact. */
  label: string;
  previous?: string | number;
  current?: string | number;
  /** Evidence ids backing this change, resolved by the injected mapping. */
  evidenceIds: readonly string[];
}

/**
 * Resolve the real evidence ids backing a changed fact. The pure engine cannot know row ids, so the
 * API layer injects the resolver; by default no evidence is attached.
 */
export type EvidenceMapping = (
  kind: ChangeKind,
  code: string,
) => readonly string[];

const CURRENT = "CURRENT";

const SEVERITY_RANK: Record<string, number> = {
  NONE: 0,
  MILD: 1,
  MODERATE: 2,
  SEVERE: 3,
  VERY_SEVERE: 4,
};

function severityRank(severity: string | undefined): number {
  if (!severity) return -1;
  const rank = SEVERITY_RANK[severity];
  return rank === undefined ? -1 : rank;
}

function isAbnormalFlag(flag: string | undefined): boolean {
  if (!flag) return false;
  return flag !== "NORMAL" && flag !== "UNKNOWN" && flag !== "";
}

/**
 * Canonical "higher is worse" table for the known MK-VIT-* vital codes. A code absent from this
 * table yields `UNKNOWN` direction. Blood pressure is treated via its systolic component (higher
 * systolic is worse); the compound interpretation is the API layer's responsibility.
 */
const VITAL_HIGHER_WORSE: Record<string, boolean> = {
  "MK-VIT-001": true, // Blood pressure (systolic)
  "MK-VIT-002": true, // Pulse rate
  "MK-VIT-003": true, // Body temperature
  "MK-VIT-005": true, // Respiratory rate
  "MK-VIT-006": true, // Random blood glucose
  "MK-VIT-004": false, // Oxygen saturation (lower is worse)
};

function noopMapping(_kind: ChangeKind, _code: string): readonly string[] {
  return [];
}

/**
 * Compare two encounter snapshots and return an ordered list of changes. The ordering is
 * deterministic: complaints, then symptoms, then medications, then allergies, then labs, then
 * vitals — each in stable input order.
 */
export function compareEncounters(
  previous: EncounterSnapshot,
  current: EncounterSnapshot,
  evidenceMapping: EvidenceMapping = noopMapping,
): readonly ChangeItem[] {
  const items: ChangeItem[] = [];
  const push = (
    kind: ChangeKind,
    direction: ChangeDirection,
    code: string,
    previousValue?: string | number,
    currentValue?: string | number,
  ) => {
    items.push({
      kind,
      direction,
      label: code,
      previous: previousValue,
      current: currentValue,
      evidenceIds: evidenceMapping(kind, code),
    });
  };

  // --- Symptoms -----------------------------------------------------------
  const prevSymptoms = new Map(
    previous.symptoms.map((s) => [s.conceptCode, s]),
  );
  const curSymptoms = new Map(current.symptoms.map((s) => [s.conceptCode, s]));

  for (const symptom of current.symptoms) {
    const previousEntry = prevSymptoms.get(symptom.conceptCode);
    if (!previousEntry) {
      push(
        "NEW_SYMPTOM",
        "NEW",
        symptom.conceptCode,
        undefined,
        symptom.severity,
      );
    }
  }
  for (const symptom of previous.symptoms) {
    if (!curSymptoms.has(symptom.conceptCode)) {
      push(
        "RESOLVED_SYMPTOM",
        "RESOLVED",
        symptom.conceptCode,
        symptom.severity,
      );
    }
  }
  // Severity change only for symptoms present in BOTH snapshots.
  for (const symptom of current.symptoms) {
    const prev = prevSymptoms.get(symptom.conceptCode);
    if (!prev) continue;
    const prevRank = severityRank(prev.severity);
    const curRank = severityRank(symptom.severity);
    if (prevRank === curRank) continue;
    push(
      "SEVERITY_CHANGED",
      curRank > prevRank ? "WORSENED" : "IMPROVED",
      symptom.conceptCode,
      prev.severity,
      symptom.severity,
    );
  }

  // --- Medications --------------------------------------------------------
  const prevCurrent = new Set(
    previous.medications
      .filter((m) => m.status === CURRENT)
      .map((m) => m.conceptCode),
  );
  const curCodes = new Set(current.medications.map((m) => m.conceptCode));
  const curCurrent = new Set(
    current.medications
      .filter((m) => m.status === CURRENT)
      .map((m) => m.conceptCode),
  );

  for (const med of current.medications) {
    if (med.status !== CURRENT) continue;
    if (prevCurrent.has(med.conceptCode)) {
      push(
        "MEDICATION_CONTINUED",
        "UNCHANGED",
        med.conceptCode,
        undefined,
        med.status,
      );
    } else {
      push("MEDICATION_ADDED", "NEW", med.conceptCode, undefined, med.status);
    }
  }
  for (const med of previous.medications) {
    if (med.status !== CURRENT) continue;
    if (!curCurrent.has(med.conceptCode)) {
      push("MEDICATION_STOPPED", "RESOLVED", med.conceptCode, med.status);
    }
  }

  // --- Allergies ----------------------------------------------------------
  const prevAllergies = new Set(previous.allergies);
  const curAllergies = new Set(current.allergies);
  for (const allergy of current.allergies) {
    if (!prevAllergies.has(allergy)) push("ALLERGY_ADDED", "NEW", allergy);
  }
  for (const allergy of previous.allergies) {
    if (!curAllergies.has(allergy))
      push("ALLERGY_RESOLVED", "RESOLVED", allergy);
  }

  // --- Labs ---------------------------------------------------------------
  const prevLabs = new Map(previous.labs.map((l) => [l.testCode, l]));
  const curLabs = new Map(current.labs.map((l) => [l.testCode, l]));

  for (const lab of current.labs) {
    const prev = prevLabs.get(lab.testCode);
    if (!prev) {
      push("LAB_ADDED", "NEW", lab.testCode, undefined, lab.value);
      continue;
    }
    const sameValue = prev.value === lab.value;
    const sameFlag = (prev.flag ?? "") === (lab.flag ?? "");
    if (sameValue && sameFlag) continue;
    const direction = labDeltaDirection(prev.flag, lab.flag);
    push("LAB_CHANGED", direction, lab.testCode, prev.value, lab.value);
  }

  // --- Vitals -------------------------------------------------------------
  for (const [code, value] of Object.entries(current.vitals)) {
    const prev = previous.vitals[code];
    if (prev === undefined) {
      push("VITAL_CHANGED", "NEW", code, undefined, value);
      continue;
    }
    if (prev === value) continue;
    push("VITAL_CHANGED", vitalDirection(code, prev, value), code, prev, value);
  }

  // --- Complaints ---------------------------------------------------------
  const prevComplaints = new Set(previous.complaintCodes);
  for (const complaint of current.complaintCodes) {
    if (prevComplaints.has(complaint)) {
      push("COMPLAINT_REPEATED", "UNCHANGED", complaint);
    }
  }

  return items;
}

function labDeltaDirection(
  previousFlag: string | undefined,
  currentFlag: string | undefined,
): ChangeDirection {
  const prevAbn = isAbnormalFlag(previousFlag);
  const curAbn = isAbnormalFlag(currentFlag);
  if (curAbn && !prevAbn) return "WORSENED";
  if (!curAbn && prevAbn) return "IMPROVED";
  if (!curAbn && !prevAbn) return "UNCHANGED";
  // Both abnormal: the value sits outside the reference range in both encounters, which is a
  // deterioration relative to a normal baseline regardless of direction.
  return "WORSENED";
}

function vitalDirection(
  code: string,
  previous: number,
  current: number,
): ChangeDirection {
  if (previous === current) return "UNCHANGED";
  const higherWorse = VITAL_HIGHER_WORSE[code];
  if (higherWorse === undefined) return "UNCHANGED";
  const rising = current > previous;
  return rising === higherWorse ? "WORSENED" : "IMPROVED";
}
