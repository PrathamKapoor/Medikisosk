/**
 * Interview runtime — state repository.
 *
 * Loads the interview input the engine reasons over FROM the persisted clinical record and
 * persists responses, evidence and fact rows. One hard rule (ADR-012/ADR-005): an evidence row is
 * always written before the fact row (or socrates slot) that references it, inside the same
 * transaction.
 *
 * The interview's clinical state is derived, never stored in a redundant column: responses,
 * symptoms, medications, allergies, history_entries and evidence are the source of truth and the
 * next-question / completion / triage are pure functions of them. `interview_sessions` only anchors
 * lifecycle bookkeeping and the pathway/runtime versions.
 */

import { ulid } from "ulid";
import { errors } from "@medikiosk/shared-types";
import { conceptByCode, CONCEPT_INDEX } from "@medikiosk/clinical-schema";
import type {
  FactDelta,
  InterviewInput,
  ResponseOutcome,
  SymptomFact,
} from "@medikiosk/interview-engine";
import type { TriageAssessmentResult } from "@medikiosk/safety-rules";
import type { AppDatabase } from "../db/kysely";
import type { PatientRow } from "../db/schema";
import type { EncounterRow } from "../db/tables";
import type {
  AllergyRecordRow,
  HistoryRow,
  InterviewSessionRow,
  MedicationRow,
  QuestionnaireResponseRow,
  SymptomRow,
  VitalRow,
} from "../db/tables-clinical";
import type { TriageAssessmentRow, LabResultRow, DocumentRow } from "../db/tables-evidence";

const PATIENT_REPORTED = "PATIENT_REPORTED";
const UNVERIFIED = "UNVERIFIED";
const QUESTIONNAIRE_RESPONSE = "QUESTIONNAIRE_RESPONSE";
const QSOURCE = "questionnaire_response";

/** A fully-loaded interview: the encounter, its patient, and the derived engine input. */
export interface LoadedInterview {
  readonly encounter: EncounterRow;
  readonly patient: PatientRow;
  readonly interviewSession: InterviewSessionRow;
  /** The derived engine input (pure function of the persisted history). */
  readonly input: InterviewInput;
  readonly responses: readonly QuestionnaireResponseRow[];
  readonly symptoms: readonly SymptomRow[];
  readonly conditions: readonly HistoryRow[];
  readonly medications: readonly MedicationRow[];
  readonly allergies: readonly AllergyRecordRow[];
  readonly vitals: readonly VitalRow[];
  readonly labResults: readonly LabResultRow[];
  readonly documents: readonly DocumentRow[];
  readonly latestTriage: TriageAssessmentRow | undefined;
}

function parseJsonArray<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

/** Map a persisted symptom row to the engine's immutable SymptomFact. */
function symptomFact(row: SymptomRow): SymptomFact {
  let socrates: SymptomFact["socrates"] = {};
  if (row.socratesJson) {
    try {
      const parsed = JSON.parse(row.socratesJson) as Record<string, unknown>;
      socrates = parsed as SymptomFact["socrates"];
    } catch {
      socrates = {};
    }
  }
  const severity =
    row.severity === null
      ? null
      : (row.severity as
          "NONE" | "MILD" | "MODERATE" | "SEVERE" | "VERY_SEVERE" | "UNKNOWN");
  return {
    conceptCode: row.conceptCode,
    severity,
    onsetDate: row.onsetDate,
    durationDays: row.durationValue ?? null,
    socrates,
  };
}

function allergyCategoryOf(
  rows: readonly AllergyRecordRow[],
): InterviewInput["allergyCategories"] {
  const categories = new Set<InterviewInput["allergyCategories"][number]>();
  for (const row of rows) {
    const c = row.category;
    if (c === "DRUG" || c === "FOOD" || c === "ENVIRONMENTAL" || c === "OTHER")
      categories.add(c);
  }
  return [...categories];
}

