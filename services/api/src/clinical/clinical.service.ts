/**
 * Clinical console service — the doctor's workstation API.
 *
 * Queue management, patient search and records, the full case view, clinician notes, diagnoses,
 * disposition and encounter completion. All endpoints are staff-only with permission checks at
 * the point of use; every state change is audited and timestamped so a patient never disappears
 * from the queue and a completed encounter joins the longitudinal history.
 */

import { ulid } from "ulid";
import { z } from "zod";
import { compareQueueOrder, type QueueStatus } from "@medikiosk/shared-types";
import { errors, MediKioskError } from "@medikiosk/shared-types";
import { conceptByCode, CONCEPT_INDEX } from "@medikiosk/clinical-schema";
import {
  groupTimeline,
  type TimelineEventInput,
} from "@medikiosk/longitudinal";
import type { FastifyRequest } from "fastify";
import type { AppDatabase } from "../db/kysely";
import type { AppConfig } from "../config/env";
import type { AppLogger } from "../platform/logger";
import { appendAuditEvent, type AuditAction } from "../platform/audit";
import { loadInterview } from "../interview/state.repo";
import { SummaryService } from "../summary/summary.service";
import { requireStaff, type StaffPrincipal } from "./staff";
import { loadSnapshotRows, compareSnapshots } from "./snapshots";

export const QUEUE_STATUSES = [
  "WAITING",
  "CALLED",
  "IN_CONSULTATION",
  "COMPLETED",
  "CANCELLED",
] as const;

const ACTIVE_QUEUE_STATUSES: readonly string[] = [
  "WAITING",
  "CALLED",
  "IN_CONSULTATION",
];

export const noteBodySchema = z
  .object({ note: z.string().min(1).max(4000) })
  .strict();

export const diagnosisBodySchema = z
  .object({
    displayText: z.string().min(1).max(200),
    icd10Code: z.string().min(1).max(16).optional(),
    conceptCode: z.string().min(1).max(64).optional(),
    status: z
      .enum(["PROVISIONAL", "CONFIRMED", "RULED_OUT"])
      .default("PROVISIONAL"),
  })
  .strict();

export const dispositionBodySchema = z
  .object({
    disposition: z.enum([
      "DISCHARGE_HOME",
      "FOLLOW_UP_OPD",
      "REFER_SPECIALIST",
      "REFERRED_EMERGENCY",
      "ADMIT",
      "OBSERVE",
    ]),
  })
  .strict();

export const compareQuerySchema = z
  .object({
    previous: z.string().min(1),
    current: z.string().min(1),
  })
  .strict();

export type NoteBody = z.infer<typeof noteBodySchema>;
export type DiagnosisBody = z.infer<typeof diagnosisBodySchema>;
export type DispositionBody = z.infer<typeof dispositionBodySchema>;

const TIMELINE_SOURCE: Record<string, TimelineEventInput["source"]> = {
  ENCOUNTER_SUBMITTED: "SYSTEM_DERIVED",
  ENCOUNTER_COMPLETED: "SYSTEM_DERIVED",
  TRIAGE_ASSESSED: "SYSTEM_DERIVED",
  DOCUMENT_UPLOADED: "PATIENT_REPORTED",
  OCR_COMPLETED: "SYSTEM_DERIVED",
  EVIDENCE_PATIENT_CONFIRMED: "PATIENT_REPORTED",
  PATIENT_REVIEW_CONFIRMED: "PATIENT_REPORTED",
  FACT_VERIFIED: "PHYSICIAN_ENTERED",
  FACT_REJECTED: "PHYSICIAN_ENTERED",
  FACT_EDITED: "PHYSICIAN_ENTERED",
  NOTE_ADDED: "PHYSICIAN_ENTERED",
  DISPOSITION_RECORDED: "PHYSICIAN_ENTERED",
  QUEUE_STATUS_CHANGED: "SYSTEM_DERIVED",
};

function waitingMinutes(enqueuedAt: string, now: string): number {
  return Math.max(
    0,
    Math.round((Date.parse(now) - Date.parse(enqueuedAt)) / 60000),
  );
}

export class ClinicalService {
  private readonly summaries: SummaryService;

  constructor(
    readonly deps: {
      db: AppDatabase;
      config: AppConfig;
      logger: AppLogger;
      now: () => Date;
    },
  ) {
    this.summaries = new SummaryService(deps);
  }

