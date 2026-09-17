/**
 * Demo clinical seed, part two: prior-visit facts.
 *
 * Previous visit: hypertension on record, metformin prescribed, haemoglobin 11.2 g/dL. These facts are
 * the baseline the "what changed" engine compares today's intake against, and the medication record is
 * the other half of the documented medication-statement contradiction.
 */

import { ulid } from 'ulid';
import type { AppDatabase } from './kysely';
import { DEMO_FIXTURES } from './seed-demo-patient';

const json = (value: unknown): string => JSON.stringify(value);

export async function seedDemoPriorFacts(db: AppDatabase, tenantId: string): Promise<{ created: boolean }> {
  const now = new Date().toISOString();
  const existing = await db
    .selectFrom('symptoms')
    .selectAll()
    .where('encounterId', '=', DEMO_FIXTURES.previousEncounterId)
    .where('conceptCode', '=', 'MK-SYM-024')
    .executeTakeFirst();
  if (existing) return { created: false };

  await db
    .insertInto('symptoms')
    .values({
      id: ulid(),
      tenantId,
      patientId: DEMO_FIXTURES.patientId,
      encounterId: DEMO_FIXTURES.previousEncounterId,
      conceptCode: 'MK-SYM-024',
      displayName: 'Weight loss',
      patientText: 'vajan kam ho gaya',
      onsetDate: '2026-01-01',
      durationValue: 60,
      durationUnit: 'DAYS',
      durationVerbatim: 'do mahine',
      durationApproximate: 1,
      severity: 'MODERATE',
      severityVerbatim: null,
      certainty: 'UNKNOWN',
      socratesJson: json({}),
      originClass: 'PATIENT_REPORTED',
      confidence: 0.8,
      verificationState: 'UNVERIFIED',
      verifiedAt: null,
      verifiedBy: null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();

  await db
    .insertInto('medications')
    .values({
      id: ulid(),
      tenantId,
      patientId: DEMO_FIXTURES.patientId,
      encounterId: DEMO_FIXTURES.previousEncounterId,
      conceptCode: 'MK-MED-001',
      asWrittenName: 'Tab Glycomet 500',
      strengthValue: 500,
      strengthUnit: 'mg',
      doseValue: 500,
      doseUnit: 'mg',
      frequency: 'BD',
      route: 'ORAL',
      durationDays: 90,
      status: 'CURRENT',
      startedOn: '2026-03-04',
      stoppedOn: null,
      isPrescribed: 1,
      documentId: null,
      originClass: 'CLINICIAN_ENTERED',
      confidence: 1,
      verificationState: 'VERIFIED',
      verifiedAt: now,
      verifiedBy: null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();

  await db
    .insertInto('lab_results')
    .values({
      id: ulid(),
      tenantId,
      patientId: DEMO_FIXTURES.patientId,
      encounterId: DEMO_FIXTURES.previousEncounterId,
      testCode: 'MK-LAB-001',
      value: 11.2,
      unit: 'g/dL',
      referenceLow: 12,
      referenceHigh: 16,
      referenceSource: 'SOURCE_DOCUMENT',
      flag: 'LOW',
      implausible: 0,
      collectedAt: '2026-03-04T08:30:00.000Z',
      reportedAt: '2026-03-04T12:00:00.000Z',
      documentId: null,
      sourceComment: null,
      originClass: 'DOCUMENT_DERIVED',
      confidence: 0.92,
      verificationState: 'VERIFIED',
      verifiedAt: now,
      verifiedBy: null,
      createdAt: now,
    })
    .execute();

  return { created: true };
}