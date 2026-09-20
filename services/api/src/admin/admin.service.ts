/**
 * Administration service — system overview, kiosk fleet, audit log and health.
 *
 * Every metric is derived from the database at request time; there is no cached dashboard state
 * to drift. ADMIN/SUPER_ADMIN roles hold `analytics.read`/`audit.read`/`kiosk.read` but, by
 * construction of the permission table, no clinical read permission — the admin console can see
 * counts and codes, never patient records.
 */

import { stat } from "node:fs/promises";
import { ulid } from "ulid";
import { z } from "zod";
import { errors } from "@medikiosk/shared-types";
import { conceptByCode, CONCEPT_INDEX } from "@medikiosk/clinical-schema";
import {
  assertValidBundle,
  mapEncounterBundle,
  type ExportCase,
} from "@medikiosk/fhir-models";
import type { FastifyRequest } from "fastify";
import type { AppDatabase } from "../db/kysely";
import type { AppConfig } from "../config/env";
import type { AppLogger } from "../platform/logger";
import { appendAuditEvent } from "../platform/audit";
import { loadInterview } from "../interview/state.repo";
import { requireStaff, type StaffPrincipal } from "../clinical/staff";
import { activeDevice } from "../kiosk/session.repo";

export const auditQuerySchema = z
  .object({
    action: z.string().min(1).max(64).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  })
  .strict();

function dayStart(now: Date): string {
  return now.toISOString().slice(0, 10) + "T00:00:00.000Z";
}

function minutesBetween(from: string, to: string): number {
  return Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60000));
}

export class AdminService {
  constructor(
    readonly deps: {
      db: AppDatabase;
      config: AppConfig;
      logger: AppLogger;
      now: () => Date;
    },
  ) {}

  // -------------------------------------------------------------------------
  // Overview
  // -------------------------------------------------------------------------

  /**
   * GET /admin/overview — counts, distributions and intake timing for today, all derived live.
   * Demo/seed rows are included and the response says so; the console labels them as demo data.
   */
  async overview(request: FastifyRequest): Promise<unknown> {
    const principal = await requireStaff(
      this.deps.db,
      this.deps.config,
      request,
      this.deps.now(),
      "analytics.read",
    );
    const tenantId = principal.tenantId;
    const today = dayStart(this.deps.now());

    const [patients, encounters, queue, triage, documents] = await Promise.all([
      this.deps.db
        .selectFrom("patients")
        .select(["id", "createdAt"])
        .where("tenantId", "=", tenantId)
        .where("deletedAt", "is", null)
        .execute(),
      this.deps.db
        .selectFrom("encounters")
        .selectAll()
        .where("tenantId", "=", tenantId)
        .where("deletedAt", "is", null)
        .execute(),
      this.deps.db
        .selectFrom("queue_entries")
        .selectAll()
        .where("tenantId", "=", tenantId)
        .execute(),
      this.deps.db
        .selectFrom("triage_assessments")
        .select(["encounterId", "level", "assessedAt"])
        .where("tenantId", "=", tenantId)
        .execute(),
      this.deps.db
        .selectFrom("documents")
        .select(["id", "createdAt", "status"])
        .where("tenantId", "=", tenantId)
        .where("deletedAt", "is", null)
        .execute(),
    ]);

    const todayEncounters = encounters.filter((e) => e.createdAt >= today);
    const submittedToday = todayEncounters.filter((e) => e.submittedAt);
    const waiting = queue.filter((q) => q.status === "WAITING");
    const completedQueueToday = queue.filter(
      (q) => q.status === "COMPLETED" && (q.completedAt ?? "") >= today,
    );
    const durations = submittedToday
      .filter((e) => e.submittedAt)
      .map((e) => minutesBetween(e.createdAt, e.submittedAt as string));

    const languages: Record<string, number> = {};
    for (const encounter of todayEncounters)
      languages[encounter.locale] = (languages[encounter.locale] ?? 0) + 1;
    const complaints: Record<string, number> = {};
    for (const encounter of todayEncounters) {
      for (const code of JSON.parse(
        encounter.chiefComplaintCodesJson,
      ) as string[]) {
        const label = conceptByCode(CONCEPT_INDEX, code)?.display ?? code;
        complaints[label] = (complaints[label] ?? 0) + 1;
      }
    }
    const redToday = new Set(
      triage
        .filter((t) => t.level === "RED" && t.assessedAt >= today)
        .map((t) => t.encounterId),
    ).size;

    await appendAuditEvent(
      this.deps.db,
      this.deps.logger,
      { requestId: String(request.id) },
      {
        tenantId,
        actorId: principal.userId,
        actorKind: "STAFF",
        action: "ANALYTICS_VIEWED",
        resourceType: "analytics",
        resourceId: "overview",
        result: "SUCCESS",
      },
    );

    return {
      generatedAt: this.deps.now().toISOString(),
      demoDataIncluded: true,
      patientsToday: patients.filter((p) => p.createdAt >= today).length,
      encountersToday: todayEncounters.length,
      submittedToday: submittedToday.length,
      waiting: waiting.length,
      urgentWaiting: waiting.filter(
        (q) => q.priority === "URGENT" || q.priority === "EMERGENCY",
      ).length,
      completedToday: completedQueueToday.length,
      redAssessmentsToday: redToday,
      documentsToday: documents.filter((d) => d.createdAt >= today).length,
      averageIntakeMinutes:
        durations.length === 0
          ? null
          : Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      languageDistribution: languages,
      complaintDistribution: complaints,
    };
  }