  private staff(
    request: FastifyRequest,
    permission:
      | "patient.read"
      | "patient.search"
      | "encounter.read"
      | "triage.read"
      | "triage.update"
      | "summary.read",
  ): Promise<StaffPrincipal> {
    return requireStaff(
      this.deps.db,
      this.deps.config,
      request,
      this.deps.now(),
      permission,
    );
  }

  private async audit(
    request: FastifyRequest,
    principal: StaffPrincipal,
    entry: {
      action: AuditAction;
      resourceType?: string;
      resourceId: string;
      encounterId?: string;
      detail?: Record<string, string | number | boolean>;
    },
  ): Promise<void> {
    const written = await appendAuditEvent(
      this.deps.db,
      this.deps.logger,
      { requestId: String(request.id) },
      {
        tenantId: principal.tenantId,
        actorId: principal.userId,
        actorKind: "STAFF",
        action: entry.action,
        resourceType: entry.resourceType ?? "encounter",
        resourceId: entry.resourceId,
        encounterId: entry.encounterId,
        result: "SUCCESS",
        detail: entry.detail,
      },
    );
    if (!written)
      throw new MediKioskError(
        "SERVICE_UNAVAILABLE",
        "The audit record could not be saved.",
      );
  }

  private timelineEvent(
    tenantId: string,
    patientId: string,
    encounterId: string,
    eventType: string,
    headline: string,
    recorded: string,
    detail?: Record<string, unknown>,
  ) {
    return this.deps.db
      .insertInto("timeline_events")
      .values({
        id: ulid(),
        tenantId,
        patientId,
        encounterId,
        eventType,
        eventAt: recorded,
        headline,
        detailJson: JSON.stringify(detail ?? {}),
        evidenceIdsJson: JSON.stringify([]),
        createdAt: recorded,
      })
      .execute();
  }

  // -------------------------------------------------------------------------
  // Queue
  // -------------------------------------------------------------------------

  /**
   * GET /queue — active entries ordered EMERGENCY-first, oldest-first within a priority.
   * The waiting time is computed, never stored; an empty queue is an explicit empty list.
   */
  async queue(request: FastifyRequest, status?: string): Promise<unknown> {
    const principal = await this.staff(request, "triage.read");
    const wanted =
      status && (QUEUE_STATUSES as readonly string[]).includes(status)
        ? [status]
        : [...ACTIVE_QUEUE_STATUSES];
    const entries = await this.deps.db
      .selectFrom("queue_entries")
      .selectAll()
      .where("tenantId", "=", principal.tenantId)
      .where("status", "in", wanted)
      .execute();
    const nowIso = this.deps.now().toISOString();
    const enriched = await Promise.all(
      entries.map(async (entry) => {
        const [patient, encounter] = await Promise.all([
          this.deps.db
            .selectFrom("patients")
            .selectAll()
            .where("id", "=", entry.patientId)
            .where("tenantId", "=", principal.tenantId)
            .executeTakeFirst(),
          this.deps.db
            .selectFrom("encounters")
            .selectAll()
            .where("id", "=", entry.encounterId)
            .where("tenantId", "=", principal.tenantId)
            .executeTakeFirst(),
        ]);
        if (!patient || !encounter) return null;
        const complaints = JSON.parse(
          encounter.chiefComplaintCodesJson,
        ) as string[];
        return {
          id: entry.id,
          tokenNumber: entry.tokenNumber,
          priority: entry.priority,
          status: entry.status,
          reason: entry.reason,
          ruleIdentifiers: JSON.parse(entry.ruleIdentifiersJson) as string[],
          enqueuedAt: entry.enqueuedAt,
          calledAt: entry.calledAt,
          waitingMinutes: waitingMinutes(entry.enqueuedAt, nowIso),
          patient: {
            id: patient.id,
            fullName: patient.fullName ?? "Guest patient",
            ageYears: patient.ageYears,
            sex: patient.sex,
          },
          encounter: {
            id: encounter.id,
            status: encounter.status,
            chiefComplaintCodes: complaints,
            chiefComplaintLabels: complaints.map(
              (code) => conceptByCode(CONCEPT_INDEX, code)?.display ?? code,
            ),
            chiefComplaintVerbatim: encounter.chiefComplaintVerbatim,
            submittedAt: encounter.submittedAt,
          },
        };
      }),
    );
    const visible = enriched.filter(
      (entry): entry is NonNullable<typeof entry> => entry !== null,
    );
    visible.sort((a, b) =>
      compareQueueOrder(
        {
          priority: a.priority as "ROUTINE" | "URGENT" | "EMERGENCY",
          enqueuedAt: a.enqueuedAt,
        },
        {
          priority: b.priority as "ROUTINE" | "URGENT" | "EMERGENCY",
          enqueuedAt: b.enqueuedAt,
        },
      ),
    );
    return { entries: visible };
  }

