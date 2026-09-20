/**
 * Demo clinical seed, part one: patient identity and longitudinal encounters.
 *
 * One fixed, fully synthetic longitudinal case: a hypertensive 67-year-old who returns with chest pain.
 * Fixed ids make the demo addressable: `/api/v1/encounters/{current}` always works in the demo
 * environment. Everything here is synthetic and deterministic.
 */

import { ulid } from "ulid";
import type { AppDatabase } from "./kysely";

export const DEMO_FIXTURES = {
  patientId: "01JDEMO00000000000000001",
  previousEncounterId: "01JDEMO00000000000000002",
  currentEncounterId: "01JDEMO00000000000000003",
} as const;

const json = (value: unknown): string => JSON.stringify(value);

/** Insert the demo patient, with a recorded no-known-allergies status, if absent. */
export async function seedDemoPatient(
  db: AppDatabase,
  tenantId: string,
): Promise<{ created: boolean }> {
  const now = new Date().toISOString();
  const present = await db
    .selectFrom("patients")
    .selectAll()
    .where("id", "=", DEMO_FIXTURES.patientId)
    .executeTakeFirst();
  if (present) return { created: false };

  await db
    .insertInto("patients")
    .values({
      id: DEMO_FIXTURES.patientId,
      tenantId,
      fullName: "Ramesh Kumar",
      preferredName: "Ramesh",
      dateOfBirth: "1959-03-14",
      dobAccuracy: "EXACT",
      ageYears: 67,
      sex: "MALE",
      pregnant: 0,
      phoneMasked: "XXXXXX3210",
      preferredLanguage: "hi-IN",
      district: "Pune",
      state: "Maharashtra",
      pinCode: "411001",
      guestRef: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .execute();

  // The allergy status is a recorded positive statement, not an absence of rows.
  await db
    .insertInto("allergy_status")
    .values({
      tenantId,
      patientId: DEMO_FIXTURES.patientId,
      status: "CONFIRMED_NO_KNOWN_ALLERGIES",
      recordedAt: now,
      recordedBy: null,
    })
    .execute();

  void ulid;
  return { created: true };
}

/** Insert the two encounters (previous visit + current intake under construction) if absent. */
export async function seedDemoEncounters(
  db: AppDatabase,
  tenantId: string,
): Promise<{ created: number }> {
  const now = new Date().toISOString();
  const seeds = [
    {
      id: DEMO_FIXTURES.previousEncounterId,
      // A finished past visit: the longitudinal baseline the demo compares against.
      status: "COMPLETED",
      createdAt: "2026-03-04T09:00:00.000Z",
      submittedAt: "2026-03-04T09:25:00.000Z",
      patientConfirmedAt: "2026-03-04T09:24:00.000Z",
      completedAt: "2026-03-04T10:05:00.000Z",
      disposition: "FOLLOW_UP_OPD",
      complaint: ["MK-SYM-024"],
      chief: "weight loss and tiredness",
    },
    {
      id: DEMO_FIXTURES.currentEncounterId,
      status: "IN_PROGRESS",
      createdAt: now,
      submittedAt: null,
      patientConfirmedAt: null,
      completedAt: null,
      disposition: null,
      complaint: ["MK-SYM-001"],
      chief: "seene mein dard kal se",
    },
  ];

  let created = 0;
  for (const seed of seeds) {
    const present = await db
      .selectFrom("encounters")
      .selectAll()
      .where("id", "=", seed.id)
      .executeTakeFirst();
    if (present) continue;

    await db
      .insertInto("encounters")
      .values({
        id: seed.id,
        tenantId,
        patientId: DEMO_FIXTURES.patientId,
        sessionId: null,
        encounterType: "OPD",
        status: seed.status,
        chiefComplaintCodesJson: json(seed.complaint),
        chiefComplaintVerbatim: seed.chief,
        locale: "hi-IN",
        ayushMode: 0,
        questionnaireVersion: "1.0.0",
        pathwayVersion: "1.0.0",
        activePathwaysJson: json(["PATH-CHEST-PAIN", "PATH-HISTORY-GENERAL"]),
        submittedAt: seed.submittedAt,
        patientConfirmedAt: seed.patientConfirmedAt,
        completedAt: seed.completedAt,
        disposition: seed.disposition,
        dispositionBy: null,
        createdAt: seed.createdAt,
        updatedAt: seed.createdAt,
        deletedAt: null,
      })
      .execute();
    created += 1;
  }
  return { created };
}

/**
 * Anchor the demo encounters in the interview runtime: every real encounter carries an
 * interview session row, so the seeded history behaves identically under the case view,
 * summary and compare endpoints.
 */
export async function seedDemoInterviewSessions(
  db: AppDatabase,
  tenantId: string,
): Promise<{ created: number }> {
  const sessions = [
    {
      encounterId: DEMO_FIXTURES.previousEncounterId,
      status: "COMPLETED",
      startedAt: "2026-03-04T09:01:00.000Z",
      completedAt: "2026-03-04T09:24:00.000Z",
    },
    {
      encounterId: DEMO_FIXTURES.currentEncounterId,
      status: "ACTIVE",
      startedAt: new Date().toISOString(),
      completedAt: null,
    },
  ];
  let created = 0;
  for (const session of sessions) {
    const present = await db
      .selectFrom("interview_sessions")
      .selectAll()
      .where("encounterId", "=", session.encounterId)
      .where("tenantId", "=", tenantId)
      .executeTakeFirst();
    if (present) continue;
    const at = session.startedAt;
    await db
      .insertInto("interview_sessions")
      .values({
        id: ulid(),
        tenantId,
        encounterId: session.encounterId,
        patientId: DEMO_FIXTURES.patientId,
        kioskSessionId: "seeded-history",
        status: session.status,
        pathwayKeysJson: json(["PATH-CHEST-PAIN", "PATH-HISTORY-GENERAL"]),
        pathwayVersion: "1.0.0",
        runtimeVersion: "1.0.0",
        startedAt: at,
        completedAt: session.completedAt,
        createdAt: at,
        updatedAt: at,
        deletedAt: null,
      })
      .execute();
    created += 1;
  }
  return { created };
}

/** Timeline + queue rows for the finished previous visit, so the console shows a real story. */
export async function seedDemoPreviousVisitTrail(
  db: AppDatabase,
  tenantId: string,
): Promise<{ created: boolean }> {
  const marker = await db
    .selectFrom("timeline_events")
    .selectAll()
    .where("encounterId", "=", DEMO_FIXTURES.previousEncounterId)
    .where("eventType", "=", "ENCOUNTER_COMPLETED")
    .executeTakeFirst();
  if (marker) return { created: false };

  const events = [
    {
      eventType: "ENCOUNTER_SUBMITTED",
      eventAt: "2026-03-04T09:25:00.000Z",
      headline: "Encounter submitted for review",
    },
    {
      eventType: "ENCOUNTER_COMPLETED",
      eventAt: "2026-03-04T10:05:00.000Z",
      headline: "Encounter completed",
    },
  ];
  for (const event of events) {
    await db
      .insertInto("timeline_events")
      .values({
        id: ulid(),
        tenantId,
        patientId: DEMO_FIXTURES.patientId,
        encounterId: DEMO_FIXTURES.previousEncounterId,
        eventType: event.eventType,
        eventAt: event.eventAt,
        headline: event.headline,
        detailJson: json({}),
        evidenceIdsJson: json([]),
        createdAt: event.eventAt,
      })
      .execute();
  }
  await db
    .insertInto("queue_entries")
    .values({
      id: ulid(),
      tenantId,
      encounterId: DEMO_FIXTURES.previousEncounterId,
      patientId: DEMO_FIXTURES.patientId,
      priority: "ROUTINE",
      status: "COMPLETED",
      reason: "No rule fired",
      tokenNumber: "A-001",
      ruleIdentifiersJson: json([]),
      enqueuedAt: "2026-03-04T09:25:00.000Z",
      calledAt: "2026-03-04T09:40:00.000Z",
      completedAt: "2026-03-04T10:05:00.000Z",
      updatedAt: "2026-03-04T10:05:00.000Z",
    })
    .execute();
  return { created: true };
}
