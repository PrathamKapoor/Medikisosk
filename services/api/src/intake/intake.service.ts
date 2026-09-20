/**
 * Structured intake service — kiosk-owned vitals, history, medication, allergy and review entry.
 *
 * The adaptive interview is one way facts enter the record; these endpoints are the second: the
 * dedicated structured screens the kiosk shows after the interview (review-and-confirm workflow).
 * The same invariants apply as for the interview (ADR-005/007/009):
 *
 *  - ownership: only the kiosk session that created the encounter may mutate it;
 *  - consent guard before every clinical write;
 *  - evidence row first, fact row that references it second — always inside one transaction;
 *  - triage is re-evaluated after every fact-changing mutation;
 *  - every action is audited (PHI-free).
 *
 * Removal is deliberately narrow: only rows written by the patient in THIS encounter, and only
 * before submission. Clinician-entered and document-derived rows are never removable from here.
 */

import { ulid } from "ulid";
import { z } from "zod";
import {
  bearerToken,
  verifyToken,
  type KioskTokenClaims,
} from "@medikiosk/auth";
import { errors, MediKioskError } from "@medikiosk/shared-types";
import {
  convertToCanonical,
  isPlausible,
  vitalDefinition,
  MEDICATION_FREQUENCIES,
  REACTION_SEVERITIES,
} from "@medikiosk/clinical-schema";
import { selectActivePathways } from "@medikiosk/interview-engine";
import type { FastifyRequest } from "fastify";
import type { AppDatabase } from "../db/kysely";
import type { AppConfig } from "../config/env";
import type { AppLogger } from "../platform/logger";
import { sessionFor } from "../kiosk/session.repo";
import { requireConsent } from "../consent/consent.service";
import { replayMutation, type MutationResult } from "../kiosk/replay";
import { appendAuditEvent, type AuditAction } from "../platform/audit";
import { evaluateAndPersistTriage } from "../interview/triage.build";
import {
  loadInterview,
  recordNoKnownAllergies,
  type LoadedInterview,
} from "../interview/state.repo";

const CONSENT_SCOPE = {
  purpose: "treatment",
  category: "SYMPTOMS",
  action: "CLINICAL_INTAKE",
  destination: "TREATING_HOSPITAL",
} as const;

const PATIENT_REPORTED = "PATIENT_REPORTED";
const UNVERIFIED = "UNVERIFIED";

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const vitalEntrySchema = z
  .object({
    code: z.string().min(3).max(32),
    componentCode: z.enum(["SYSTOLIC", "DIASTOLIC"]).optional(),
    value: z.number().finite(),
    unit: z.string().min(1).max(16).optional(),
  })
  .strict();

export const vitalsBodySchema = z
  .object({ vitals: z.array(vitalEntrySchema).min(1).max(20) })
  .strict();

const historyKindSchema = z.enum([
  "CONDITION",
  "SURGERY",
  "FAMILY_HISTORY",
  "HOSPITALISATION",
]);

