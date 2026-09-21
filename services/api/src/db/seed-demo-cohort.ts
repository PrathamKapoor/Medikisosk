/**
 * Demo cohort seed: the wider synthetic OPD population around the Ramesh Kumar index case.
 *
 * Every row is synthetic, fixed and internally consistent. The centrepiece is Sunita Deshmukh's
 * three-visit diabetes story (diagnosis → control → current follow-up with a document-derived
 * lab awaiting clinician verification). Around her: a fever/cough case, an abdominal-pain case
 * with a recorded penicillin allergy, an in-consultation injury case and a completed routine
 * follow-up — so the queue, timeline, compare and admin surfaces all have real rows to show.
 *
 * Triage assessments are produced by the REAL deterministic engine (`evaluateTriage`) over the
 * seeded facts, never hand-written: the seed cannot claim a priority the rules would not give.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { ulid } from "ulid";
import {
  evaluateTriage,
  RULE_SET_VERSION,
  type RuleEvaluationInput,
} from "@medikiosk/safety-rules";
import type { AppConfig } from "../config/env";
import type { AppDatabase } from "./kysely";
import { demoDocumentByName } from "../documents/demo-docs";

const json = (value: unknown): string => JSON.stringify(value);

const SUNITA = "01JDEMO00000000000000011";
const SUNITA_V1 = "01JDEMO00000000000000012";
const SUNITA_V2 = "01JDEMO00000000000000013";
const SUNITA_V3 = "01JDEMO00000000000000014";
const AARAV = "01JDEMO00000000000000021";
const AARAV_VISIT = "01JDEMO00000000000000022";
const MEENA = "01JDEMO00000000000000031";
const MEENA_VISIT = "01JDEMO00000000000000032";
const JOSEPH = "01JDEMO00000000000000041";
const JOSEPH_VISIT = "01JDEMO00000000000000042";
const FATIMA = "01JDEMO00000000000000051";
const FATIMA_VISIT = "01JDEMO00000000000000052";

interface FactSet {
  symptoms: {
    code: string;
    display: string;
    severity?: string;
    durationDays?: number;
    text?: string;
  }[];
  medications: {
    code: string;
    name: string;
    frequency?: string;
    origin: string;
    verified?: boolean;
  }[];
  allergies: {
    code: string;
    name: string;
    reaction?: string;
    severity?: string;
  }[];
  vitals: { code: string; component?: string; value: number; unit: string }[];
  labs: {
    code: string;
    value: number;
    unit: string;
    flag: string;
    low?: number;
    high?: number;
  }[];
  conditions: { code: string | null; display: string; kind: string }[];
  documents: number;
}

function triageInput(facts: FactSet): RuleEvaluationInput {
  return {
    symptomCodes: facts.symptoms.map((s) => s.code),
    symptomFacts: facts.symptoms.map((s) => ({
      code: s.code,
      ...(s.severity ? { severity: s.severity as "MILD" } : {}),
      ...(s.durationDays === undefined ? {} : { durationDays: s.durationDays }),
      negated: false,
    })),
    vitalFacts: facts.vitals.map((v) => ({
      code: v.code,
      value: v.value,
      ...(v.component === "SYSTOLIC" || v.component === "DIASTOLIC"
        ? { componentCode: v.component as "SYSTOLIC" | "DIASTOLIC" }
        : {}),
    })),
    labFacts: facts.labs.map((l) => ({
      testCode: l.code,
      flag: l.flag as "HIGH",
      value: l.value,
    })),
    conditionCodes: facts.conditions
      .map((c) => c.code)
      .filter((c): c is string => c !== null),
    medicationCodes: facts.medications.map((m) => m.code),
    allergyCodes: facts.allergies.map((a) => a.code),
    answeredYesQuestionKeys: [],
    safetyCriticalUnresolvedQuestionKeys: [],
    documentCount: facts.documents,
  };
}

async function insertPatient(
  db: AppDatabase,
  tenantId: string,
  patient: {
    id: string;
    fullName: string;
    preferredName: string;
    dateOfBirth: string;
    ageYears: number;
    sex: string;
    phoneMasked: string;
    preferredLanguage: string;
  },
): Promise<boolean> {
  const present = await db
    .selectFrom("patients")
    .select("id")
    .where("id", "=", patient.id)
    .executeTakeFirst();
  if (present) return false;
  const now = new Date().toISOString();
  await db
    .insertInto("patients")
    .values({
      id: patient.id,
      tenantId,
      fullName: patient.fullName,
      preferredName: patient.preferredName,
      dateOfBirth: patient.dateOfBirth,
      dobAccuracy: "EXACT",
      ageYears: patient.ageYears,
      sex: patient.sex,
      pregnant: 0,
      phoneMasked: patient.phoneMasked,
      preferredLanguage: patient.preferredLanguage,
      district: "Pune",
      state: "Maharashtra",
      pinCode: "411001",
      guestRef: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .execute();
  return true;
}

async function insertEncounter(
  db: AppDatabase,
  tenantId: string,
  encounter: {
    id: string;
    patientId: string;
    status: string;
    complaints: string[];
    verbatim: string;
    locale: string;
    createdAt: string;
    submittedAt: string | null;
    confirmedAt: string | null;
    completedAt: string | null;
    disposition: string | null;
  },
): Promise<void> {
  const present = await db
    .selectFrom("encounters")
    .select("id")
    .where("id", "=", encounter.id)
    .executeTakeFirst();
  if (present) return;
  await db
    .insertInto("encounters")
    .values({
      id: encounter.id,
      tenantId,
      patientId: encounter.patientId,
      sessionId: null,
      encounterType: "OPD",
      status: encounter.status,
      chiefComplaintCodesJson: json(encounter.complaints),
      chiefComplaintVerbatim: encounter.verbatim,
      locale: encounter.locale,
      ayushMode: 0,
      questionnaireVersion: "1.0.0",
      pathwayVersion: "1.0.0",
      activePathwaysJson: json(["PATH-HISTORY-GENERAL"]),
      submittedAt: encounter.submittedAt,
      patientConfirmedAt: encounter.confirmedAt,
      completedAt: encounter.completedAt,
      disposition: encounter.disposition,
      dispositionBy: null,
      createdAt: encounter.createdAt,
      updatedAt: encounter.createdAt,
      deletedAt: null,
    })
    .execute();
  await db
    .insertInto("interview_sessions")
    .values({
      id: ulid(),
      tenantId,
      encounterId: encounter.id,
      patientId: encounter.patientId,
      kioskSessionId: "seeded-history",
      status: encounter.status === "COMPLETED" ? "COMPLETED" : "ACTIVE",
      pathwayKeysJson: json(["PATH-HISTORY-GENERAL"]),
      pathwayVersion: "1.0.0",
      runtimeVersion: "1.0.0",
      startedAt: encounter.createdAt,
      completedAt: encounter.confirmedAt,
      createdAt: encounter.createdAt,
      updatedAt: encounter.createdAt,
      deletedAt: null,
    })
    .execute();
}

async function insertFacts(
  db: AppDatabase,
  tenantId: string,
  patientId: string,
  encounterId: string,
  at: string,
  facts: FactSet,
  verified: boolean,
): Promise<void> {
  const state = verified ? "VERIFIED" : "UNVERIFIED";
  for (const symptom of facts.symptoms) {
    await db
      .insertInto("symptoms")
      .values({
        id: ulid(),
        tenantId,
        patientId,
        encounterId,
        conceptCode: symptom.code,
        displayName: symptom.display,
        patientText: symptom.text ?? null,
        onsetDate: null,
        durationValue: symptom.durationDays ?? null,
        durationUnit: symptom.durationDays === undefined ? null : "DAYS",
        durationVerbatim: null,
        durationApproximate: 0,
        severity: symptom.severity ?? null,
        severityVerbatim: null,
        certainty: "STATED",
        socratesJson: json({}),
        originClass: "PATIENT_REPORTED",
        confidence: 0.8,
        verificationState: state,
        verifiedAt: verified ? at : null,
        verifiedBy: null,
        createdAt: at,
        updatedAt: at,
      })
      .execute();
  }
  for (const medication of facts.medications) {
    await db
      .insertInto("medications")
      .values({
        id: ulid(),
        tenantId,
        patientId,
        encounterId,
        conceptCode: medication.code,
        asWrittenName: medication.name,
        strengthValue: null,
        strengthUnit: null,
        doseValue: null,
        doseUnit: null,
        frequency: medication.frequency ?? "UNKNOWN",
        route: "ORAL",
        durationDays: null,
        status: "CURRENT",
        startedOn: null,
        stoppedOn: null,
        isPrescribed: medication.origin === "CLINICIAN_ENTERED" ? 1 : 0,
        documentId: null,
        originClass: medication.origin,
        confidence: medication.origin === "CLINICIAN_ENTERED" ? 1 : 0.8,
        verificationState: medication.verified === false ? "UNVERIFIED" : state,
        verifiedAt: verified && medication.verified !== false ? at : null,
        verifiedBy: null,
        createdAt: at,
        updatedAt: at,
      })
      .execute();
  }
  for (const allergy of facts.allergies) {
    await db
      .insertInto("allergy_records")
      .values({
        id: ulid(),
        tenantId,
        patientId,
        encounterId,
        conceptCode: allergy.code,
        freeTextName: allergy.name,
        category: "DRUG",
        reactionText: allergy.reaction ?? null,
        severity: allergy.severity ?? "UNKNOWN",
        onsetDate: null,
        originClass: "PATIENT_REPORTED",
        confidence: 0.8,
        verificationState: "UNVERIFIED",
        verifiedAt: null,
        verifiedBy: null,
        createdAt: at,
      })
      .execute();
  }
  for (const vital of facts.vitals) {
    await db
      .insertInto("vitals")
      .values({
        id: ulid(),
        tenantId,
        patientId,
        encounterId,
        conceptCode: vital.code,
        componentCode: vital.component ?? null,
        value: vital.value,
        unit: vital.unit,
        measuredAt: at,
        source: "MANUAL_ENTRY",
        deviceId: null,
        implausible: 0,
        originClass: "PATIENT_REPORTED",
        confidence: 0.95,
        verificationState: state,
        verifiedAt: verified ? at : null,
        verifiedBy: null,
        createdAt: at,
      })
      .execute();
  }
  for (const lab of facts.labs) {
    await db
      .insertInto("lab_results")
      .values({
        id: ulid(),
        tenantId,
        patientId,
        encounterId,
        testCode: lab.code,
        value: lab.value,
        unit: lab.unit,
        referenceLow: lab.low ?? null,
        referenceHigh: lab.high ?? null,
        referenceSource: "MEDIKIOSK_DEFAULT",
        flag: lab.flag,
        implausible: 0,
        collectedAt: at,
        reportedAt: at,
        documentId: null,
        sourceComment: null,
        originClass: "DOCUMENT_DERIVED",
        confidence: 0.88,
        verificationState: state,
        verifiedAt: verified ? at : null,
        verifiedBy: null,
        createdAt: at,
      })
      .execute();
  }
  for (const condition of facts.conditions) {
    await db
      .insertInto("history_entries")
      .values({
        id: ulid(),
        tenantId,
        patientId,
        encounterId,
        kind: condition.kind,
        conceptCode: condition.code,
        displayName: condition.display,
        relation: null,
        onsetYear: null,
        resolvedYear: null,
        active: condition.kind === "CONDITION" ? 1 : null,
        controlled: null,
        procedureText: null,
        performedOn: null,
        facility: null,
        notes: null,
        originClass: "PATIENT_REPORTED",
        confidence: 0.8,
        verificationState: state,
        createdAt: at,
      })
      .execute();
  }
}

async function insertTrail(
  db: AppDatabase,
  tenantId: string,
  patientId: string,
  encounterId: string,
  facts: FactSet,
  trail: {
    submittedAt: string | null;
    completedAt: string | null;
    token: string | null;
    queueStatus: "WAITING" | "IN_CONSULTATION" | "COMPLETED" | null;
    calledAt?: string | null;
  },
): Promise<void> {
  const marker = `${encounterId}-trail`;
  const present = await db
    .selectFrom("timeline_events")
    .select("id")
    .where("encounterId", "=", encounterId)
    .where("eventType", "=", "COHORT_TRAIL")
    .executeTakeFirst();
  if (present) return;

  if (trail.submittedAt) {
    const assessment = evaluateTriage(triageInput(facts));
    await db
      .insertInto("triage_assessments")
      .values({
        id: ulid(),
        tenantId,
        encounterId,
        level: assessment.level,
        priority: assessment.priority,
        ruleSetVersion: RULE_SET_VERSION,
        requiresHumanReview: assessment.requiresHumanReview ? 1 : 0,
        explanation: assessment.explanation,
        hitsJson: json(
          assessment.hits.map((hit) => ({
            identifier: hit.ruleIdentifier,
            version: hit.ruleVersion,
            severity: hit.severity,
            action: hit.action,
            description: hit.description,
            clinicalRationale: hit.clinicalRationale,
            source: hit.source,
            evidenceRefs: hit.evidenceRefs,
            evidenceIds: [],
            advisoryOnly: hit.advisoryOnly,
          })),
        ),
        overriddenTo: null,
        overriddenBy: null,
        overrideReason: null,
        overriddenAt: null,
        assessedAt: trail.submittedAt,
      })
      .execute();
    await db
      .insertInto("timeline_events")
      .values({
        id: ulid(),
        tenantId,
        patientId,
        encounterId,
        eventType: "TRIAGE_ASSESSED",
        eventAt: trail.submittedAt,
        headline: `Triage assessed: ${assessment.level}`,
        detailJson: json({
          level: assessment.level,
          priority: assessment.priority,
        }),
        evidenceIdsJson: json([]),
        createdAt: trail.submittedAt,
      })
      .execute();
    await db
      .insertInto("timeline_events")
      .values({
        id: ulid(),
        tenantId,
        patientId,
        encounterId,
        eventType: "ENCOUNTER_SUBMITTED",
        eventAt: trail.submittedAt,
        headline: "Encounter submitted for review",
        detailJson: json({
          level: assessment.level,
          priority: assessment.priority,
        }),
        evidenceIdsJson: json([]),
        createdAt: trail.submittedAt,
      })
      .execute();
    if (trail.token && trail.queueStatus) {
      await db
        .insertInto("queue_entries")
        .values({
          id: ulid(),
          tenantId,
          encounterId,
          patientId,
          priority: assessment.priority,
          status: trail.queueStatus,
          reason: assessment.hits[0]?.description ?? "No rule fired",
          tokenNumber: trail.token,
          ruleIdentifiersJson: json(
            assessment.hits.map((hit) => hit.ruleIdentifier),
          ),
          enqueuedAt: trail.submittedAt,
          calledAt: trail.calledAt ?? null,
          completedAt: trail.completedAt,
          updatedAt: trail.completedAt ?? trail.submittedAt,
        })
        .execute();
    }
  }
  if (trail.completedAt) {
    await db
      .insertInto("timeline_events")
      .values({
        id: ulid(),
        tenantId,
        patientId,
        encounterId,
        eventType: "ENCOUNTER_COMPLETED",
        eventAt: trail.completedAt,
        headline: "Encounter completed",
        detailJson: json({}),
        evidenceIdsJson: json([]),
        createdAt: trail.completedAt,
      })
      .execute();
  }
  // Idempotency marker: a private event type the product never renders.
  await db
    .insertInto("timeline_events")
    .values({
      id: ulid(),
      tenantId,
      patientId,
      encounterId,
      eventType: "COHORT_TRAIL",
      eventAt:
        trail.completedAt ?? trail.submittedAt ?? new Date().toISOString(),
      headline: marker,
      detailJson: json({}),
      evidenceIdsJson: json([]),
      createdAt: new Date().toISOString(),
    })
    .execute();
}

async function insertNote(
  db: AppDatabase,
  tenantId: string,
  encounterId: string,
  authorName: string,
  note: string,
  at: string,
): Promise<void> {
  const present = await db
    .selectFrom("encounter_notes")
    .select("id")
    .where("encounterId", "=", encounterId)
    .where("note", "=", note)
    .executeTakeFirst();
  if (present) return;
  await db
    .insertInto("encounter_notes")
    .values({
      id: ulid(),
      tenantId,
      encounterId,
      authorId: "seeded",
      authorName,
      note,
      createdAt: at,
    })
    .execute();
}

async function insertDiagnosis(
  db: AppDatabase,
  tenantId: string,
  patientId: string,
  encounterId: string,
  diagnosis: { displayText: string; icd10Code: string; status: string },
  at: string,
): Promise<void> {
  const present = await db
    .selectFrom("diagnoses")
    .select("id")
    .where("encounterId", "=", encounterId)
    .where("displayText", "=", diagnosis.displayText)
    .executeTakeFirst();
  if (present) return;
  await db
    .insertInto("diagnoses")
    .values({
      id: ulid(),
      tenantId,
      patientId,
      encounterId,
      conceptCode: null,
      displayText: diagnosis.displayText,
      icd10Code: diagnosis.icd10Code,
      status: diagnosis.status,
      recordedAt: at,
      recordedBy: "seeded",
      originClass: "CLINICIAN_ENTERED",
      confidence: 1,
      verificationState: "VERIFIED",
      createdAt: at,
    })
    .execute();
}

/**
 * Sunita's current lab document: the fixture bytes on disk, a PATIENT_CONFIRMED document row,
 * one UNVERIFIED HbA1c entity with its evidence, and the DOCUMENT_DERIVED lab fact row. This is
 * exactly what the kiosk pipeline produces, so the doctor console can verify it live.
 */