/** Load a single encounter scoped to the tenant, throwing NOT_FOUND when absent. */
export async function loadEncounter(
  db: AppDatabase,
  tenantId: string,
  encounterId: string,
): Promise<EncounterRow> {
  const encounter = await db
    .selectFrom("encounters")
    .selectAll()
    .where("id", "=", encounterId)
    .where("tenantId", "=", tenantId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!encounter) throw errors.notFound("Encounter");
  return encounter;
}

/** Load the full interview state and build the engine input for an encounter. */
export async function loadInterview(
  db: AppDatabase,
  tenantId: string,
  encounterId: string,
): Promise<LoadedInterview> {
  const encounter = await loadEncounter(db, tenantId, encounterId);
  const interviewSession = await db
    .selectFrom("interview_sessions")
    .selectAll()
    .where("encounterId", "=", encounterId)
    .where("tenantId", "=", tenantId)
    .where("deletedAt", "is", null)
    .orderBy("createdAt", "desc")
    .orderBy("id", "desc")
    .executeTakeFirstOrThrow();
  const patient = await db
    .selectFrom("patients")
    .selectAll()
    .where("id", "=", encounter.patientId)
    .where("tenantId", "=", tenantId)
    .where("deletedAt", "is", null)
    .executeTakeFirstOrThrow();

  const [responses, symptoms, conditions, medications, allergies, vitals, labResults, documents] =
    await Promise.all([
      db
        .selectFrom("questionnaire_responses")
        .selectAll()
        .where("encounterId", "=", encounterId)
        .where("tenantId", "=", tenantId)
        .orderBy("createdAt", "asc")
        .orderBy("id", "asc")
        .execute(),
      db
        .selectFrom("symptoms")
        .selectAll()
        .where("encounterId", "=", encounterId)
        .where("tenantId", "=", tenantId)
        .execute(),
      db
        .selectFrom("history_entries")
        .selectAll()
        .where("encounterId", "=", encounterId)
        .where("tenantId", "=", tenantId)
        .execute(),
      db
        .selectFrom("medications")
        .selectAll()
        .where("encounterId", "=", encounterId)
        .where("tenantId", "=", tenantId)
        .execute(),
      db
        .selectFrom("allergy_records")
        .selectAll()
        .where("encounterId", "=", encounterId)
        .where("tenantId", "=", tenantId)
        .execute(),
      db
        .selectFrom("vitals")
        .selectAll()
        .where("encounterId", "=", encounterId)
        .where("tenantId", "=", tenantId)
        .orderBy("measuredAt", "desc")
        .execute(),
      db
        .selectFrom("lab_results")
        .selectAll()
        .where("encounterId", "=", encounterId)
        .where("tenantId", "=", tenantId)
        .execute(),
      db
        .selectFrom("documents")
        .selectAll()
        .where("encounterId", "=", encounterId)
        .where("tenantId", "=", tenantId)
        .where("deletedAt", "is", null)
        .execute(),
    ]);

  const input: InterviewInput = {
    complaints: parseJsonArray<string>(encounter.chiefComplaintCodesJson),
    patient: {
      ...(patient.ageYears === null ? {} : { ageYears: patient.ageYears }),
      ...(patient.sex === null
        ? {}
        : {
            sex:
              patient.sex === "MALE" ||
              patient.sex === "FEMALE" ||
              patient.sex === "OTHER"
                ? patient.sex
                : undefined,
          }),
      ...(patient.pregnant === null
        ? {}
        : { pregnant: patient.pregnant === 1 }),
    },
    responses: responses.map((row): InterviewInput["responses"][number] => ({
      questionKey: row.questionKey,
      pathwayKey: row.pathwayKey,
      kind: row.kind as InterviewInput["responses"][number]["kind"],
      category: row.category as InterviewInput["responses"][number]["category"],
      state: row.state as InterviewInput["responses"][number]["state"],
      rawAnswer: row.rawAnswer,
      normalisedJson: row.normalisedJson
        ? JSON.parse(row.normalisedJson)
        : null,
      confidence: row.confidence,
      askCount: row.askCount,
      answeredAt: row.answeredAt ?? row.createdAt,
    })),
    symptomFacts: symptoms.map(symptomFact),
    conditionCodes: conditions
      .filter((c) => c.kind === "CONDITION" && c.conceptCode)
      .map((c) => c.conceptCode as string),
    medicationCodes: medications
      .filter((m) => m.conceptCode)
      .map((m) => m.conceptCode as string),
    allergyCategories: allergyCategoryOf(allergies),
    vitals: vitalsFactsOf(vitals),
    labFlaggedHigh: labResults
      .filter((l) => l.flag === "HIGH" || l.flag === "CRITICAL_HIGH")
      .map((l) => l.testCode),
    labFlaggedLow: labResults
      .filter((l) => l.flag === "LOW" || l.flag === "CRITICAL_LOW")
      .map((l) => l.testCode),
    documentCount: documents.length,
  };

  const latestTriage = await db
    .selectFrom("triage_assessments")
    .selectAll()
    .where("encounterId", "=", encounterId)
    .where("tenantId", "=", tenantId)
    .orderBy("assessedAt", "desc")
    .orderBy("id", "desc")
    .executeTakeFirst();

  return {
    encounter,
    patient,
    interviewSession,
    input,
    responses,
    symptoms,
    conditions,
    medications,
    allergies,
    vitals,
    labResults,
    documents,
    latestTriage,
  };
}

