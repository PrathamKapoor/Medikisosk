/**
 * Demo clinical seed, part three: the current visit.
 *
 * Chest pain with dyspnoea today, a patient "no medications" statement, Hb 9.2 and a low SpO2. The
 * patient statement is deliberately contradicted by the metformin record seeded by part two: the
 * demo's contradiction, what-changed and red-flag walkthrough all read from these exact rows.
 */

import { ulid } from 'ulid';
import type { AppDatabase } from './kysely';
import { DEMO_FIXTURES } from './seed-demo-patient';

export interface DemoCaseIds {
  readonly tenantId: string;
  readonly patientId: string;
  readonly previousEncounterId: string;
  readonly currentEncounterId: string;
}

const json = (value: unknown): string => JSON.stringify(value);

export async function seedDemoCurrentVisit(
  db: AppDatabase,
  tenantId: string,
): Promise<{ created: boolean }> {
  const now = new Date().toISOString();
  const marker = await db
    .selectFrom('evidence')
    .selectAll()
    .where('encounterId', '=', DEMO_FIXTURES.currentEncounterId)
    .executeTakeFirst();
  if (marker) return { created: false };

  const answers: {
    readonly code: string;
    readonly certainty: string;
    readonly raw: string;
    readonly confidence: number;
    readonly sourceRef: string;
  }[] = [
    { code: 'MK-SYM-001', certainty: 'UNKNOWN', raw: 'seene mein dard kal se', confidence: 0.81, sourceRef: 'q.chest_pain.onset' },
    { code: 'MK-SYM-002', certainty: 'UNKNOWN', raw: 'haan saans phool rahi hai', confidence: 0.71, sourceRef: 'q.chest_pain.safety_dyspnoea' },
    // NEGATED: the negation is itself a clinical finding, preserved rather than discarded.
    { code: 'MK-MED-001', certainty: 'NEGATED', raw: 'koi dawai nahi lete', confidence: 0.83, sourceRef: 'q.history.medications' },
  ];

  for (const answer of answers) {
    await db
      .insertInto('evidence')
      .values({
        id: ulid(),
        tenantId,
        encounterId: DEMO_FIXTURES.currentEncounterId,
        type: 'INTERVIEW_RESPONSE',
        originClass: 'PATIENT_REPORTED',
        source: 'questionnaire_response',
        sourceRef: answer.sourceRef,
        rawValue: answer.raw,
        normalisedJson: json({ conceptCodes: [answer.code], certainty: answer.certainty }),
        confidence: answer.confidence,
        language: 'hi-IN',
        capturedAt: now,
        createdBy: null,
        verificationState: 'UNVERIFIED',
        verifiedAt: null,
        verifiedBy: null,
        supersededBy: null,
      })
      .execute();
  }

  await db
    .insertInto('symptoms')
    .values({
      id: ulid(),
      tenantId,
      patientId: DEMO_FIXTURES.patientId,
      encounterId: DEMO_FIXTURES.currentEncounterId,
      conceptCode: 'MK-SYM-001',
      displayName: 'Chest pain',
      patientText: 'seene mein dard kal se',
      onsetDate: '2026-09-14',
      durationValue: 1,
      durationUnit: 'DAYS',
      durationVerbatim: 'kal se',
      durationApproximate: 0,
      severity: 'SEVERE',
      severityVerbatim: 'bahut zyada',
      certainty: 'UNKNOWN',
      socratesJson: json({
        SITE: 'UNANSWERED',
        ONSET: 'ANSWERED',
        CHARACTER: 'UNANSWERED',
        RADIATION: 'UNANSWERED',
        ASSOCIATED: 'ANSWERED',
        TIMING: 'UNANSWERED',
        SEVERITY: 'ANSWERED',
      }),
      originClass: 'PATIENT_REPORTED',
      confidence: 0.81,
      verificationState: 'UNVERIFIED',
      verifiedAt: null,
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
      encounterId: DEMO_FIXTURES.currentEncounterId,
      testCode: 'MK-LAB-001',
      value: 9.2,
      unit: 'g/dL',
      referenceLow: 12,
      referenceHigh: 16,
      referenceSource: 'SOURCE_DOCUMENT',
      flag: 'LOW',
      implausible: 0,
      collectedAt: now,
      reportedAt: now,
      documentId: null,
      sourceComment: null,
      originClass: 'DOCUMENT_DERIVED',
      confidence: 0.88,
      verificationState: 'UNVERIFIED',
      verifiedAt: null,
      verifiedBy: null,
      createdAt: now,
    })
    .execute();

  await db
    .insertInto('vitals')
    .values({
      id: ulid(),
      tenantId,
      patientId: DEMO_FIXTURES.patientId,
      encounterId: DEMO_FIXTURES.currentEncounterId,
      conceptCode: 'MK-VIT-004',
      componentCode: null,
      value: 93,
      unit: '%',
      measuredAt: now,
      source: 'MANUAL_ENTRY',
      deviceId: null,
      implausible: 0,
      originClass: 'PATIENT_REPORTED',
      confidence: 0.95,
      verificationState: 'UNVERIFIED',
      verifiedAt: null,
      verifiedBy: null,
      createdAt: now,
    })
    .execute();

  await db
    .insertInto('contradictions')
    .values({
      id: ulid(),
      tenantId,
      encounterId: DEMO_FIXTURES.currentEncounterId,
      kind: 'MEDICATION_DISCREPANCY',
      severity: 'HIGH',
      statementAJson: json({ text: 'Patient reports no current medications', originClass: 'PATIENT_REPORTED' }),
      statementBJson: json({ text: 'Metformin 500 mg BD on record since 2026-03-04', originClass: 'CLINICIAN_ENTERED' }),
      suggestion: 'Confirm whether metformin is still being taken.',
      resolutionState: 'OPEN',
      resolution: null,
      resolutionNote: null,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: now,
    })
    .execute();

  return { created: true };
}