  /** POST /queue/:id/:transition — CALLED, IN_CONSULTATION or CANCELLED. */
  async transitionQueue(
    request: FastifyRequest,
    queueId: string,
    transition: "call" | "start" | "cancel",
  ): Promise<unknown> {
    const principal = await this.staff(request, "triage.update");
    const entry = await this.deps.db
      .selectFrom("queue_entries")
      .selectAll()
      .where("id", "=", queueId)
      .where("tenantId", "=", principal.tenantId)
      .executeTakeFirst();
    if (!entry) throw errors.notFound("Queue entry");
    const target: QueueStatus =
      transition === "call"
        ? "CALLED"
        : transition === "start"
          ? "IN_CONSULTATION"
          : "CANCELLED";
    const legal: Record<QueueStatus, readonly QueueStatus[]> = {
      WAITING: ["CALLED", "IN_CONSULTATION", "CANCELLED"],
      CALLED: ["IN_CONSULTATION", "CANCELLED"],
      IN_CONSULTATION: ["COMPLETED", "CANCELLED"],
      COMPLETED: [],
      CANCELLED: [],
    };
    const from = entry.status as QueueStatus;
    if (!(legal[from] ?? []).includes(target))
      throw new MediKioskError(
        "ENCOUNTER_NOT_EDITABLE",
        `A queue entry in status ${entry.status} cannot move to ${target}.`,
      );
    const recorded = this.deps.now().toISOString();
    await this.deps.db
      .updateTable("queue_entries")
      .set({
        status: target,
        ...(transition === "call" ? { calledAt: recorded } : {}),
        updatedAt: recorded,
      })
      .where("id", "=", queueId)
      .where("tenantId", "=", principal.tenantId)
      .execute();
    await this.timelineEvent(
      principal.tenantId,
      entry.patientId,
      entry.encounterId,
      "QUEUE_STATUS_CHANGED",
      `Queue ${entry.tokenNumber ?? entry.id} → ${target}`,
      recorded,
      { from: entry.status, to: target },
    );
    await this.audit(request, principal, {
      action: "QUEUE_STATUS_CHANGED",
      resourceType: "queue",
      resourceId: queueId,
      encounterId: entry.encounterId,
      detail: { from: entry.status, to: target },
    });
    return { id: queueId, status: target };
  }

  // -------------------------------------------------------------------------
  // Patients
  // -------------------------------------------------------------------------

  /** GET /patients?query= — safe demo-identifier search (id, name, guest ref, phone tail). */
  async searchPatients(
    request: FastifyRequest,
    query: string,
  ): Promise<unknown> {
    const principal = await this.staff(request, "patient.search");
    const trimmed = query.trim();
    if (trimmed.length < 2)
      throw errors.validation("Search needs at least two characters.");
    const like = `%${trimmed.replace(/[%_]/g, "")}%`;
    const patients = await this.deps.db
      .selectFrom("patients")
      .selectAll()
      .where("tenantId", "=", principal.tenantId)
      .where("deletedAt", "is", null)
      .where((eb) =>
        eb.or([
          eb("id", "=", trimmed),
          eb("fullName", "like", like),
          eb("guestRef", "like", like),
          eb("phoneMasked", "like", like),
        ]),
      )
      .limit(20)
      .execute();
    const results = await Promise.all(
      patients.map(async (patient) => {
        const encounters = await this.deps.db
          .selectFrom("encounters")
          .select(["id", "status", "createdAt"])
          .where("tenantId", "=", principal.tenantId)
          .where("patientId", "=", patient.id)
          .where("deletedAt", "is", null)
          .orderBy("createdAt", "desc")
          .execute();
        return {
          id: patient.id,
          fullName: patient.fullName ?? "Guest patient",
          ageYears: patient.ageYears,
          sex: patient.sex,
          phoneMasked: patient.phoneMasked,
          guestRef: patient.guestRef,
          encounterCount: encounters.length,
          lastEncounterAt: encounters[0]?.createdAt ?? null,
          lastEncounterStatus: encounters[0]?.status ?? null,
        };
      }),
    );
    await this.audit(request, principal, {
      action: "PATIENT_SEARCHED_BY_STAFF",
      resourceType: "patient",
      resourceId: "search",
      detail: { results: results.length },
    });
    return { patients: results };
  }