  // -------------------------------------------------------------------------
  // Kiosk fleet
  // -------------------------------------------------------------------------

  /**
   * GET /admin/kiosks — fleet table. `lastSeenAt` is written by real session activity (and the
   * heartbeat below); statuses Online/Offline/Maintenance are derived, never claimed live.
   */
  async kiosks(request: FastifyRequest): Promise<unknown> {
    const principal = await requireStaff(
      this.deps.db,
      this.deps.config,
      request,
      this.deps.now(),
      "kiosk.read",
    );
    const rows = await this.deps.db
      .selectFrom("kiosks")
      .selectAll()
      .where("tenantId", "=", principal.tenantId)
      .where("deletedAt", "is", null)
      .orderBy("name", "asc")
      .execute();
    const nowMs = this.deps.now().getTime();
    return {
      kiosks: rows.map((kiosk) => {
        const lastSeenMs = kiosk.lastSeenAt
          ? Date.parse(kiosk.lastSeenAt)
          : null;
        const derived =
          kiosk.status === "MAINTENANCE"
            ? "Maintenance"
            : lastSeenMs !== null && nowMs - lastSeenMs < 15 * 60_000
              ? "Online"
              : "Offline";
        return {
          id: kiosk.id,
          name: kiosk.name,
          location: kiosk.location,
          configuredStatus: kiosk.status,
          status: derived,
          statusNote:
            derived === "Online"
              ? "Session activity within the last 15 minutes."
              : derived === "Maintenance"
                ? "Flagged for maintenance by an administrator."
                : "No session activity in the last 15 minutes. These are demo devices, not live hardware.",
          lastSeenAt: kiosk.lastSeenAt,
          softwareVersion: kiosk.softwareVersion,
        };
      }),
    };
  }

  /**
   * POST /admin/kiosks/:id/heartbeat — device-authenticated liveness ping (X-Kiosk-Id/Token).
   * Updates lastSeenAt; the fleet table derives Online/Offline from it.
   */
  async heartbeat(request: FastifyRequest, kioskId: string): Promise<unknown> {
    const kioskHeader = request.headers["x-kiosk-id"];
    const tokenHeader = request.headers["x-kiosk-token"];
    if (typeof kioskHeader !== "string" || typeof tokenHeader !== "string")
      throw errors.unauthenticated();
    if (kioskHeader !== kioskId) throw errors.unauthenticated();
    const { kiosk } = await activeDevice(this.deps.db, kioskId, tokenHeader);
    const recorded = this.deps.now().toISOString();
    await this.deps.db
      .updateTable("kiosks")
      .set({ lastSeenAt: recorded, updatedAt: recorded })
      .where("id", "=", kiosk.id)
      .execute();
    await appendAuditEvent(
      this.deps.db,
      this.deps.logger,
      { requestId: String(request.id) },
      {
        tenantId: kiosk.tenantId,
        actorKind: "SYSTEM",
        action: "KIOSK_HEARTBEAT",
        resourceType: "kiosk",
        resourceId: kiosk.id,
        result: "SUCCESS",
      },
    );
    return { kioskId: kiosk.id, lastSeenAt: recorded };
  }