/**
 * Map vital rows into the engine's `vitals` map (code → latest value). Blood pressure is keyed by
 * component so systolic and diastolic stay separate; other vitals use their plain code. Rows are
 * ordered measuredAt desc, so the first row per key is the most recent reading.
 */
function vitalsFactsOf(rows: readonly VitalRow[]): InterviewInput["vitals"] {
  const latest = new Map<string, number>();
  for (const row of rows) {
    const key =
      row.conceptCode === "MK-VIT-001" && row.componentCode
        ? `MK-VIT-001.${row.componentCode}`
        : row.conceptCode;
    if (!latest.has(key)) latest.set(key, row.value);
  }
  return Object.fromEntries(latest);
}

/** Create the encounter and its interview session row atomically. */
export async function createEncounterAndSession(
  db: AppDatabase,
  args: {
    tenantId: string;
    patientId: string;
    kioskSessionId: string;
    encounterType: string;
    chiefComplaintCodes: readonly string[];
    chiefComplaintVerbatim: string | null;
    locale: string;
    ayushMode: boolean;
    questionnaireVersion: string;
    pathwayVersion: string;
    runtimeVersion: string;
    activePathwayKeys: readonly string[];
    now: string;
  },
): Promise<{ encounterId: string; interviewSessionId: string }> {
  const encounterId = ulid();
  const interviewSessionId = ulid();
  const now = args.now;
  await db
    .insertInto("encounters")
    .values({
      id: encounterId,
      tenantId: args.tenantId,
      patientId: args.patientId,
      sessionId: args.kioskSessionId,
      encounterType: args.encounterType,
      status: "IN_PROGRESS",
      chiefComplaintCodesJson: JSON.stringify(args.chiefComplaintCodes),
      chiefComplaintVerbatim: args.chiefComplaintVerbatim,
      locale: args.locale,
      ayushMode: args.ayushMode ? 1 : 0,
      questionnaireVersion: args.questionnaireVersion,
      pathwayVersion: args.pathwayVersion,
      activePathwaysJson: JSON.stringify(args.activePathwayKeys),
      submittedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .execute();
  await db
    .insertInto("interview_sessions")
    .values({
      id: interviewSessionId,
      tenantId: args.tenantId,
      encounterId,
      patientId: args.patientId,
      kioskSessionId: args.kioskSessionId,
      status: "ACTIVE",
      pathwayKeysJson: JSON.stringify(args.activePathwayKeys),
      pathwayVersion: args.pathwayVersion,
      runtimeVersion: args.runtimeVersion,
      startedAt: now,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .execute();
  return { encounterId, interviewSessionId };
}

/** Insert a questionnaire response row (append-only; the raw answer is immutable). */
export async function insertResponseRow(
  db: AppDatabase,
  args: {
    tenantId: string;
    encounterId: string;
    questionKey: string;
    pathwayKey: string;
    kind: string;
    category: string;
    state: string;
    modality: string;
    rawAnswer: string | null;
    normalisedJson: unknown | null;
    confidence: number | null;
    language: string | null;
    codeMixed: boolean;
    negated: boolean;
    uncertain: boolean;
    askCount: number;
    hintMismatch: boolean;
    answeredAt: string;
    createdAt: string;
  },
): Promise<string> {
  const id = ulid();
  await db
    .insertInto("questionnaire_responses")
    .values({
      id,
      tenantId: args.tenantId,
      encounterId: args.encounterId,
      questionKey: args.questionKey,
      pathwayKey: args.pathwayKey,
      kind: args.kind,
      category: args.category,
      state: args.state,
      modality: args.modality,
      rawAnswer: args.rawAnswer,
      normalisedJson: args.normalisedJson
        ? JSON.stringify(args.normalisedJson)
        : null,
      confidence: args.confidence,
      language: args.language,
      codeMixed: args.codeMixed ? 1 : 0,
      negated: args.negated ? 1 : 0,
      uncertain: args.uncertain ? 1 : 0,
      askCount: args.askCount,
      hintMismatch: args.hintMismatch ? 1 : 0,
      answeredAt: args.answeredAt,
      createdAt: args.createdAt,
    })
    .execute();
  return id;
}

/** Insert the single evidence row backing the answered response. */
export async function insertEvidenceRow(
  db: AppDatabase,
  args: {
    tenantId: string;
    encounterId: string;
    responseId: string;
    rawValue: string | null;
    normalisedJson: unknown | null;
    confidence: number | null;
    language: string | null;
    createdBy: string | null;
    capturedAt: string;
  },
): Promise<string> {
  const id = ulid();
  await db
    .insertInto("evidence")
    .values({
      id,
      tenantId: args.tenantId,
      encounterId: args.encounterId,
      type: QUESTIONNAIRE_RESPONSE,
      originClass: PATIENT_REPORTED,
      source: QSOURCE,
      sourceRef: args.responseId,
      rawValue: args.rawValue,
      normalisedJson: args.normalisedJson
        ? JSON.stringify(args.normalisedJson)
        : null,
      confidence: args.confidence ?? 0,
      language: args.language,
      capturedAt: args.capturedAt,
      createdBy: args.createdBy,
      verificationState: UNVERIFIED,
      verifiedAt: null,
      verifiedBy: null,
      supersededBy: null,
    })
    .execute();
  return id;
}

/**
 * Build the socrates slot object for an answered symptom fact.
 */
function socratesSlot(
  delta: FactDelta,
  outcome: ResponseOutcome,
  evidenceId: string,
  askCount: number,
): {
  dimension: string;
  state: string;
  answerJson: unknown;
  evidenceIds: readonly string[];
  askCount: number;
} {
  return {
    dimension: delta.socratesDimension as string,
    state: outcome.state,
    answerJson: outcome.normalisedJson,
    evidenceIds: [evidenceId],
    askCount,
  };
}

/** Upsert a symptom row per (tenantId, encounterId, conceptCode), merging characterisation. */
async function upsertSymptom(
  db: AppDatabase,
  args: {
    tenantId: string;
    patientId: string;
    encounterId: string;
    conceptCode: string;
    displayName: string;
    delta: FactDelta;
    outcome: ResponseOutcome;
    evidenceId: string;
    askCount: number;
    now: string;
  },
): Promise<void> {
  const existing = await db
    .selectFrom("symptoms")
    .selectAll()
    .where("tenantId", "=", args.tenantId)
    .where("encounterId", "=", args.encounterId)
    .where("conceptCode", "=", args.conceptCode)
    .executeTakeFirst();

  if (!existing) {
    await db
      .insertInto("symptoms")
      .values({
        id: ulid(),
        tenantId: args.tenantId,
        patientId: args.patientId,
        encounterId: args.encounterId,
        conceptCode: args.conceptCode,
        displayName: args.displayName,
        patientText: args.delta.rawAnswer,
        onsetDate: args.delta.onsetDate ?? null,
        durationValue: args.delta.durationDays ?? null,
        durationUnit: null,
        durationVerbatim: null,
        durationApproximate: 0,
        severity: args.delta.severity ?? null,
        severityVerbatim: null,
        certainty: args.delta.negated ? "NEGATED" : "STATED",
        socratesJson: args.delta.socratesDimension
          ? JSON.stringify({
              [args.delta.socratesDimension]: socratesSlot(
                args.delta,
                args.outcome,
                args.evidenceId,
                args.askCount,
              ),
            })
          : "{}",
        originClass: PATIENT_REPORTED,
        confidence: args.delta.confidence,
        verificationState: UNVERIFIED,
        verifiedAt: null,
        verifiedBy: null,
        createdAt: args.now,
        updatedAt: args.now,
      })
      .execute();
    return;
  }

  let socrates: Record<string, unknown>;
  try {
    socrates = existing.socratesJson ? JSON.parse(existing.socratesJson) : {};
  } catch {
    socrates = {};
  }
  if (args.delta.socratesDimension) {
    socrates[args.delta.socratesDimension] = socratesSlot(
      args.delta,
      args.outcome,
      args.evidenceId,
      args.askCount,
    );
  }
  await db
    .updateTable("symptoms")
    .set({
      ...(args.delta.onsetDate && !existing.onsetDate
        ? { onsetDate: args.delta.onsetDate }
        : {}),
      ...(args.delta.durationDays !== undefined &&
      existing.durationValue === null
        ? { durationValue: args.delta.durationDays }
        : {}),
      ...(args.delta.severity && !existing.severity
        ? { severity: args.delta.severity }
        : {}),
      ...(args.delta.negated ? { certainty: "NEGATED" } : {}),
      socratesJson: JSON.stringify(socrates),
      updatedAt: args.now,
    })
    .where("id", "=", existing.id)
    .where("tenantId", "=", args.tenantId)
    .execute();
}

/** Persist condition/history facts to history_entries. */
async function upsertHistoryEntry(
  db: AppDatabase,
  args: {
    tenantId: string;
    patientId: string;
    encounterId: string;
    kind: string;
    delta: FactDelta;
    now: string;
  },
): Promise<void> {
  const existing = await db
    .selectFrom("history_entries")
    .selectAll()
    .where("tenantId", "=", args.tenantId)
    .where("encounterId", "=", args.encounterId)
    .where("conceptCode", "=", args.delta.conceptCode)
    .where("kind", "=", args.kind)
    .executeTakeFirst();
  if (existing) return;
  await db
    .insertInto("history_entries")
    .values({
      id: ulid(),
      tenantId: args.tenantId,
      patientId: args.patientId,
      encounterId: args.encounterId,
      kind: args.kind,
      conceptCode: args.delta.conceptCode,
      displayName: args.delta.displayName,
      relation: null,
      onsetYear: args.delta.onsetDate
        ? Number.parseInt(args.delta.onsetDate.slice(0, 4), 10) || null
        : null,
      resolvedYear: null,
      active: null,
      controlled: null,
      procedureText: null,
      performedOn: null,
      facility: null,
      notes: null,
      originClass: PATIENT_REPORTED,
      confidence: args.delta.confidence,
      verificationState: UNVERIFIED,
      createdAt: args.now,
    })
    .execute();
}

/** Persist a medication fact to medications. */
async function upsertMedication(
  db: AppDatabase,
  args: {
    tenantId: string;
    patientId: string;
    encounterId: string;
    delta: FactDelta;
    now: string;
  },
): Promise<void> {
  const existing = await db
    .selectFrom("medications")
    .selectAll()
    .where("tenantId", "=", args.tenantId)
    .where("encounterId", "=", args.encounterId)
    .where("conceptCode", "=", args.delta.conceptCode)
    .executeTakeFirst();
  if (existing) return;
  await db
    .insertInto("medications")
    .values({
      id: ulid(),
      tenantId: args.tenantId,
      patientId: args.patientId,
      encounterId: args.encounterId,
      conceptCode: args.delta.conceptCode,
      asWrittenName: args.delta.rawAnswer,
      strengthValue: null,
      strengthUnit: null,
      doseValue: null,
      doseUnit: null,
      frequency: "",
      route: "",
      durationDays: null,
      status: "CURRENT",
      startedOn: null,
      stoppedOn: null,
      isPrescribed: 0,
      documentId: null,
      originClass: PATIENT_REPORTED,
      confidence: args.delta.confidence,
      verificationState: UNVERIFIED,
      verifiedAt: null,
      verifiedBy: null,
      createdAt: args.now,
      updatedAt: args.now,
    })
    .execute();
}

/** Persist an allergy fact to allergy_records. */
async function upsertAllergy(
  db: AppDatabase,
  args: {
    tenantId: string;
    patientId: string;
    encounterId: string;
    delta: FactDelta;
    now: string;
  },
): Promise<void> {
  const existing = await db
    .selectFrom("allergy_records")
    .selectAll()
    .where("tenantId", "=", args.tenantId)
    .where("encounterId", "=", args.encounterId)
    .where("conceptCode", "=", args.delta.conceptCode)
    .executeTakeFirst();
  if (existing) return;
  const concept = conceptByCode(CONCEPT_INDEX, args.delta.conceptCode);
  let category: string | null = null;
  const ALLERGY_CAT: readonly string[] = [
    "DRUG",
    "FOOD",
    "ENVIRONMENTAL",
    "OTHER",
  ];
  if (concept) {
    const fromNotes = concept.notes?.match(/Allergy category: ([A-Z_]+)/);
    if (fromNotes && ALLERGY_CAT.includes(fromNotes[1] as string))
      category = fromNotes[1] as string;
  }
  await db
    .insertInto("allergy_records")
    .values({
      id: ulid(),
      tenantId: args.tenantId,
      patientId: args.patientId,
      encounterId: args.encounterId,
      conceptCode: args.delta.conceptCode,
      freeTextName: args.delta.rawAnswer,
      category,
      reactionText: null,
      severity: args.delta.severity ?? "UNKNOWN",
      onsetDate: args.delta.onsetDate ?? null,
      originClass: PATIENT_REPORTED,
      confidence: args.delta.confidence,
      verificationState: UNVERIFIED,
      verifiedAt: null,
      verifiedBy: null,
      createdAt: args.now,
    })
    .execute();
}

/** Record the explicit "no known allergies" status (only from a negative allergies answer). */
export async function recordNoKnownAllergies(
  db: AppDatabase,
  args: {
    tenantId: string;
    patientId: string;
    recordedBy: string | null;
    recordedAt: string;
  },
): Promise<void> {
  await db
    .insertInto("allergy_status")
    .values({
      tenantId: args.tenantId,
      patientId: args.patientId,
      status: "NO_KNOWN_ALLERGIES",
      recordedAt: args.recordedAt,
      recordedBy: args.recordedBy,
    })
    .execute();
}

/**
 * Persist all fact deltas implied by an answered response, plus the explicit no-known-allergies
 * record when the allergies question was answered negatively.
 */
export async function persistFactDeltas(
  db: AppDatabase,
  args: {
    tenantId: string;
    patientId: string;
    encounterId: string;
    outcome: ResponseOutcome;
    evidenceId: string;
    askCount: number;
    now: string;
  },
): Promise<void> {
  for (const delta of args.outcome.facts) {
    // A negated fact never creates a clinical row: the response row (and its evidence) is the
    // record of the denial (ADR-012).
    if (delta.negated) continue;
    const base = {
      tenantId: args.tenantId,
      patientId: args.patientId,
      encounterId: args.encounterId,
      conceptCode: delta.conceptCode,
      displayName: delta.displayName,
      delta,
      outcome: args.outcome,
      evidenceId: args.evidenceId,
      askCount: args.askCount,
      now: args.now,
    };
    switch (delta.kind) {
      case "SYMPTOM":
        await upsertSymptom(db, base);
        break;
      case "CONDITION":
        await upsertHistoryEntry(db, { ...base, kind: "CONDITION" });
        break;
      case "HISTORY":
        await upsertHistoryEntry(db, { ...base, kind: "HISTORY" });
        break;
      case "MEDICATION":
        await upsertMedication(db, base);
        break;
      case "ALLERGY":
        await upsertAllergy(db, base);
        break;
      default:
        // No-op for unknown kinds — the engine only emits the kinds above.
        break;
    }
  }
}

/** Persist a triage assessment snapshot + its timeline event. */
export async function persistTriage(
  db: AppDatabase,
  args: {
    tenantId: string;
    patientId: string;
    encounterId: string;
    result: TriageAssessmentResult;
    evidenceIdsByFact: (fact: string) => readonly string[];
    now: string;
  },
): Promise<string> {
  const hits = args.result.hits.map((h) => ({
    identifier: h.ruleIdentifier,
    version: h.ruleVersion,
    severity: h.severity,
    action: h.action,
    description: h.description,
    clinicalRationale: h.clinicalRationale,
    source: h.source,
    evidenceRefs: h.evidenceRefs,
    evidenceIds: h.evidenceRefs.flatMap((ref) => args.evidenceIdsByFact(ref)),
    advisoryOnly: h.advisoryOnly,
  }));
  const id = ulid();
  await db
    .insertInto("triage_assessments")
    .values({
      id,
      tenantId: args.tenantId,
      encounterId: args.encounterId,
      level: args.result.level,
      priority: args.result.priority,
      ruleSetVersion: args.result.ruleSetVersion,
      requiresHumanReview: args.result.requiresHumanReview ? 1 : 0,
      explanation: args.result.explanation,
      hitsJson: JSON.stringify(hits),
      overriddenTo: null,
      overriddenBy: null,
      overrideReason: null,
      overriddenAt: null,
      assessedAt: args.now,
    })
    .execute();
  await db
    .insertInto("timeline_events")
    .values({
      id: ulid(),
      tenantId: args.tenantId,
      patientId: args.patientId,
      encounterId: args.encounterId,
      eventType: "TRIAGE_ASSESSED",
      eventAt: args.now,
      headline: `Triage assessed: ${args.result.level}`,
      detailJson: JSON.stringify({
        level: args.result.level,
        priority: args.result.priority,
        hits: hits.map((h) => h.identifier),
      }),
      evidenceIdsJson: JSON.stringify(hits.flatMap((h) => h.evidenceIds)),
      createdAt: args.now,
    })
    .execute();
  return id;
}

/** Load the most recent triage assessment for the encounter. */
export async function loadLatestTriage(
  db: AppDatabase,
  tenantId: string,
  encounterId: string,
): Promise<TriageAssessmentRow | undefined> {
  return db
    .selectFrom("triage_assessments")
    .selectAll()
    .where("encounterId", "=", encounterId)
    .where("tenantId", "=", tenantId)
    .orderBy("assessedAt", "desc")
    .orderBy("id", "desc")
    .executeTakeFirst();
}