  /** GET /patients/:id — the patient record with the encounter list. */
  async patientRecord(
    request: FastifyRequest,
    patientId: string,
  ): Promise<unknown> {
    const principal = await this.staff(request, "patient.read");
    const patient = await this.deps.db
      .selectFrom("patients")
      .selectAll()
      .where("id", "=", patientId)
      .where("tenantId", "=", principal.tenantId)
      .where("deletedAt", "is", null)
      .executeTakeFirst();
    if (!patient) throw errors.notFound("Patient");
    const encounters = await this.deps.db
      .selectFrom("encounters")
      .selectAll()
      .where("tenantId", "=", principal.tenantId)
      .where("patientId", "=", patientId)
      .where("deletedAt", "is", null)
      .orderBy("createdAt", "desc")
      .execute();
    const allergyStatus = await this.deps.db
      .selectFrom("allergy_status")
      .selectAll()
      .where("tenantId", "=", principal.tenantId)
      .where("patientId", "=", patientId)
      .orderBy("recordedAt", "desc")
      .executeTakeFirst();
    await this.audit(request, principal, {
      action: "RECORD_VIEWED",
      resourceType: "patient",
      resourceId: patientId,
    });
    return {
      patient: {
        id: patient.id,
        fullName: patient.fullName ?? "Guest patient",
        preferredName: patient.preferredName,
        dateOfBirth: patient.dateOfBirth,
        ageYears: patient.ageYears,
        sex: patient.sex,
        phoneMasked: patient.phoneMasked,
        preferredLanguage: patient.preferredLanguage,
        district: patient.district,
        state: patient.state,
        guestRef: patient.guestRef,
      },
      allergyStatus: allergyStatus?.status ?? null,
      encounters: encounters.map((encounter) => ({
        id: encounter.id,
        status: encounter.status,
        chiefComplaintCodes: JSON.parse(
          encounter.chiefComplaintCodesJson,
        ) as string[],
        chiefComplaintLabels: (
          JSON.parse(encounter.chiefComplaintCodesJson) as string[]
        ).map((code) => conceptByCode(CONCEPT_INDEX, code)?.display ?? code),
        createdAt: encounter.createdAt,
        submittedAt: encounter.submittedAt,
        completedAt: encounter.completedAt,
        disposition: encounter.disposition,
      })),
    };
  }

  /** GET /patients/:id/timeline — grouped longitudinal events, oldest first. */
  async patientTimeline(
    request: FastifyRequest,
    patientId: string,
  ): Promise<unknown> {
    const principal = await this.staff(request, "patient.read");
    const patient = await this.deps.db
      .selectFrom("patients")
      .select("id")
      .where("id", "=", patientId)
      .where("tenantId", "=", principal.tenantId)
      .where("deletedAt", "is", null)
      .executeTakeFirst();
    if (!patient) throw errors.notFound("Patient");
    const [stored, encounters] = await Promise.all([
      this.deps.db
        .selectFrom("timeline_events")
        .selectAll()
        .where("tenantId", "=", principal.tenantId)
        .where("patientId", "=", patientId)
        .orderBy("eventAt", "asc")
        .execute(),
      this.deps.db
        .selectFrom("encounters")
        .select(["id", "status", "createdAt", "chiefComplaintCodesJson"])
        .where("tenantId", "=", principal.tenantId)
        .where("patientId", "=", patientId)
        .where("deletedAt", "is", null)
        .execute(),
    ]);
    const inputs: TimelineEventInput[] = stored.map((event) => ({
      eventType: event.eventType,
      eventAt: event.eventAt,
      headline: event.headline,
      ...(event.detailJson ? { detailJson: event.detailJson } : {}),
      evidenceIds: JSON.parse(event.evidenceIdsJson) as string[],
      source: TIMELINE_SOURCE[event.eventType] ?? ("SYSTEM_DERIVED" as const),
      encounterId: event.encounterId,
      patientId,
      groupKey: event.encounterId,
    }));
    const grouped = groupTimeline(inputs);
    const encounterById = new Map(encounters.map((e) => [e.id, e]));
    await this.audit(request, principal, {
      action: "TIMELINE_VIEWED",
      resourceType: "patient",
      resourceId: patientId,
    });
    return {
      patientId,
      events: grouped.events,
      groups: grouped.grouped.map((group) => ({
        ...group,
        encounter:
          group.groupKey === "\u0000__ungrouped__"
            ? null
            : (encounterById.get(group.groupKey) ?? null),
      })),
    };
  }