  // -------------------------------------------------------------------------
  // Audit log
  // -------------------------------------------------------------------------

  /** GET /admin/audit — the append-only trail (PHI-free by construction), newest first. */
  async auditLog(
    request: FastifyRequest,
    query: { action?: string; limit: number },
  ): Promise<unknown> {
    const principal = await requireStaff(
      this.deps.db,
      this.deps.config,
      request,
      this.deps.now(),
      "audit.read",
    );
    let selector = this.deps.db
      .selectFrom("audit_events")
      .selectAll()
      .where("tenantId", "=", principal.tenantId);
    if (query.action) selector = selector.where("action", "=", query.action);
    const events = await selector
      .orderBy("createdAt", "desc")
      .limit(query.limit)
      .execute();
    return {
      events: events.map((event) => ({
        id: event.id,
        actorKind: event.actorKind,
        action: event.action,
        resourceType: event.resourceType,
        encounterId: event.encounterId,
        result: event.result,
        detail: event.detailJson ? JSON.parse(event.detailJson) : null,
        createdAt: event.createdAt,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Health
  // -------------------------------------------------------------------------

  /**
   * GET /system/health — subsystem status from live probes. Simulated subsystems are labelled
   * as such; nothing here claims a probe it does not perform.
   */
  async health(): Promise<unknown> {
    const started = Date.now();
    let database: string = "ok";
    try {
      await this.deps.db
        .selectFrom("tenants")
        .select("id")
        .limit(1)
        .executeTakeFirst();
    } catch {
      database = "unavailable";
    }
    let storage: string = "ok";
    try {
      await stat(this.deps.config.MEDIKIOSK_UPLOAD_DIR);
    } catch {
      storage = "not_initialised";
    }
    return {
      status: database === "ok" ? "ok" : "degraded",
      version: "0.1.0",
      deploymentMode: this.deps.config.MEDIKIOSK_DEPLOYMENT_MODE,
      usingDevelopmentSecrets: this.deps.config.usingDevelopmentSecrets,
      checks: {
        api: "ok",
        database,
        storage,
        documentProcessor: {
          provider: this.deps.config.OCR_PROVIDER,
          status:
            this.deps.config.OCR_PROVIDER === "mock"
              ? "MOCKED — deterministic demo extraction only"
              : this.deps.config.OCR_PROVIDER,
        },
      },
      latencyMs: Date.now() - started,
    };
  }

  // -------------------------------------------------------------------------
  // FHIR demo export
  // -------------------------------------------------------------------------

  /**
   * GET /encounters/:id/fhir — deterministic FHIR R4 collection bundle for one encounter.
   * A DEMO interoperability representation: structurally validated, meta-tagged, persisted to
   * fhir_resources, and never transmitted anywhere (no HIE endpoint is configured).
   */
  async fhirBundle(
    request: FastifyRequest,
    encounterId: string,
  ): Promise<unknown> {
    const principal: StaffPrincipal = await requireStaff(
      this.deps.db,
      this.deps.config,
      request,
      this.deps.now(),
      "fhir.generate",
    );
    const tenantId = principal.tenantId;
    const loaded = await loadInterview(this.deps.db, tenantId, encounterId);
    const [vitals, labs, documents] = await Promise.all([
      this.deps.db
        .selectFrom("vitals")
        .selectAll()
        .where("tenantId", "=", tenantId)
        .where("encounterId", "=", encounterId)
        .execute(),
      this.deps.db
        .selectFrom("lab_results")
        .selectAll()
        .where("tenantId", "=", tenantId)
        .where("encounterId", "=", encounterId)
        .execute(),
      this.deps.db
        .selectFrom("documents")
        .selectAll()
        .where("tenantId", "=", tenantId)
        .where("encounterId", "=", encounterId)
        .where("deletedAt", "is", null)
        .execute(),
    ]);

    const displayOf = (code: string): string =>
      conceptByCode(CONCEPT_INDEX, code)?.display ?? code;
    const encounter = loaded.encounter;
    const patient = loaded.patient;
    const generatedAt = this.deps.now().toISOString();

    const exportCase: ExportCase = {
      generatedAt,
      patient: {
        id: patient.id,
        fullName: patient.fullName,
        dateOfBirth: patient.dateOfBirth,
        sex:
          patient.sex === "MALE" ||
          patient.sex === "FEMALE" ||
          patient.sex === "OTHER"
            ? patient.sex
            : null,
        preferredLanguage: patient.preferredLanguage,
        phoneMasked: patient.phoneMasked,
      },
      encounter: {
        id: encounter.id,
        status:
          encounter.status === "COMPLETED"
            ? "finished"
            : encounter.status === "SUBMITTED"
              ? "triaged"
              : "in-progress",
        startedAt: encounter.createdAt,
        endedAt: encounter.completedAt ?? encounter.submittedAt,
        chiefComplaintCodes: JSON.parse(encounter.chiefComplaintCodesJson),
        chiefComplaintVerbatim: encounter.chiefComplaintVerbatim,
        classDisplay: "ambulatory",
      },
      vitals: vitals.map((v) => ({
        id: v.id,
        code: v.conceptCode,
        display: displayOf(v.conceptCode),
        value: v.value,
        unit: v.unit,
        effectiveAt: v.measuredAt,
        ...(v.componentCode ? { componentCode: v.componentCode } : {}),
      })),
      labs: labs.map((l) => ({
        id: l.id,
        code: l.testCode,
        display: displayOf(l.testCode),
        value: l.value,
        unit: l.unit,
        effectiveAt: l.collectedAt,
      })),
      conditions: loaded.conditions
        .filter((h) => h.kind === "CONDITION")
        .map((h) => ({
          id: h.id,
          code: h.conceptCode,
          display: h.displayName,
          clinicalStatus: "active" as const,
          recordedAt: h.createdAt,
        })),
      symptoms: loaded.symptoms.map((s) => ({
        id: s.id,
        code: s.conceptCode,
        display: s.displayName,
        clinicalStatus: "active" as const,
        recordedAt: s.createdAt,
      })),
      medications: loaded.medications.map((m) => ({
        id: m.id,
        code: m.conceptCode || null,
        display: m.asWrittenName,
        dosageText:
          m.frequency && m.frequency !== "UNKNOWN" ? m.frequency : null,
        status:
          m.status === "CURRENT" ? ("active" as const) : ("completed" as const),
        effectiveStart: m.startedOn,
      })),
      allergies: loaded.allergies.map((a) => ({
        id: a.id,
        code: a.conceptCode,
        display: a.freeTextName ?? a.conceptCode ?? "Unknown allergen",
        reactionText: a.reactionText,
        severity: a.severity,
      })),
      documents: documents.map((d) => ({
        id: d.id,
        documentType: d.documentType,
        mimeType: d.mimeType,
        created: d.uploadedAt,
        status: "current" as const,
      })),
    };

    const bundle = mapEncounterBundle(exportCase);
    assertValidBundle(bundle);

    await this.deps.db
      .insertInto("fhir_resources")
      .values({
        id: ulid(),
        tenantId,
        encounterId,
        resourceType: "Bundle",
        resourceId: encounterId,
        version: "1",
        payloadJson: JSON.stringify(bundle),
        createdAt: generatedAt,
      })
      .execute();
    await appendAuditEvent(
      this.deps.db,
      this.deps.logger,
      { requestId: String(request.id) },
      {
        tenantId,
        actorId: principal.userId,
        actorKind: "STAFF",
        action: "FHIR_GENERATED",
        resourceType: "encounter",
        resourceId: encounterId,
        encounterId,
        result: "SUCCESS",
        detail: { resources: bundle.entry.length },
      },
    );
    return {
      demoExport: true,
      notice:
        "Demo interoperability representation. Not connected to any health information exchange.",
      bundle,
    };
  }
}
