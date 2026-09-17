/**
 * Demo clinical seed, part one: patient identity and longitudinal encounters.
 *
 * One fixed, fully synthetic longitudinal case: a hypertensive 67-year-old who returns with chest pain.
 * Fixed ids make the demo addressable: `/api/v1/encounters/{current}` always works in the demo
 * environment. Everything here is synthetic and deterministic.
 */

import { ulid } from 'ulid';
import type { AppDatabase } from './kysely';

export const DEMO_FIXTURES = {
  patientId: '01JDEMO00000000000000001',
  previousEncounterId: '01JDEMO00000000000000002',
  currentEncounterId: '01JDEMO00000000000000003',
} as const;

const json = (value: unknown): string => JSON.stringify(value);

/** Insert the demo patient, with a recorded no-known-allergies status, if absent. */
export async function seedDemoPatient(db: AppDatabase, tenantId: string): Promise<{ created: boolean }> {
  const now = new Date().toISOString();
  const present = await db
    .selectFrom('patients')
    .selectAll()
    .where('id', '=', DEMO_FIXTURES.patientId)
    .executeTakeFirst();
  if (present) return { created: false };

  await db
    .insertInto('patients')
    .values({
      id: DEMO_FIXTURES.patientId,
      tenantId,
      fullName: 'Ramesh Kumar',
      preferredName: 'Ramesh',
      dateOfBirth: '1959-03-14',
      dobAccuracy: 'EXACT',
      ageYears: 67,
      sex: 'MALE',
      pregnant: 0,
      phoneMasked: 'XXXXXX3210',
      preferredLanguage: 'hi-IN',
      district: 'Pune',
      state: 'Maharashtra',
      pinCode: '411001',
      guestRef: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .execute();

  // The allergy status is a recorded positive statement, not an absence of rows.
  await db
    .insertInto('allergy_status')
    .values({
      tenantId,
      patientId: DEMO_FIXTURES.patientId,
      status: 'CONFIRMED_NO_KNOWN_ALLERGIES',
      recordedAt: now,
      recordedBy: null,
    })
    .execute();

  void ulid;
  return { created: true };
}

/** Insert the two encounters (previous visit + current intake under construction) if absent. */
export async function seedDemoEncounters(db: AppDatabase, tenantId: string): Promise<{ created: number }> {
  const now = new Date().toISOString();
  const seeds = [
    {
      id: DEMO_FIXTURES.previousEncounterId,
      status: 'READY_FOR_REVIEW',
      createdAt: '2026-03-04T09:00:00.000Z',
      complaint: ['MK-SYM-024'],
      chief: 'weight loss and tiredness',
    },
    {
      id: DEMO_FIXTURES.currentEncounterId,
      status: 'IN_PROGRESS',
      createdAt: now,
      complaint: ['MK-SYM-001'],
      chief: 'seene mein dard kal se',
    },
  ];

  let created = 0;
  for (const seed of seeds) {
    const present = await db
      .selectFrom('encounters')
      .selectAll()
      .where('id', '=', seed.id)
      .executeTakeFirst();
    if (present) continue;

    await db
      .insertInto('encounters')
      .values({
        id: seed.id,
        tenantId,
        patientId: DEMO_FIXTURES.patientId,
        sessionId: null,
        encounterType: 'OPD',
        status: seed.status,
        chiefComplaintCodesJson: json(seed.complaint),
        chiefComplaintVerbatim: seed.chief,
        locale: 'hi-IN',
        ayushMode: 0,
        questionnaireVersion: '1.0.0',
        pathwayVersion: '1.0.0',
        activePathwaysJson: json(['PATH-CHEST-PAIN', 'PATH-HISTORY-GENERAL']),
        submittedAt: seed.status === 'READY_FOR_REVIEW' ? seed.createdAt : null,
        createdAt: seed.createdAt,
        updatedAt: seed.createdAt,
        deletedAt: null,
      })
      .execute();
    created += 1;
  }
  return { created };
}