  /** GET /patients/:id/compare?previous=&current= — deterministic encounter diff. */
  async compareEncounters(
    request: FastifyRequest,
    patientId: string,
    previousId: string,
    currentId: string,
  ): Promise<unknown> {
    const principal = await this.staff(request, "patient.read");
    const load = async (encounterId: string) => {
      const encounter = await this.deps.db
        .selectFrom("encounters")
        .selectAll()
        .where("id", "=", encounterId)
        .where("tenantId", "=", principal.tenantId)
        .where("patientId", "=", patientId)
        .where("deletedAt", "is", null)
        .executeTakeFirst();
      if (!encounter) throw errors.notFound("Encounter");
      return loadSnapshotRows(
        this.deps.db,
        principal.tenantId,
        encounterId,
        JSON.parse(encounter.chiefComplaintCodesJson),
      );
    };
    const [previous, current] = await Promise.all([
      load(previousId),
      load(currentId),
    ]);
    const changes = compareSnapshots(previous, current);
    await this.audit(request, principal, {
      action: "WHAT_CHANGED_VIEWED",
      resourceType: "patient",
      resourceId: patientId,
      encounterId: currentId,
    });
    return { patientId, previous: previousId, current: currentId, changes };
  }

  // -------------------------------------------------------------------------
  // Case view
  // -------------------------------------------------------------------------