async function seedSunitaDocument(
  db: AppDatabase,
  tenantId: string,
  config: AppConfig,
): Promise<void> {
  const present = await db
    .selectFrom("documents")
    .select("id")
    .where("tenantId", "=", tenantId)
    .where("encounterId", "=", SUNITA_V3)
    .executeTakeFirst();
  if (present) return;
  const fixture = demoDocumentByName("lab-report-sunita-demo.txt");
  if (!fixture)
    throw new Error("Sunita lab fixture is missing from DEMO_DOCUMENTS.");
  const bytes = Buffer.from(fixture.bytes);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const storageName = `${checksum}.txt`;
  await mkdir(config.MEDIKIOSK_UPLOAD_DIR, { recursive: true });
  await writeFile(join(config.MEDIKIOSK_UPLOAD_DIR, storageName), bytes);

  const at = "2026-09-17T10:12:00.000Z";
  const documentId = ulid();
  await db
    .insertInto("documents")
    .values({
      id: documentId,
      tenantId,
      patientId: SUNITA,
      encounterId: SUNITA_V3,
      documentType: "LAB_REPORT",
      mimeType: "text/plain",
      byteSize: bytes.length,
      pageCount: 1,
      storagePath: storageName,
      checksum,
      status: "PATIENT_CONFIRMED",
      qualityJson: json({
        originalName: fixture.name,
        ocrProvider: "mock-ocr",
        demoExtraction: true,
        issues: [],
      }),
      ocrConfidence: 0.99,
      uploadedAt: at,
      processedAt: at,
      createdAt: at,
      deletedAt: null,
    })
    .execute();
  await db
    .insertInto("document_pages")
    .values({
      id: ulid(),
      documentId,
      pageNumber: 1,
      ocrText: fixture.content,
      qualityScore: 0.99,
      createdAt: at,
    })
    .execute();

  const evidenceId = ulid();
  await db
    .insertInto("evidence")
    .values({
      id: evidenceId,
      tenantId,
      encounterId: SUNITA_V3,
      type: "DOCUMENT_ENTITY",
      originClass: "DOCUMENT_DERIVED",
      source: "document",
      sourceRef: documentId,
      rawValue: "HbA1c: 5.9 %",
      normalisedJson: json({ name: "HbA1c", value: 5.9, unit: "%" }),
      confidence: 0.88,
      language: "en-IN",
      capturedAt: at,
      createdBy: "seeded",
      verificationState: "UNVERIFIED",
      verifiedAt: null,
      verifiedBy: null,
      supersededBy: null,
    })
    .execute();
  const entityId = ulid();
  await db
    .insertInto("document_entities")
    .values({
      id: entityId,
      tenantId,
      documentId,
      kind: "LAB_RESULT",
      conceptCode: null,
      testCode: "MK-LAB-003",
      rawText: "HbA1c: 5.9 %",
      normalisedJson: json({ name: "HbA1c", value: 5.9, unit: "%" }),
      flag: null,
      confidence: 0.88,
      verificationState: "UNVERIFIED",
      needsClinicianReview: 1,
      evidenceId,
      verifiedAt: null,
      verifiedBy: null,
      createdAt: at,
      updatedAt: at,
    })
    .execute();
  await db
    .updateTable("evidence")
    .set({ sourceRef: entityId })
    .where("id", "=", evidenceId)
    .execute();
  await db
    .insertInto("lab_results")
    .values({
      id: ulid(),
      tenantId,
      patientId: SUNITA,
      encounterId: SUNITA_V3,
      testCode: "MK-LAB-003",
      value: 5.9,
      unit: "%",
      referenceLow: 4,
      referenceHigh: 5.7,
      referenceSource: "MEDIKIOSK_DEFAULT",
      flag: "HIGH",
      implausible: 0,
      collectedAt: at,
      reportedAt: at,
      documentId,
      sourceComment: null,
      originClass: "DOCUMENT_DERIVED",
      confidence: 0.88,
      verificationState: "UNVERIFIED",
      verifiedAt: null,
      verifiedBy: null,
      createdAt: at,
    })
    .execute();
}

