/**
 * Encounter snapshots for longitudinal comparison.
 *
 * One implementation of "the clinical record of one encounter as data" shared by the summary
 * builder and the patient compare endpoint, so the two can never disagree about what changed.
 */

import {
  compareEncounters,
  type ChangeItem,
  type EncounterSnapshot,
} from "@medikiosk/longitudinal";
import type { AppDatabase } from "../db/kysely";

export interface SnapshotRows {
  readonly complaints: readonly string[];
  readonly symptoms: readonly {
    conceptCode: string;
    severity: string | null;
    durationValue: number | null;
  }[];
  readonly medications: readonly {
    conceptCode: string;
    status: string;
    startedOn: string | null;
  }[];
  readonly allergies: readonly {
    conceptCode: string | null;
    freeTextName: string | null;
  }[];
  readonly labs: readonly { testCode: string; value: number; flag: string }[];
  readonly vitals: readonly { conceptCode: string; value: number }[];
  readonly documentCount: number;
}

/** Load every row the snapshot needs for one encounter (tenant-scoped). */
export async function loadSnapshotRows(
  db: AppDatabase,
  tenantId: string,
  encounterId: string,
  complaints: readonly string[],
): Promise<SnapshotRows> {
  const [symptoms, medications, allergies, labs, vitals, documents] =
    await Promise.all([
      db
        .selectFrom("symptoms")
        .select(["conceptCode", "severity", "durationValue"])
        .where("tenantId", "=", tenantId)
        .where("encounterId", "=", encounterId)
        .execute(),
      db
        .selectFrom("medications")
        .select(["conceptCode", "status", "startedOn"])
        .where("tenantId", "=", tenantId)
        .where("encounterId", "=", encounterId)
        .execute(),
      db
        .selectFrom("allergy_records")
        .select(["conceptCode", "freeTextName"])
        .where("tenantId", "=", tenantId)
        .where("encounterId", "=", encounterId)
        .execute(),
      db
        .selectFrom("lab_results")
        .select(["testCode", "value", "flag"])
        .where("tenantId", "=", tenantId)
        .where("encounterId", "=", encounterId)
        .execute(),
      db
        .selectFrom("vitals")
        .select(["conceptCode", "value"])
        .where("tenantId", "=", tenantId)
        .where("encounterId", "=", encounterId)
        .execute(),
      db
        .selectFrom("documents")
        .select("id")
        .where("tenantId", "=", tenantId)
        .where("encounterId", "=", encounterId)
        .where("deletedAt", "is", null)
        .execute(),
    ]);
  return {
    complaints,
    symptoms,
    medications,
    allergies,
    labs,
    vitals,
    documentCount: documents.length,
  };
}

/** Map loaded rows onto the longitudinal snapshot shape. */
export function toSnapshot(rows: SnapshotRows): EncounterSnapshot {
  const vitals: Record<string, number> = {};
  for (const vital of rows.vitals) vitals[vital.conceptCode] = vital.value;
  return {
    complaintCodes: [...rows.complaints],
    symptoms: rows.symptoms.map((s) => ({
      conceptCode: s.conceptCode,
      ...(s.severity ? { severity: s.severity } : {}),
      ...(s.durationValue === null ? {} : { durationDays: s.durationValue }),
    })),
    medications: rows.medications.map((m) => ({
      conceptCode: m.conceptCode,
      status: m.status,
      ...(m.startedOn ? { startedOn: m.startedOn } : {}),
    })),
    allergies: rows.allergies.map(
      (a) => a.conceptCode ?? a.freeTextName ?? "UNKNOWN",
    ),
    labs: rows.labs.map((l) => ({
      testCode: l.testCode,
      value: l.value,
      flag: l.flag,
    })),
    vitals,
    documentCount: rows.documentCount,
  };
}

/** Compare two encounters' snapshots (previous → current). */
export function compareSnapshots(
  previous: SnapshotRows,
  current: SnapshotRows,
): readonly ChangeItem[] {
  return compareEncounters(toSnapshot(previous), toSnapshot(current));
}