  /**
   * GET /encounters/:id/case — the full doctor-facing case. Patient-reported, system-generated,
   * doctor-verified and doctor-authored information stay in separate blocks (ADR-005).
   */
  async caseView(
    request: FastifyRequest,
    encounterId: string,
  ): Promise<unknown> {
    const principal = await this.staff(request, "encounter.read");
    const loaded = await loadInterview(
      this.deps.db,
      principal.tenantId,
      encounterId,
    );
    const encounter = loaded.encounter;
    const patient = loaded.patient;
    const [
      vitals,
      labs,
      documents,
      entities,
      evidence,
      triage,
      notes,
      diagnoses,
      queue,
      summary,
    ] = await Promise.all([
      this.deps.db
        .selectFrom("vitals")
        .selectAll()
        .where("tenantId", "=", principal.tenantId)
        .where("encounterId", "=", encounterId)
        .execute(),
      this.deps.db
        .selectFrom("lab_results")
        .selectAll()
        .where("tenantId", "=", principal.tenantId)
        .where("encounterId", "=", encounterId)
        .execute(),
      this.deps.db
        .selectFrom("documents")
        .selectAll()
        .where("tenantId", "=", principal.tenantId)
        .where("encounterId", "=", encounterId)
        .where("deletedAt", "is", null)
        .execute(),
      this.deps.db
        .selectFrom("document_entities")
        .selectAll()
        .where("tenantId", "=", principal.tenantId)
        .execute(),
      this.deps.db
        .selectFrom("evidence")
        .selectAll()
        .where("tenantId", "=", principal.tenantId)
        .where("encounterId", "=", encounterId)
        .orderBy("capturedAt", "asc")
        .execute(),
      this.deps.db
        .selectFrom("triage_assessments")
        .selectAll()
        .where("tenantId", "=", principal.tenantId)
        .where("encounterId", "=", encounterId)
        .orderBy("assessedAt", "desc")
        .executeTakeFirst(),
      this.deps.db
        .selectFrom("encounter_notes")
        .selectAll()
        .where("tenantId", "=", principal.tenantId)
        .where("encounterId", "=", encounterId)
        .orderBy("createdAt", "asc")
        .execute(),
      this.deps.db
        .selectFrom("diagnoses")
        .selectAll()
        .where("tenantId", "=", principal.tenantId)
        .where("encounterId", "=", encounterId)
        .execute(),
      this.deps.db
        .selectFrom("queue_entries")
        .selectAll()
        .where("tenantId", "=", principal.tenantId)
        .where("encounterId", "=", encounterId)
        .executeTakeFirst(),
      this.summaries.summarise(principal.tenantId, encounterId, {
        actorId: principal.userId,
        actorKind: "STAFF",
        requestId: String(request.id),
      }),
    ]);

    const displayOf = (code: string): string =>
      conceptByCode(CONCEPT_INDEX, code)?.display ?? code;
    const complaints = JSON.parse(
      encounter.chiefComplaintCodesJson,
    ) as string[];

    // Previous encounters for the longitudinal strip (brief, newest first, excluding current).
    const previousEncounters = await this.deps.db
      .selectFrom("encounters")
      .select([
        "id",
        "status",
        "chiefComplaintCodesJson",
        "createdAt",
        "submittedAt",
        "completedAt",
        "disposition",
      ])
      .where("tenantId", "=", principal.tenantId)
      .where("patientId", "=", encounter.patientId)
      .where("deletedAt", "is", null)
      .orderBy("createdAt", "desc")
      .execute();
    const history = previousEncounters.filter((e) => e.id !== encounterId);

    let changes: unknown[] = [];
    if (history[0]) {
      const [previousRows, currentRows] = await Promise.all([
        loadSnapshotRows(
          this.deps.db,
          principal.tenantId,
          history[0].id,
          JSON.parse(history[0].chiefComplaintCodesJson),
        ),
        loadSnapshotRows(
          this.deps.db,
          principal.tenantId,
          encounterId,
          complaints,
        ),
      ]);
      changes = [...compareSnapshots(previousRows, currentRows)];
    }

    await this.audit(request, principal, {
      action: "RECORD_VIEWED",
      resourceId: encounterId,
      encounterId,
    });

    return {
      patient: {
        id: patient.id,
        fullName: patient.fullName ?? "Guest patient",
        preferredName: patient.preferredName,
        dateOfBirth: patient.dateOfBirth,
        ageYears: patient.ageYears,
        sex: patient.sex,
        phoneMasked: patient.phoneMasked,
        preferredLanguage: patient.preferredLanguage,
        district: patient.district,
        state: patient.state,
        guestRef: patient.guestRef,
      },
      encounter: {
        id: encounter.id,
        status: encounter.status,
        encounterType: encounter.encounterType,
        locale: encounter.locale,
        createdAt: encounter.createdAt,
        submittedAt: encounter.submittedAt,
        patientConfirmedAt: encounter.patientConfirmedAt,
        completedAt: encounter.completedAt,
        disposition: encounter.disposition,
      },
      complaints: {
        codes: complaints,
        labels: complaints.map(displayOf),
        verbatim: encounter.chiefComplaintVerbatim,
      },
      patientReported: {
        responses: loaded.responses.map((r) => ({
          questionKey: r.questionKey,
          state: r.state,
          rawAnswer: r.rawAnswer,
          modality: r.modality,
          answeredAt: r.answeredAt,
        })),
        symptoms: loaded.symptoms.map((s) => ({
          conceptCode: s.conceptCode,
          displayName: s.displayName,
          severity: s.severity,
          onsetDate: s.onsetDate,
          durationDays: s.durationValue,
          patientText: s.patientText,
          certainty: s.certainty,
          originClass: s.originClass,
          verificationState: s.verificationState,
        })),
        conditions: loaded.conditions.map((h) => ({
          id: h.id,
          kind: h.kind,
          conceptCode: h.conceptCode,
          displayName: h.displayName,
          relation: h.relation,
          onsetYear: h.onsetYear,
          originClass: h.originClass,
          verificationState: h.verificationState,
        })),
        medications: loaded.medications.map((m) => ({
          id: m.id,
          conceptCode: m.conceptCode,
          asWrittenName: m.asWrittenName,
          frequency: m.frequency,
          status: m.status,
          documentId: m.documentId,
          originClass: m.originClass,
          verificationState: m.verificationState,
          verifiedAt: m.verifiedAt,
        })),
        allergies: loaded.allergies.map((a) => ({
          id: a.id,
          conceptCode: a.conceptCode,
          freeTextName: a.freeTextName,
          reactionText: a.reactionText,
          severity: a.severity,
          originClass: a.originClass,
          verificationState: a.verificationState,
        })),
        vitals: vitals.map((v) => ({
          id: v.id,
          conceptCode: v.conceptCode,
          display: displayOf(v.conceptCode),
          componentCode: v.componentCode,
          value: v.value,
          unit: v.unit,
          source: v.source,
          originClass: v.originClass,
          verificationState: v.verificationState,
        })),
        labs: labs.map((l) => ({
          id: l.id,
          testCode: l.testCode,
          display: displayOf(l.testCode),
          value: l.value,
          unit: l.unit,
          flag: l.flag,
          documentId: l.documentId,
          originClass: l.originClass,
          verificationState: l.verificationState,
        })),
      },
      systemGenerated: {
        triage: triage
          ? {
              level: triage.level,
              priority: triage.priority,
              requiresHumanReview: triage.requiresHumanReview === 1,
              explanation: triage.explanation,
              hits: JSON.parse(triage.hitsJson),
              assessedAt: triage.assessedAt,
            }
          : null,
        documents: documents.map((d) => ({
          id: d.id,
          documentType: d.documentType,
          mimeType: d.mimeType,
          status: d.status,
          demoExtraction: true,
          ocrConfidence: d.ocrConfidence,
          uploadedAt: d.uploadedAt,
          entities: entities
            .filter((e) => e.documentId === d.id)
            .map((e) => ({
              id: e.id,
              kind: e.kind,
              conceptCode: e.conceptCode,
              testCode: e.testCode,
              rawText: e.rawText,
              normalisedJson: e.normalisedJson
                ? JSON.parse(e.normalisedJson)
                : null,
              confidence: e.confidence,
              verificationState: e.verificationState,
              needsClinicianReview: e.needsClinicianReview === 1,
              verifiedAt: e.verifiedAt,
            })),
        })),
        evidence: evidence.map((e) => ({
          id: e.id,
          type: e.type,
          originClass: e.originClass,
          source: e.source,
          sourceRef: e.sourceRef,
          rawValue: e.rawValue,
          confidence: e.confidence,
          verificationState: e.verificationState,
          verifiedAt: e.verifiedAt,
          capturedAt: e.capturedAt,
        })),
      },
      longitudinal: {
        previousEncounters: history.slice(0, 5).map((e) => ({
          id: e.id,
          status: e.status,
          complaints: JSON.parse(e.chiefComplaintCodesJson) as string[],
          createdAt: e.createdAt,
          submittedAt: e.submittedAt,
          completedAt: e.completedAt,
          disposition: e.disposition,
        })),
        changesSincePrevious: changes,
      },
      doctorAuthored: {
        notes: notes.map((n) => ({
          id: n.id,
          authorName: n.authorName,
          note: n.note,
          createdAt: n.createdAt,
        })),
        diagnoses: diagnoses.map((d) => ({
          id: d.id,
          displayText: d.displayText,
          icd10Code: d.icd10Code,
          conceptCode: d.conceptCode,
          status: d.status,
          recordedAt: d.recordedAt,
        })),
      },
      queue: queue
        ? {
            id: queue.id,
            tokenNumber: queue.tokenNumber,
            priority: queue.priority,
            status: queue.status,
            enqueuedAt: queue.enqueuedAt,
            calledAt: queue.calledAt,
          }
        : null,
      summary,
    };
  }