export const historyBodySchema = z
  .object({
    entries: z
      .array(
        z
          .object({
            kind: historyKindSchema,
            conceptCode: z.string().min(3).max(64).optional(),
            displayName: z.string().min(1).max(200),
            relation: z.string().min(1).max(48).optional(),
            onsetYear: z.number().int().min(1850).max(2100).optional(),
            notes: z.string().min(1).max(500).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(40),
  })
  .strict();

export const medicationsBodySchema = z
  .object({
    medications: z
      .array(
        z
          .object({
            name: z.string().min(1).max(200),
            conceptCode: z.string().min(3).max(64).optional(),
            doseText: z.string().min(1).max(80).optional(),
            frequency: z
              .string()
              .refine(
                (value): value is string =>
                  (MEDICATION_FREQUENCIES as readonly string[]).includes(value),
                "Frequency must be one of the listed options (OD, BD, TDS, ...).",
              )
              .optional(),
            durationDays: z.number().int().min(1).max(3650).optional(),
            startedOn: z.string().min(4).max(10).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(40),
  })
  .strict();

export const allergiesBodySchema = z
  .object({
    allergies: z
      .array(
        z
          .object({
            name: z.string().min(1).max(120),
            conceptCode: z.string().min(3).max(64).optional(),
            reaction: z.string().min(1).max(200).optional(),
            severity: z
              .string()
              .refine(
                (value): value is string =>
                  (REACTION_SEVERITIES as readonly string[]).includes(value),
                "Severity must be one of the listed options.",
              )
              .optional(),
          })
          .strict(),
      )
      .max(40)
      .default([]),
    noKnownAllergies: z.boolean().optional(),
  })
  .strict()
  .refine(
    (body) => body.allergies.length > 0 || body.noKnownAllergies === true,
    "Either allergies or an explicit no-known-allergies statement is required.",
  );

export const removeBodySchema = z
  .object({
    kind: z.enum(["medications", "allergies", "history", "vitals"]),
    rowId: z.string().min(10).max(40),
  })
  .strict();

export type VitalsBody = z.infer<typeof vitalsBodySchema>;
export type HistoryBody = z.infer<typeof historyBodySchema>;
export type MedicationsBody = z.infer<typeof medicationsBodySchema>;
export type AllergiesBody = z.infer<typeof allergiesBodySchema>;
export type RemoveBody = z.infer<typeof removeBodySchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function friendlyVitalError(code: string, message: string): never {
  throw new MediKioskError("VALIDATION_FAILED", message, {
    vitalCode: code,
  });
}

/** Insert an evidence row for a structured-entry fact, returning its id (evidence first). */
async function insertIntakeEvidence(
  tx: AppDatabase,
  args: {
    tenantId: string;
    encounterId: string;
    type: string;
    source: string;
    sourceRef: string | null;
    rawValue: string | null;
    normalisedJson: unknown | null;
    language: string | null;
    createdBy: string;
    capturedAt: string;
  },
): Promise<string> {
  const id = ulid();
  await tx
    .insertInto("evidence")
    .values({
      id,
      tenantId: args.tenantId,
      encounterId: args.encounterId,
      type: args.type,
      originClass: PATIENT_REPORTED,
      source: args.source,
      sourceRef: args.sourceRef,
      rawValue: args.rawValue,
      normalisedJson:
        args.normalisedJson === null || args.normalisedJson === undefined
          ? null
          : JSON.stringify(args.normalisedJson),
      confidence: 0.8,
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

export class IntakeService {
  constructor(
    readonly deps: {
      db: AppDatabase;
      config: AppConfig;
      logger: AppLogger;
      now: () => Date;
    },
  ) {}

  /** Kiosk-session authentication, identical contract to the interview runtime. */
  async authenticate(request: FastifyRequest): Promise<KioskTokenClaims> {
    const token = bearerToken(request.headers.authorization);
    if (!token) throw errors.unauthenticated();
    const result = await verifyToken<KioskTokenClaims>(
      token,
      this.deps.config.MEDIKIOSK_JWT_SECRET,
      "KIOSK",
      { now: this.deps.now() },
    );
    if (!result.ok)
      throw new MediKioskError(
        result.reason === "EXPIRED" ? "SESSION_EXPIRED" : "UNAUTHENTICATED",
        "A valid kiosk session is required.",
      );
    const claims = result.claims;
    if (
      !claims.sessionId ||
      !claims.kioskId ||
      !claims.tenantId ||
      claims.sub !== claims.sessionId
    )
      throw errors.unauthenticated();
    return claims;
  }

  key(request: FastifyRequest) {
    const key = request.headers["idempotency-key"];
    return typeof key === "string" ? key : undefined;
  }

  private async audit(
    tx: AppDatabase,
    request: FastifyRequest,
    entry: {
      tenantId: string;
      actorId: string;
      action: AuditAction;
      resourceId: string;
      detail?: Record<string, string | number | boolean>;
    },
  ): Promise<void> {
    const written = await appendAuditEvent(
      tx,
      this.deps.logger,
      { requestId: request?.id },
      {
        tenantId: entry.tenantId,
        actorId: entry.actorId,
        actorKind: "KIOSK",
        action: entry.action,
        resourceType: "encounter",
        resourceId: entry.resourceId,
        encounterId: entry.resourceId,
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

  /** Shared mutation wrapper: ownership + consent + editability, then the caller's execute. */
  private mutate(
    request: FastifyRequest,
    principal: KioskTokenClaims,
    encounterId: string,
    route: string,
    body: unknown,
    execute: (
      tx: AppDatabase,
      loaded: LoadedInterview,
    ) => Promise<MutationResult>,
  ): Promise<MutationResult> {
    const now = this.deps.now();
    return replayMutation({
      db: this.deps.db,
      secret: this.deps.config.MEDIKIOSK_SESSION_ENCRYPTION_KEY,
      tenantId: principal.tenantId,
      actor: `session:${principal.sessionId}`,
      route,
      key: this.key(request),
      body,
      sessionId: principal.sessionId,
      now,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
      authenticate: async (tx) => {
        await sessionFor(tx, principal, now);
        const loaded = await loadInterview(tx, principal.tenantId, encounterId);
        if (loaded.encounter.sessionId !== principal.sessionId)
          throw errors.notFound("Encounter");
        if (loaded.encounter.status === "SUBMITTED")
          throw new MediKioskError(
            "ENCOUNTER_ALREADY_SUBMITTED",
            "This encounter has already been submitted.",
          );
        await requireConsent(
          tx,
          {
            tenantId: principal.tenantId,
            patientId: loaded.encounter.patientId,
            sessionId: principal.sessionId,
            ...CONSENT_SCOPE,
          },
          now,
        );
      },
      execute: async (tx) => {
        const loaded = await loadInterview(tx, principal.tenantId, encounterId);
        return execute(tx, loaded);
      },
    });
  }

  /** Re-evaluate triage and return the level for the response body. */
  private async refreshTriage(
    tx: AppDatabase,
    loaded: LoadedInterview,
    now: string,
  ): Promise<{ level: string; requiresHumanReview: boolean }> {
    const pathways = selectActivePathways(loaded.input);
    const triage = await evaluateAndPersistTriage(tx, loaded, pathways, now);
    return {
      level: triage.level,
      requiresHumanReview: triage.requiresHumanReview,
    };
  }

  // -------------------------------------------------------------------------
  // Vitals
  // -------------------------------------------------------------------------

  recordVitals(
    request: FastifyRequest,
    principal: KioskTokenClaims,
    encounterId: string,
    body: VitalsBody,
  ): Promise<MutationResult> {
    return this.mutate(
      request,
      principal,
      encounterId,
      "intake.vitals",
      body,
      async (tx, loaded) => {
        const nowIso = this.deps.now().toISOString();
        const inserted: {
          id: string;
          code: string;
          display: string;
          value: number;
          unit: string;
        }[] = [];

        for (const entry of body.vitals) {
          const definition = vitalDefinition(entry.code);
          if (!definition)
            friendlyVitalError(
              entry.code,
              `Unknown vital type "${entry.code}". Choose one of the listed measurements.`,
            );

          const isBloodPressure = entry.code === "MK-VIT-001";
          if (isBloodPressure && !entry.componentCode)
            friendlyVitalError(
              entry.code,
              "Blood pressure needs a systolic or diastolic component.",
            );
          if (!isBloodPressure && entry.componentCode)
            friendlyVitalError(
              entry.code,
              "Only blood pressure takes a systolic/diastolic component.",
            );

          let value = entry.value;
          let unit = definition.canonicalUnit;
          if (entry.unit) {
            const converted = convertToCanonical(
              entry.code,
              entry.value,
              entry.unit,
            );
            if (!converted)
              friendlyVitalError(
                entry.code,
                `Unit "${entry.unit}" is not accepted for ${definition.display}. Expected ${definition.canonicalUnit}.`,
              );
            value = converted.value;
            unit = converted.unit;
          }

          if (!isPlausible(entry.code, value))
            friendlyVitalError(
              entry.code,
              `${definition.display} of ${entry.value} ${entry.unit ?? unit} does not look right. Please check and re-enter (plausible range ${definition.plausibleMin}–${definition.plausibleMax} ${definition.canonicalUnit}).`,
            );

          const evidenceId = await insertIntakeEvidence(tx, {
            tenantId: principal.tenantId,
            encounterId,
            type: "VITAL_READING",
            source: "manual_vitals_entry",
            sourceRef: null,
            rawValue: `${entry.code}${entry.componentCode ? `:${entry.componentCode}` : ""} = ${value} ${unit}`,
            normalisedJson: {
              code: entry.code,
              ...(entry.componentCode
                ? { componentCode: entry.componentCode }
                : {}),
              value,
              unit,
            },
            language: loaded.encounter.locale,
            createdBy: principal.sessionId,
            capturedAt: nowIso,
          });

          const rowId = ulid();
          await tx
            .insertInto("vitals")
            .values({
              id: rowId,
              tenantId: principal.tenantId,
              patientId: loaded.encounter.patientId,
              encounterId,
              conceptCode: entry.code,
              componentCode: entry.componentCode ?? null,
              value,
              unit,
              measuredAt: nowIso,
              source: "MANUAL_ENTRY",
              deviceId: null,
              implausible: 0,
              originClass: PATIENT_REPORTED,
              confidence: 0.95,
              verificationState: UNVERIFIED,
              verifiedAt: null,
              verifiedBy: null,
              createdAt: nowIso,
            })
            .execute();
          // The vitals row cites its evidence via the evidence table's sourceRef convention:
          // link backwards so the trace can find the patient statement behind the reading.
          await tx
            .updateTable("evidence")
            .set({ sourceRef: rowId })
            .where("id", "=", evidenceId)
            .execute();
          inserted.push({
            id: rowId,
            code: entry.code,
            display: definition.display,
            value,
            unit,
          });
        }

        const reloaded = await loadInterview(
          tx,
          principal.tenantId,
          encounterId,
        );
        const triage = await this.refreshTriage(tx, reloaded, nowIso);
        await this.audit(tx, request, {
          tenantId: principal.tenantId,
          actorId: principal.sessionId,
          action: "VITAL_RECORDED",
          resourceId: encounterId,
          detail: { count: inserted.length },
        });
        return {
          status: 201,
          body: {
            vitals: inserted,
            safetyStatus: triage.level,
            requiresHumanReview: triage.requiresHumanReview,
          },
        };
      },
    );
  }

  // -------------------------------------------------------------------------
  // History (conditions, surgeries, family history, hospitalisations)
  // -------------------------------------------------------------------------

  addHistory(
    request: FastifyRequest,
    principal: KioskTokenClaims,
    encounterId: string,
    body: HistoryBody,
  ): Promise<MutationResult> {
    return this.mutate(
      request,
      principal,
      encounterId,
      "intake.history",
      body,
      async (tx, loaded) => {
        const nowIso = this.deps.now().toISOString();
        const inserted: { id: string; kind: string; displayName: string }[] =
          [];

        for (const entry of body.entries) {
          const evidenceId = await insertIntakeEvidence(tx, {
            tenantId: principal.tenantId,
            encounterId,
            type: "HISTORY_STATEMENT",
            source: "manual_history_entry",
            sourceRef: null,
            rawValue: entry.displayName,
            normalisedJson: {
              kind: entry.kind,
              ...(entry.conceptCode ? { conceptCode: entry.conceptCode } : {}),
            },
            language: loaded.encounter.locale,
            createdBy: principal.sessionId,
            capturedAt: nowIso,
          });

          const rowId = ulid();
          await tx
            .insertInto("history_entries")
            .values({
              id: rowId,
              tenantId: principal.tenantId,
              patientId: loaded.encounter.patientId,
              encounterId,
              kind: entry.kind,
              conceptCode: entry.conceptCode ?? null,
              displayName: entry.displayName,
              relation: entry.relation ?? null,
              onsetYear: entry.onsetYear ?? null,
              resolvedYear: null,
              active: entry.kind === "CONDITION" ? 1 : null,
              controlled: null,
              procedureText: null,
              performedOn: null,
              facility: null,
              notes: entry.notes ?? null,
              originClass: PATIENT_REPORTED,
              confidence: 0.8,
              verificationState: UNVERIFIED,
              createdAt: nowIso,
            })
            .execute();
          await tx
            .updateTable("evidence")
            .set({ sourceRef: rowId })
            .where("id", "=", evidenceId)
            .execute();
          inserted.push({
            id: rowId,
            kind: entry.kind,
            displayName: entry.displayName,
          });
        }

        const reloaded = await loadInterview(
          tx,
          principal.tenantId,
          encounterId,
        );
        const triage = await this.refreshTriage(tx, reloaded, nowIso);
        await this.audit(tx, request, {
          tenantId: principal.tenantId,
          actorId: principal.sessionId,
          action: "FACT_EXTRACTED",
          resourceId: encounterId,
          detail: { facts: inserted.length, origin: "history_entry" },
        });
        return {
          status: 201,
          body: {
            history: inserted,
            safetyStatus: triage.level,
            requiresHumanReview: triage.requiresHumanReview,
          },
        };
      },
    );
  }

  // -------------------------------------------------------------------------
  // Medications
  // -------------------------------------------------------------------------

  addMedications(
    request: FastifyRequest,
    principal: KioskTokenClaims,
    encounterId: string,
    body: MedicationsBody,
  ): Promise<MutationResult> {
    return this.mutate(
      request,
      principal,
      encounterId,
      "intake.medications",
      body,
      async (tx, loaded) => {
        const nowIso = this.deps.now().toISOString();
        const inserted: { id: string; name: string; source: string }[] = [];

        for (const entry of body.medications) {
          const evidenceId = await insertIntakeEvidence(tx, {
            tenantId: principal.tenantId,
            encounterId,
            type: "MEDICATION_STATEMENT",
            source: "manual_medication_entry",
            sourceRef: null,
            rawValue: entry.name,
            normalisedJson: {
              ...(entry.conceptCode ? { conceptCode: entry.conceptCode } : {}),
              ...(entry.doseText ? { doseText: entry.doseText } : {}),
              ...(entry.frequency ? { frequency: entry.frequency } : {}),
            },
            language: loaded.encounter.locale,
            createdBy: principal.sessionId,
            capturedAt: nowIso,
          });

          const rowId = ulid();
          await tx
            .insertInto("medications")
            .values({
              id: rowId,
              tenantId: principal.tenantId,
              patientId: loaded.encounter.patientId,
              encounterId,
              conceptCode: entry.conceptCode ?? "",
              asWrittenName: entry.name,
              strengthValue: null,
              strengthUnit: null,
              doseValue: null,
              doseUnit: entry.doseText ?? null,
              frequency: entry.frequency ?? "UNKNOWN",
              route: "",
              durationDays: entry.durationDays ?? null,
              status: "CURRENT",
              startedOn: entry.startedOn ?? null,
              stoppedOn: null,
              isPrescribed: 0,
              documentId: null,
              originClass: PATIENT_REPORTED,
              confidence: 0.8,
              verificationState: UNVERIFIED,
              verifiedAt: null,
              verifiedBy: null,
              createdAt: nowIso,
              updatedAt: nowIso,
            })
            .execute();
          await tx
            .updateTable("evidence")
            .set({ sourceRef: rowId })
            .where("id", "=", evidenceId)
            .execute();
          inserted.push({
            id: rowId,
            name: entry.name,
            source: "PATIENT_REPORTED",
          });
        }

        const reloaded = await loadInterview(
          tx,
          principal.tenantId,
          encounterId,
        );
        const triage = await this.refreshTriage(tx, reloaded, nowIso);
        await this.audit(tx, request, {
          tenantId: principal.tenantId,
          actorId: principal.sessionId,
          action: "FACT_EXTRACTED",
          resourceId: encounterId,
          detail: { facts: inserted.length, origin: "medication" },
        });
        return {
          status: 201,
          body: {
            medications: inserted,
            safetyStatus: triage.level,
            requiresHumanReview: triage.requiresHumanReview,
          },
        };
      },
    );
  }

  // -------------------------------------------------------------------------
  // Allergies
  // -------------------------------------------------------------------------

  addAllergies(
    request: FastifyRequest,
    principal: KioskTokenClaims,
    encounterId: string,
    body: AllergiesBody,
  ): Promise<MutationResult> {
    return this.mutate(
      request,
      principal,
      encounterId,
      "intake.allergies",
      body,
      async (tx, loaded) => {
        const nowIso = this.deps.now().toISOString();
        const inserted: { id: string; name: string }[] = [];

        for (const entry of body.allergies) {
          const evidenceId = await insertIntakeEvidence(tx, {
            tenantId: principal.tenantId,
            encounterId,
            type: "ALLERGY_STATEMENT",
            source: "manual_allergy_entry",
            sourceRef: null,
            rawValue: entry.name,
            normalisedJson: {
              ...(entry.conceptCode ? { conceptCode: entry.conceptCode } : {}),
              ...(entry.reaction ? { reaction: entry.reaction } : {}),
              ...(entry.severity ? { severity: entry.severity } : {}),
            },
            language: loaded.encounter.locale,
            createdBy: principal.sessionId,
            capturedAt: nowIso,
          });

          const rowId = ulid();
          await tx
            .insertInto("allergy_records")
            .values({
              id: rowId,
              tenantId: principal.tenantId,
              patientId: loaded.encounter.patientId,
              encounterId,
              conceptCode: entry.conceptCode ?? null,
              freeTextName: entry.name,
              category: null,
              reactionText: entry.reaction ?? null,
              severity: entry.severity ?? "UNKNOWN",
              onsetDate: null,
              originClass: PATIENT_REPORTED,
              confidence: 0.8,
              verificationState: UNVERIFIED,
              verifiedAt: null,
              verifiedBy: null,
              createdAt: nowIso,
            })
            .execute();
          await tx
            .updateTable("evidence")
            .set({ sourceRef: rowId })
            .where("id", "=", evidenceId)
            .execute();
          inserted.push({ id: rowId, name: entry.name });
        }

        if (body.noKnownAllergies === true) {
          await recordNoKnownAllergies(tx, {
            tenantId: principal.tenantId,
            patientId: loaded.encounter.patientId,
            recordedBy: principal.sessionId,
            recordedAt: nowIso,
          });
        }

        const reloaded = await loadInterview(
          tx,
          principal.tenantId,
          encounterId,
        );
        const triage = await this.refreshTriage(tx, reloaded, nowIso);
        await this.audit(tx, request, {
          tenantId: principal.tenantId,
          actorId: principal.sessionId,
          action: "FACT_EXTRACTED",
          resourceId: encounterId,
          detail: {
            facts: inserted.length,
            origin: "allergy",
            noKnownAllergies: body.noKnownAllergies === true,
          },
        });
        return {
          status: 201,
          body: {
            allergies: inserted,
            noKnownAllergiesRecorded: body.noKnownAllergies === true,
            safetyStatus: triage.level,
            requiresHumanReview: triage.requiresHumanReview,
          },
        };
      },
    );
  }

  // -------------------------------------------------------------------------
  // Removal (pre-submission, this encounter, patient-entered rows only)
  // -------------------------------------------------------------------------

  removeClinicalEntry(
    request: FastifyRequest,
    principal: KioskTokenClaims,
    encounterId: string,
    body: RemoveBody,
  ): Promise<MutationResult> {
    return this.mutate(
      request,
      principal,
      encounterId,
      "intake.remove",
      body,
      async (tx) => {
        const nowIso = this.deps.now().toISOString();
        // One explicit branch per table keeps the Kysely row type concrete.
        const existing =
          body.kind === "medications"
            ? await tx
                .selectFrom("medications")
                .selectAll()
                .where("id", "=", body.rowId)
                .where("tenantId", "=", principal.tenantId)
                .where("encounterId", "=", encounterId)
                .executeTakeFirst()
            : body.kind === "allergies"
              ? await tx
                  .selectFrom("allergy_records")
                  .selectAll()
                  .where("id", "=", body.rowId)
                  .where("tenantId", "=", principal.tenantId)
                  .where("encounterId", "=", encounterId)
                  .executeTakeFirst()
              : body.kind === "history"
                ? await tx
                    .selectFrom("history_entries")
                    .selectAll()
                    .where("id", "=", body.rowId)
                    .where("tenantId", "=", principal.tenantId)
                    .where("encounterId", "=", encounterId)
                    .executeTakeFirst()
                : await tx
                    .selectFrom("vitals")
                    .selectAll()
                    .where("id", "=", body.rowId)
                    .where("tenantId", "=", principal.tenantId)
                    .where("encounterId", "=", encounterId)
                    .executeTakeFirst();
        if (!existing) throw errors.notFound("Entry");
        if (existing.originClass !== PATIENT_REPORTED)
          throw new MediKioskError(
            "ENCOUNTER_NOT_EDITABLE",
            "Only entries the patient entered can be removed here.",
          );

        if (body.kind === "medications")
          await tx
            .deleteFrom("medications")
            .where("id", "=", body.rowId)
            .where("tenantId", "=", principal.tenantId)
            .execute();
        else if (body.kind === "allergies")
          await tx
            .deleteFrom("allergy_records")
            .where("id", "=", body.rowId)
            .where("tenantId", "=", principal.tenantId)
            .execute();
        else if (body.kind === "history")
          await tx
            .deleteFrom("history_entries")
            .where("id", "=", body.rowId)
            .where("tenantId", "=", principal.tenantId)
            .execute();
        else
          await tx
            .deleteFrom("vitals")
            .where("id", "=", body.rowId)
            .where("tenantId", "=", principal.tenantId)
            .execute();
        // Evidence rows are immutable: the statement remains on the record even when the
        // patient withdraws the entry before submission.

        const reloaded = await loadInterview(
          tx,
          principal.tenantId,
          encounterId,
        );
        const triage = await this.refreshTriage(tx, reloaded, nowIso);
        await this.audit(tx, request, {
          tenantId: principal.tenantId,
          actorId: principal.sessionId,
          action: "FACT_REJECTED",
          resourceId: encounterId,
          detail: { kind: body.kind },
        });
        return {
          status: 200,
          body: {
            removed: true,
            kind: body.kind,
            safetyStatus: triage.level,
            requiresHumanReview: triage.requiresHumanReview,
          },
        };
      },
    );
  }

  // -------------------------------------------------------------------------
  // Review assembly + patient confirmation
  // -------------------------------------------------------------------------

  /** GET /encounters/:id/review — every section the patient confirms before submitting. */
  async review(
    request: FastifyRequest,
    principal: KioskTokenClaims,
    encounterId: string,
  ): Promise<unknown> {
    const now = this.deps.now();
    await sessionFor(this.deps.db, principal, now);
    const loaded = await loadInterview(
      this.deps.db,
      principal.tenantId,
      encounterId,
    );
    if (loaded.encounter.sessionId !== principal.sessionId)
      throw errors.notFound("Encounter");

    const [entities, evidenceRows] = await Promise.all([
      this.deps.db
        .selectFrom("document_entities")
        .selectAll()
        .where("tenantId", "=", principal.tenantId)
        .where(
          "documentId",
          "in",
          loaded.documents.length === 0
            ? [""]
            : loaded.documents.map((d) => d.id),
        )
        .execute(),
      this.deps.db
        .selectFrom("evidence")
        .selectAll()
        .where("tenantId", "=", principal.tenantId)
        .where("encounterId", "=", encounterId)
        .orderBy("capturedAt", "asc")
        .execute(),
    ]);

    return {
      patient: {
        displayName: loaded.patient.preferredName ?? loaded.patient.fullName,
        ageYears: loaded.patient.ageYears,
        sex: loaded.patient.sex,
      },
      encounter: {
        id: loaded.encounter.id,
        status: loaded.encounter.status,
        chiefComplaintCodes: JSON.parse(
          loaded.encounter.chiefComplaintCodesJson,
        ) as string[],
        chiefComplaintVerbatim: loaded.encounter.chiefComplaintVerbatim,
        patientConfirmedAt: loaded.encounter.patientConfirmedAt,
      },
      responses: loaded.responses
        .filter((r) => r.state === "ANSWERED")
        .map((r) => ({
          questionKey: r.questionKey,
          rawAnswer: r.rawAnswer,
          language: r.language,
        })),
      symptoms: loaded.symptoms.map((s) => ({
        displayName: s.displayName,
        severity: s.severity,
        durationDays: s.durationValue,
        patientText: s.patientText,
      })),
      history: loaded.conditions.map((h) => ({
        id: h.id,
        kind: h.kind,
        displayName: h.displayName,
        relation: h.relation,
        onsetYear: h.onsetYear,
        originClass: h.originClass,
      })),
      medications: loaded.medications.map((m) => ({
        id: m.id,
        name: m.asWrittenName,
        frequency: m.frequency,
        originClass: m.originClass,
      })),
      allergies: loaded.allergies.map((a) => ({
        id: a.id,
        name: a.freeTextName ?? a.conceptCode,
        reaction: a.reactionText,
        severity: a.severity,
        originClass: a.originClass,
      })),
      vitals: loaded.vitals.map((v) => ({
        id: v.id,
        code: v.conceptCode,
        componentCode: v.componentCode,
        value: v.value,
        unit: v.unit,
      })),
      documents: loaded.documents.map((d) => ({
        id: d.id,
        documentType: d.documentType,
        status: d.status,
        uploadedAt: d.uploadedAt,
        entities: entities
          .filter((e) => e.documentId === d.id)
          .map((e) => ({
            id: e.id,
            kind: e.kind,
            rawText: e.rawText,
            confidence: e.confidence,
            verificationState: e.verificationState,
          })),
      })),
      evidence: evidenceRows.map((e) => ({
        id: e.id,
        type: e.type,
        originClass: e.originClass,
        source: e.source,
        rawValue: e.rawValue,
        confidence: e.confidence,
        verificationState: e.verificationState,
      })),
      safety: loaded.latestTriage
        ? {
            level: loaded.latestTriage.level,
            requiresHumanReview: loaded.latestTriage.requiresHumanReview === 1,
          }
        : null,
    };
  }

  /** POST /encounters/:id/confirm — the explicit review gate before submission. */
  confirmReview(
    request: FastifyRequest,
    principal: KioskTokenClaims,
    encounterId: string,
  ): Promise<MutationResult> {
    return this.mutate(
      request,
      principal,
      encounterId,
      "intake.confirm",
      { encounterId },
      async (tx, loaded) => {
        if (loaded.encounter.patientConfirmedAt)
          return {
            status: 200,
            body: {
              patientConfirmedAt: loaded.encounter.patientConfirmedAt,
              alreadyConfirmed: true,
            },
          };
        const nowIso = this.deps.now().toISOString();
        await tx
          .updateTable("encounters")
          .set({
            patientConfirmedAt: nowIso,
            updatedAt: nowIso,
          })
          .where("id", "=", encounterId)
          .where("tenantId", "=", principal.tenantId)
          .execute();
        await this.audit(tx, request, {
          tenantId: principal.tenantId,
          actorId: principal.sessionId,
          action: "PATIENT_REVIEW_CONFIRMED",
          resourceId: encounterId,
        });
        return {
          status: 200,
          body: { patientConfirmedAt: nowIso, alreadyConfirmed: false },
        };
      },
    );
  }
}