/** Seed the cohort. Safe to re-run: every insert is guarded by an existence check. */
export async function seedDemoCohort(
  db: AppDatabase,
  tenantId: string,
  config: AppConfig,
): Promise<void> {
  // --- Sunita Deshmukh: the three-visit diabetes story -----------------------
  await insertPatient(db, tenantId, {
    id: SUNITA,
    fullName: "Sunita Deshmukh",
    preferredName: "Sunita",
    dateOfBirth: "1974-05-22",
    ageYears: 52,
    sex: "FEMALE",
    phoneMasked: "XXXXXX4418",
    preferredLanguage: "mr-IN",
  });
  await db
    .insertInto("allergy_status")
    .values({
      tenantId,
      patientId: SUNITA,
      status: "CONFIRMED_NO_KNOWN_ALLERGIES",
      recordedAt: "2025-06-10T09:00:00.000Z",
      recordedBy: null,
    })
    .execute()
    .catch(() => undefined);

  const sunitaV1: FactSet = {
    symptoms: [
      {
        code: "MK-SYM-054",
        display: "Excessive thirst",
        text: "bahut pyaas lagti hai",
      },
      { code: "MK-SYM-055", display: "Frequent urination" },
    ],
    medications: [
      {
        code: "MK-MED-001",
        name: "Tab Metformin 500 mg BD",
        frequency: "BD",
        origin: "CLINICIAN_ENTERED",
      },
    ],
    allergies: [],
    vitals: [
      { code: "MK-VIT-006", value: 186, unit: "mg/dL" },
      { code: "MK-VIT-008", value: 74, unit: "kg" },
    ],
    labs: [
      {
        code: "MK-LAB-003",
        value: 8.2,
        unit: "%",
        flag: "HIGH",
        low: 4,
        high: 5.7,
      },
      {
        code: "MK-LAB-004",
        value: 212,
        unit: "mg/dL",
        flag: "HIGH",
        high: 200,
      },
    ],
    conditions: [],
    documents: 0,
  };
  await insertEncounter(db, tenantId, {
    id: SUNITA_V1,
    patientId: SUNITA,
    status: "COMPLETED",
    complaints: ["MK-SYM-054", "MK-SYM-055"],
    verbatim: "bahut pyaas lagti hai, baar-baar peshab",
    locale: "mr-IN",
    createdAt: "2025-06-10T09:00:00.000Z",
    submittedAt: "2025-06-10T09:22:00.000Z",
    confirmedAt: "2025-06-10T09:20:00.000Z",
    completedAt: "2025-06-10T09:55:00.000Z",
    disposition: "FOLLOW_UP_OPD",
  });
  await insertFacts(
    db,
    tenantId,
    SUNITA,
    SUNITA_V1,
    "2025-06-10T09:05:00.000Z",
    sunitaV1,
    true,
  );
  await insertDiagnosis(
    db,
    tenantId,
    SUNITA,
    SUNITA_V1,
    {
      displayText: "Type 2 diabetes mellitus",
      icd10Code: "E11",
      status: "CONFIRMED",
    },
    "2025-06-10T09:50:00.000Z",
  );
  await insertNote(
    db,
    tenantId,
    SUNITA_V1,
    "Dr. Rao",
    "New diagnosis of type 2 diabetes. Started metformin 500 mg twice daily with diet counselling. Review HbA1c in three months.",
    "2025-06-10T09:52:00.000Z",
  );
  await insertTrail(db, tenantId, SUNITA, SUNITA_V1, sunitaV1, {
    submittedAt: "2025-06-10T09:22:00.000Z",
    completedAt: "2025-06-10T09:55:00.000Z",
    token: "A-002",
    queueStatus: "COMPLETED",
    calledAt: "2025-06-10T09:35:00.000Z",
  });

  const sunitaV2: FactSet = {
    symptoms: [
      { code: "MK-SYM-022", display: "Fatigue or weakness", severity: "MILD" },
    ],
    medications: [
      {
        code: "MK-MED-001",
        name: "Tab Metformin 500 mg BD",
        frequency: "BD",
        origin: "CLINICIAN_ENTERED",
      },
      {
        code: "MK-MED-011",
        name: "Tab Atorvastatin 10 mg HS",
        frequency: "HS",
        origin: "CLINICIAN_ENTERED",
      },
    ],
    allergies: [],
    vitals: [
      { code: "MK-VIT-006", value: 128, unit: "mg/dL" },
      { code: "MK-VIT-008", value: 71, unit: "kg" },
    ],
    labs: [
      {
        code: "MK-LAB-003",
        value: 5.6,
        unit: "%",
        flag: "NORMAL",
        low: 4,
        high: 5.7,
      },
      {
        code: "MK-LAB-004",
        value: 178,
        unit: "mg/dL",
        flag: "NORMAL",
        high: 200,
      },
    ],
    conditions: [
      {
        code: "MK-CON-001",
        display: "Type 2 diabetes mellitus",
        kind: "CONDITION",
      },
    ],
    documents: 0,
  };
  await insertEncounter(db, tenantId, {
    id: SUNITA_V2,
    patientId: SUNITA,
    status: "COMPLETED",
    complaints: ["MK-SYM-022"],
    verbatim: "thakaan rehta hai",
    locale: "mr-IN",
    createdAt: "2025-12-08T10:00:00.000Z",
    submittedAt: "2025-12-08T10:18:00.000Z",
    confirmedAt: "2025-12-08T10:16:00.000Z",
    completedAt: "2025-12-08T10:40:00.000Z",
    disposition: "FOLLOW_UP_OPD",
  });
  await insertFacts(
    db,
    tenantId,
    SUNITA,
    SUNITA_V2,
    "2025-12-08T10:05:00.000Z",
    sunitaV2,
    true,
  );
  await insertNote(
    db,
    tenantId,
    SUNITA_V2,
    "Dr. Rao",
    "HbA1c at goal on metformin. Added atorvastatin for lipids. Continue current plan, annual eye and foot review.",
    "2025-12-08T10:38:00.000Z",
  );
  await insertTrail(db, tenantId, SUNITA, SUNITA_V2, sunitaV2, {
    submittedAt: "2025-12-08T10:18:00.000Z",
    completedAt: "2025-12-08T10:40:00.000Z",
    token: "A-003",
    queueStatus: "COMPLETED",
    calledAt: "2025-12-08T10:25:00.000Z",
  });

  const sunitaV3: FactSet = {
    symptoms: [
      { code: "MK-SYM-022", display: "Fatigue or weakness", severity: "MILD" },
    ],
    medications: [
      {
        code: "MK-MED-001",
        name: "Tab Metformin 500 mg BD",
        frequency: "BD",
        origin: "PATIENT_REPORTED",
      },
      {
        code: "MK-MED-011",
        name: "Tab Atorvastatin 10 mg HS",
        frequency: "HS",
        origin: "PATIENT_REPORTED",
      },
    ],
    allergies: [],
    vitals: [
      { code: "MK-VIT-006", value: 141, unit: "mg/dL" },
      { code: "MK-VIT-004", value: 97, unit: "%" },
    ],
    labs: [],
    conditions: [
      {
        code: "MK-CON-001",
        display: "Type 2 diabetes mellitus",
        kind: "CONDITION",
      },
    ],
    documents: 1,
  };
  await insertEncounter(db, tenantId, {
    id: SUNITA_V3,
    patientId: SUNITA,
    status: "SUBMITTED",
    complaints: ["MK-SYM-022"],
    verbatim: "sugar check karwana hai",
    locale: "mr-IN",
    createdAt: "2026-09-17T10:00:00.000Z",
    submittedAt: "2026-09-17T10:20:00.000Z",
    confirmedAt: "2026-09-17T10:18:00.000Z",
    completedAt: null,
    disposition: null,
  });
  await insertFacts(
    db,
    tenantId,
    SUNITA,
    SUNITA_V3,
    "2026-09-17T10:05:00.000Z",
    sunitaV3,
    false,
  );
  await seedSunitaDocument(db, tenantId, config);
  await insertTrail(
    db,
    tenantId,
    SUNITA,
    SUNITA_V3,
    {
      ...sunitaV3,
      labs: [
        {
          code: "MK-LAB-003",
          value: 5.9,
          unit: "%",
          flag: "HIGH",
          low: 4,
          high: 5.7,
        },
      ],
    },
    {
      submittedAt: "2026-09-17T10:20:00.000Z",
      completedAt: null,
      token: "A-004",
      queueStatus: "WAITING",
    },
  );

  // --- Aarav Patel: fever with cough ------------------------------------------------
  await insertPatient(db, tenantId, {
    id: AARAV,
    fullName: "Aarav Patel",
    preferredName: "Aarav",
    dateOfBirth: "1997-11-02",
    ageYears: 29,
    sex: "MALE",
    phoneMasked: "XXXXXX7721",
    preferredLanguage: "en-IN",
  });
  const aaravFacts: FactSet = {
    symptoms: [
      {
        code: "MK-SYM-020",
        display: "Fever",
        severity: "MODERATE",
        durationDays: 3,
        text: "three days fever",
      },
      {
        code: "MK-SYM-007",
        display: "Cough",
        severity: "MILD",
        durationDays: 3,
      },
      { code: "MK-SYM-010", display: "Sore throat", severity: "MILD" },
    ],
    medications: [
      {
        code: "MK-MED-017",
        name: "Paracetamol 650 mg",
        frequency: "SOS",
        origin: "PATIENT_REPORTED",
      },
    ],
    allergies: [],
    vitals: [
      { code: "MK-VIT-003", value: 38.6, unit: "Cel" },
      { code: "MK-VIT-002", value: 98, unit: "beats/min" },
      // Low saturation: the deterministic engine raises HYPOXIA_001 (RED), so the demo
      // queue carries a genuine urgent case for the doctor console.
      { code: "MK-VIT-004", value: 91, unit: "%" },
    ],
    labs: [],
    conditions: [],
    documents: 0,
  };
  await insertEncounter(db, tenantId, {
    id: AARAV_VISIT,
    patientId: AARAV,
    status: "SUBMITTED",
    complaints: ["MK-SYM-020", "MK-SYM-007"],
    verbatim: "three days fever with cough",
    locale: "en-IN",
    createdAt: "2026-09-17T09:30:00.000Z",
    submittedAt: "2026-09-17T09:48:00.000Z",
    confirmedAt: "2026-09-17T09:46:00.000Z",
    completedAt: null,
    disposition: null,
  });
  await insertFacts(
    db,
    tenantId,
    AARAV,
    AARAV_VISIT,
    "2026-09-17T09:32:00.000Z",
    aaravFacts,
    false,
  );
  await insertTrail(db, tenantId, AARAV, AARAV_VISIT, aaravFacts, {
    submittedAt: "2026-09-17T09:48:00.000Z",
    completedAt: null,
    token: "A-005",
    queueStatus: "WAITING",
  });

  // --- Meena Iyer: abdominal pain with a recorded penicillin allergy -----------------
  await insertPatient(db, tenantId, {
    id: MEENA,
    fullName: "Meena Iyer",
    preferredName: "Meena",
    dateOfBirth: "1972-02-08",
    ageYears: 54,
    sex: "FEMALE",
    phoneMasked: "XXXXXX9034",
    preferredLanguage: "en-IN",
  });
  const meenaFacts: FactSet = {
    symptoms: [
      {
        code: "MK-SYM-040",
        display: "Abdominal pain",
        severity: "MODERATE",
        durationDays: 2,
      },
      { code: "MK-SYM-041", display: "Vomiting", severity: "MILD" },
    ],
    medications: [],
    allergies: [
      {
        code: "MK-ALG-001",
        name: "Penicillin",
        reaction: "rash",
        severity: "MODERATE",
      },
    ],
    vitals: [
      { code: "MK-VIT-001", component: "SYSTOLIC", value: 142, unit: "mmHg" },
      { code: "MK-VIT-001", component: "DIASTOLIC", value: 90, unit: "mmHg" },
      { code: "MK-VIT-002", value: 88, unit: "beats/min" },
    ],
    labs: [],
    conditions: [
      { code: "MK-CON-003", display: "Hypertension", kind: "CONDITION" },
    ],
    documents: 0,
  };
  await insertEncounter(db, tenantId, {
    id: MEENA_VISIT,
    patientId: MEENA,
    status: "SUBMITTED",
    complaints: ["MK-SYM-040"],
    verbatim: "stomach pain since two days with vomiting",
    locale: "en-IN",
    createdAt: "2026-09-17T09:05:00.000Z",
    submittedAt: "2026-09-17T09:27:00.000Z",
    confirmedAt: "2026-09-17T09:25:00.000Z",
    completedAt: null,
    disposition: null,
  });
  await insertFacts(
    db,
    tenantId,
    MEENA,
    MEENA_VISIT,
    "2026-09-17T09:07:00.000Z",
    meenaFacts,
    false,
  );
  await insertTrail(db, tenantId, MEENA, MEENA_VISIT, meenaFacts, {
    submittedAt: "2026-09-17T09:27:00.000Z",
    completedAt: null,
    token: "A-006",
    queueStatus: "WAITING",
  });

  // --- Joseph D'Souza: back pain after a fall, currently being seen ------------------
  await insertPatient(db, tenantId, {
    id: JOSEPH,
    fullName: "Joseph D'Souza",
    preferredName: "Joseph",
    dateOfBirth: "1984-08-19",
    ageYears: 42,
    sex: "MALE",
    phoneMasked: "XXXXXX5560",
    preferredLanguage: "en-IN",
  });
  const josephFacts: FactSet = {
    symptoms: [
      {
        code: "MK-SYM-062",
        display: "Back pain",
        severity: "SEVERE",
        text: "fell from a ladder at work",
      },
    ],
    medications: [
      {
        code: "MK-MED-018",
        name: "Ibuprofen 400 mg",
        frequency: "SOS",
        origin: "PATIENT_REPORTED",
      },
    ],
    allergies: [],
    vitals: [
      { code: "MK-VIT-002", value: 76, unit: "beats/min" },
      { code: "MK-VIT-004", value: 99, unit: "%" },
    ],
    labs: [],
    conditions: [],
    documents: 0,
  };
  await insertEncounter(db, tenantId, {
    id: JOSEPH_VISIT,
    patientId: JOSEPH,
    status: "SUBMITTED",
    complaints: ["MK-SYM-062"],
    verbatim: "fell from a ladder at work, back pain",
    locale: "en-IN",
    createdAt: "2026-09-17T08:40:00.000Z",
    submittedAt: "2026-09-17T08:55:00.000Z",
    confirmedAt: "2026-09-17T08:53:00.000Z",
    completedAt: null,
    disposition: null,
  });
  await insertFacts(
    db,
    tenantId,
    JOSEPH,
    JOSEPH_VISIT,
    "2026-09-17T08:42:00.000Z",
    josephFacts,
    false,
  );
  await insertTrail(db, tenantId, JOSEPH, JOSEPH_VISIT, josephFacts, {
    submittedAt: "2026-09-17T08:55:00.000Z",
    completedAt: null,
    token: "A-007",
    queueStatus: "IN_CONSULTATION",
    calledAt: "2026-09-17T09:10:00.000Z",
  });

  // --- Fatima Sheikh: completed routine follow-up ------------------------------------
  await insertPatient(db, tenantId, {
    id: FATIMA,
    fullName: "Fatima Sheikh",
    preferredName: "Fatima",
    dateOfBirth: "1988-04-30",
    ageYears: 38,
    sex: "FEMALE",
    phoneMasked: "XXXXXX2289",
    preferredLanguage: "hi-IN",
  });
  const fatimaFacts: FactSet = {
    symptoms: [
      {
        code: "MK-SYM-030",
        display: "Headache",
        severity: "MILD",
        durationDays: 1,
      },
    ],
    medications: [],
    allergies: [],
    vitals: [
      { code: "MK-VIT-001", component: "SYSTOLIC", value: 118, unit: "mmHg" },
      { code: "MK-VIT-001", component: "DIASTOLIC", value: 76, unit: "mmHg" },
      { code: "MK-VIT-002", value: 72, unit: "beats/min" },
    ],
    labs: [],
    conditions: [],
    documents: 0,
  };
  await insertEncounter(db, tenantId, {
    id: FATIMA_VISIT,
    patientId: FATIMA,
    status: "COMPLETED",
    complaints: ["MK-SYM-030"],
    verbatim: "halka sar dard",
    locale: "hi-IN",
    createdAt: "2026-09-16T11:00:00.000Z",
    submittedAt: "2026-09-16T11:15:00.000Z",
    confirmedAt: "2026-09-16T11:13:00.000Z",
    completedAt: "2026-09-16T11:40:00.000Z",
    disposition: "DISCHARGE_HOME",
  });
  await insertFacts(
    db,
    tenantId,
    FATIMA,
    FATIMA_VISIT,
    "2026-09-16T11:02:00.000Z",
    fatimaFacts,
    true,
  );
  await insertTrail(db, tenantId, FATIMA, FATIMA_VISIT, fatimaFacts, {
    submittedAt: "2026-09-16T11:15:00.000Z",
    completedAt: "2026-09-16T11:40:00.000Z",
    token: "A-008",
    queueStatus: "COMPLETED",
    calledAt: "2026-09-16T11:20:00.000Z",
  });
}