  // -------------------------------------------------------------------------
  // Clinician authorship
  // -------------------------------------------------------------------------

  /** POST /encounters/:id/notes — doctor-written prose, stored apart from all other classes. */
  async addNote(
    request: FastifyRequest,
    encounterId: string,
    body: NoteBody,
  ): Promise<unknown> {
    const principal = await this.staff(request, "encounter.read");
    const encounter = await this.ownedEncounter(principal, encounterId);
    const recorded = this.deps.now().toISOString();
    const noteId = ulid();
    await this.deps.db
      .insertInto("encounter_notes")
      .values({
        id: noteId,
        tenantId: principal.tenantId,
        encounterId,
        authorId: principal.userId,
        authorName: principal.displayName,
        note: body.note,
        createdAt: recorded,
      })
      .execute();
    await this.timelineEvent(
      principal.tenantId,
      encounter.patientId,
      encounterId,
      "NOTE_ADDED",
      `Clinical note by ${principal.displayName}`,
      recorded,
    );
    await this.audit(request, principal, {
      action: "NOTE_ADDED",
      resourceId: noteId,
      encounterId,
    });
    return { id: noteId, createdAt: recorded };
  }

  /** POST /encounters/:id/diagnoses — a doctor-recorded diagnosis (the only diagnosis writer). */
  async addDiagnosis(
    request: FastifyRequest,
    encounterId: string,
    body: DiagnosisBody,
  ): Promise<unknown> {
    const principal = await this.staff(request, "encounter.read");
    const encounter = await this.ownedEncounter(principal, encounterId);
    const recorded = this.deps.now().toISOString();
    const diagnosisId = ulid();
    await this.deps.db
      .insertInto("diagnoses")
      .values({
        id: diagnosisId,
        tenantId: principal.tenantId,
        patientId: encounter.patientId,
        encounterId,
        conceptCode: body.conceptCode ?? null,
        displayText: body.displayText,
        icd10Code: body.icd10Code ?? null,
        status: body.status,
        recordedAt: recorded,
        recordedBy: principal.userId,
        originClass: "CLINICIAN_ENTERED",
        confidence: 1,
        verificationState: "VERIFIED",
        createdAt: recorded,
      })
      .execute();
    await this.timelineEvent(
      principal.tenantId,
      encounter.patientId,
      encounterId,
      "NOTE_ADDED",
      `Diagnosis recorded: ${body.displayText}`,
      recorded,
      { status: body.status },
    );
    return { id: diagnosisId, recordedAt: recorded };
  }

  /** POST /encounters/:id/disposition — the doctor's plan for the patient. */
  async recordDisposition(
    request: FastifyRequest,
    encounterId: string,
    body: DispositionBody,
  ): Promise<unknown> {
    const principal = await this.staff(request, "triage.update");
    const encounter = await this.ownedEncounter(principal, encounterId);
    if (encounter.status !== "SUBMITTED" && encounter.status !== "COMPLETED")
      throw new MediKioskError(
        "ENCOUNTER_NOT_EDITABLE",
        "Disposition can only be recorded on a submitted encounter.",
      );
    const recorded = this.deps.now().toISOString();
    await this.deps.db
      .updateTable("encounters")
      .set({
        disposition: body.disposition,
        dispositionBy: principal.userId,
        updatedAt: recorded,
      })
      .where("id", "=", encounterId)
      .where("tenantId", "=", principal.tenantId)
      .execute();
    await this.timelineEvent(
      principal.tenantId,
      encounter.patientId,
      encounterId,
      "DISPOSITION_RECORDED",
      `Disposition: ${body.disposition}`,
      recorded,
    );
    await this.audit(request, principal, {
      action: "DISPOSITION_RECORDED",
      resourceId: encounterId,
      encounterId,
      detail: { disposition: body.disposition },
    });
    return { encounterId, disposition: body.disposition };
  }

  /**
   * POST /encounters/:id/complete — the encounter joins the longitudinal history. Requires the
   * submitted state; completes the queue entry in the same call so the two can never disagree.
   */
  async completeEncounter(
    request: FastifyRequest,
    encounterId: string,
  ): Promise<unknown> {
    const principal = await this.staff(request, "triage.update");
    const encounter = await this.ownedEncounter(principal, encounterId);
    if (encounter.status !== "SUBMITTED")
      throw new MediKioskError(
        "ENCOUNTER_NOT_EDITABLE",
        "Only a submitted encounter can be completed.",
      );
    const recorded = this.deps.now().toISOString();
    await this.deps.db.transaction().execute(async (tx) => {
      await tx
        .updateTable("encounters")
        .set({
          status: "COMPLETED",
          completedAt: recorded,
          updatedAt: recorded,
        })
        .where("id", "=", encounterId)
        .where("tenantId", "=", principal.tenantId)
        .execute();
      await tx
        .updateTable("queue_entries")
        .set({
          status: "COMPLETED",
          completedAt: recorded,
          updatedAt: recorded,
        })
        .where("encounterId", "=", encounterId)
        .where("tenantId", "=", principal.tenantId)
        .execute();
      await tx
        .insertInto("timeline_events")
        .values({
          id: ulid(),
          tenantId: principal.tenantId,
          patientId: encounter.patientId,
          encounterId,
          eventType: "ENCOUNTER_COMPLETED",
          eventAt: recorded,
          headline: "Encounter completed",
          detailJson: JSON.stringify({
            disposition: encounter.disposition,
          }),
          evidenceIdsJson: JSON.stringify([]),
          createdAt: recorded,
        })
        .execute();
    });
    await this.audit(request, principal, {
      action: "ENCOUNTER_COMPLETED",
      resourceId: encounterId,
      encounterId,
    });
    return { encounterId, status: "COMPLETED", completedAt: recorded };
  }

  private async ownedEncounter(
    principal: StaffPrincipal,
    encounterId: string,
  ): Promise<{
    patientId: string;
    status: string;
    disposition: string | null;
  }> {
    const encounter = await this.deps.db
      .selectFrom("encounters")
      .select(["patientId", "status", "disposition"])
      .where("id", "=", encounterId)
      .where("tenantId", "=", principal.tenantId)
      .where("deletedAt", "is", null)
      .executeTakeFirst();
    if (!encounter) throw errors.notFound("Encounter");
    return encounter;
  }
}
