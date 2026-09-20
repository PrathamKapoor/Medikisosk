/**
 * Clinical summary persistence.
 *
 * Assembles the builder input from tenant-scoped rows, renders the twelve deterministic sections
 * and stores them (one active summary per encounter — regeneration replaces the previous draft).
 * Summaries are SYSTEM_DERIVED drafts: `verified` stays 0 until a clinician attests, and doctor
 * edits land on the sections with an audit trail (SUMMARY_EDITED).
 */

import { ulid } from "ulid";
import {
  bearerToken,
  verifyToken,
  type KioskTokenClaims,
} from "@medikiosk/auth";
import { errors, MediKioskError } from "@medikiosk/shared-types";
import { conceptByCode, CONCEPT_INDEX } from "@medikiosk/clinical-schema";
import {
  compareEncounters,
  type ChangeItem,
  type EncounterSnapshot,
} from "@medikiosk/longitudinal";
import { loadSnapshotRows, toSnapshot } from "../clinical/snapshots";
import type { FastifyRequest } from "fastify";
import type { AppDatabase } from "../db/kysely";
import type { AppConfig } from "../config/env";
import type { AppLogger } from "../platform/logger";
import { appendAuditEvent } from "../platform/audit";
import { sessionFor } from "../kiosk/session.repo";
import { loadInterview } from "../interview/state.repo";
import { requireStaff } from "../clinical/staff";
import {
  buildSummarySections,
  SUMMARY_SECTION_KEYS,
  type SummaryFact,
  type SummaryInput,
} from "./summary.builder";

const DETERMINISTIC_PROVIDER = "medikiosk-deterministic-v1";

function socratesEvidenceIds(socratesJson: string | null): string[] {
  if (!socratesJson) return [];
  try {
    const slots = JSON.parse(socratesJson) as Record<
      string,
      { evidenceIds?: unknown }
    >;
    return Object.values(slots).flatMap((slot) =>
      Array.isArray(slot?.evidenceIds) ? (slot.evidenceIds as string[]) : [],
    );
  } catch {
    return [];
  }
}

function collectionEvidenceIds(
  evidence: readonly {
    source: string;
    sourceRef: string | null;
    id: string;
  }[],
  source: string,
  ref: string,
): string[] {
  return evidence
    .filter((row) => row.source === source && row.sourceRef === ref)
    .map((row) => row.id);
}

function snapshotOf(
  complaints: readonly string[],
  rows: {
    symptoms: readonly {
      conceptCode: string;
      severity: string | null;
      durationValue: number | null;
    }[];
    medications: readonly {
      conceptCode: string;
      status: string;
      startedOn: string | null;
    }[];
    allergies: readonly {
      conceptCode: string | null;
      freeTextName: string | null;
    }[];
    labs: readonly { testCode: string; value: number; flag: string }[];
    vitals: readonly { conceptCode: string; value: number }[];
    documentCount: number;
  },
): EncounterSnapshot {
  return toSnapshot({ complaints, ...rows });
}

export class SummaryService {
  constructor(
    readonly deps: {
      db: AppDatabase;
      config: AppConfig;
      logger: AppLogger;
      now: () => Date;
    },
  ) {}

  /**
   * GET /encounters/:id/summary — staff (`summary.read`) or the owning kiosk session.
   * Generates the deterministic draft on first read, then serves the stored version.
   */
  async read(request: FastifyRequest, encounterId: string): Promise<unknown> {
    // Staff path first: the console is the primary reader.
    try {
      const principal = await requireStaff(
        this.deps.db,
        this.deps.config,
        request,
        this.deps.now(),
        "summary.read",
      );
      return this.readForTenant(principal.tenantId, encounterId, {
        actorId: principal.userId,
        actorKind: "STAFF" as const,
        requestId: String(request.id),
      });
    } catch (error) {
      // Only an absent staff credential falls through to the kiosk session path. A staff member
      // who authenticated but lacks the permission fails closed here (FORBIDDEN), never as a
      // kiosk session.
      if (
        !(error instanceof MediKioskError) ||
        error.code !== "UNAUTHENTICATED"
      )
        throw error;
      // Kiosk fallback: the owning session may re-read its own summary.
      const token = bearerToken(request.headers.authorization);
      if (!token) throw errors.unauthenticated();
      const verified = await verifyToken<KioskTokenClaims>(
        token,
        this.deps.config.MEDIKIOSK_JWT_SECRET,
        "KIOSK",
        { now: this.deps.now() },
      );
      if (!verified.ok) throw errors.unauthenticated();
      const claims = verified.claims;
      await sessionFor(this.deps.db, claims, this.deps.now());
      const encounter = await this.deps.db
        .selectFrom("encounters")
        .selectAll()
        .where("id", "=", encounterId)
        .where("tenantId", "=", claims.tenantId)
        .where("deletedAt", "is", null)
        .executeTakeFirst();
      if (!encounter || encounter.sessionId !== claims.sessionId)
        throw errors.notFound("Encounter");
      return this.readForTenant(claims.tenantId, encounterId, {
        actorId: claims.sessionId,
        actorKind: "KIOSK" as const,
        requestId: String(request.id),
      });
    }
  }

  /**
   * Tenant-scoped read for server-side composition (the case view embeds the summary).
   * The caller owns authentication; generation is audited to the given actor.
   */
  async summarise(
    tenantId: string,
    encounterId: string,
    audit: { actorId: string; actorKind: "STAFF" | "KIOSK"; requestId: string },
  ): Promise<unknown> {
    return this.readForTenant(tenantId, encounterId, audit);
  }

  private async readForTenant(
    tenantId: string,
    encounterId: string,
    audit: { actorId: string; actorKind: "STAFF" | "KIOSK"; requestId: string },
  ): Promise<unknown> {
    const existing = await this.deps.db
      .selectFrom("summaries")
      .selectAll()
      .where("tenantId", "=", tenantId)
      .where("encounterId", "=", encounterId)
      .orderBy("createdAt", "desc")
      .executeTakeFirst();
    const summaryId = existing
      ? existing.id
      : await this.generate(tenantId, encounterId, {
          actorId: audit.actorId,
          actorKind: audit.actorKind,
        });
    const sections = await this.deps.db
      .selectFrom("summary_sections")
      .selectAll()
      .where("summaryId", "=", summaryId)
      .execute();
    // Canonical section order is the builder's contract, not the storage scan order.
    const position = new Map<string, number>(
      SUMMARY_SECTION_KEYS.map((key, index) => [key, index] as const),
    );
    sections.sort(
      (a, b) =>
        (position.get(a.sectionKey) ?? 99) - (position.get(b.sectionKey) ?? 99),
    );
    const summary = await this.deps.db
      .selectFrom("summaries")
      .selectAll()
      .where("id", "=", summaryId)
      .executeTakeFirstOrThrow();
    return {
      summaryId,
      encounterId,
      provider: JSON.parse(summary.providerJson),
      verified: summary.verified === 1,
      verifiedBy: summary.verifiedBy,
      verifiedAt: summary.verifiedAt,
      sections: sections.map((section) => ({
        sectionKey: section.sectionKey,
        kind: section.kind,
        text: section.text,
        verificationState: section.verificationState,
        evidenceIds: JSON.parse(section.evidenceIdsJson) as string[],
      })),
    };
  }

  /** Build the input, render sections and persist (replacing any previous draft). */
  private async generate(
    tenantId: string,
    encounterId: string,
    audit: { actorId: string; actorKind: "STAFF" | "KIOSK" },
  ): Promise<string> {
    const nowIso = this.deps.now().toISOString();
    return this.deps.db.transaction().execute(async (tx) => {
      const loaded = await loadInterview(tx, tenantId, encounterId);
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
        encounters,
      ] = await Promise.all([
        tx
          .selectFrom("vitals")
          .selectAll()
          .where("tenantId", "=", tenantId)
          .where("encounterId", "=", encounterId)
          .execute(),
        tx
          .selectFrom("lab_results")
          .selectAll()
          .where("tenantId", "=", tenantId)
          .where("encounterId", "=", encounterId)
          .execute(),
        tx
          .selectFrom("documents")
          .selectAll()
          .where("tenantId", "=", tenantId)
          .where("encounterId", "=", encounterId)
          .where("deletedAt", "is", null)
          .execute(),
        tx
          .selectFrom("document_entities")
          .selectAll()
          .where("tenantId", "=", tenantId)
          .execute(),
        tx
          .selectFrom("evidence")
          .selectAll()
          .where("tenantId", "=", tenantId)
          .where("encounterId", "=", encounterId)
          .execute(),
        tx
          .selectFrom("triage_assessments")
          .selectAll()
          .where("tenantId", "=", tenantId)
          .where("encounterId", "=", encounterId)
          .orderBy("assessedAt", "desc")
          .executeTakeFirst(),
        tx
          .selectFrom("encounter_notes")
          .selectAll()
          .where("tenantId", "=", tenantId)
          .where("encounterId", "=", encounterId)
          .orderBy("createdAt", "asc")
          .execute(),
        tx
          .selectFrom("diagnoses")
          .selectAll()
          .where("tenantId", "=", tenantId)
          .where("encounterId", "=", encounterId)
          .execute(),
        tx
          .selectFrom("encounters")
          .selectAll()
          .where("tenantId", "=", tenantId)
          .where("patientId", "=", encounter.patientId)
          .where("deletedAt", "is", null)
          .orderBy("createdAt", "desc")
          .execute(),
      ]);

      const displayOf = (code: string): string =>
        conceptByCode(CONCEPT_INDEX, code)?.display ?? code;

      const fact = (
        label: string,
        originClass: string,
        verificationState: string,
        detail?: string,
        evidenceIds?: readonly string[],
      ): SummaryFact => ({
        label,
        ...(detail ? { detail } : {}),
        originClass,
        verificationState,
        ...(evidenceIds ? { evidenceIds } : {}),
      });

      const complaints: string[] = JSON.parse(
        encounter.chiefComplaintCodesJson,
      );
      const previous = encounters.filter((e) => e.id !== encounterId);
      const previousEncounters = previous.slice(0, 5).map((e) => ({
        id: e.id,
        createdAt: e.createdAt,
        status: e.status,
        complaints: JSON.parse(e.chiefComplaintCodesJson) as string[],
        disposition: e.disposition,
      }));

      // What changed vs the most recent previous encounter (rows re-queried per encounter).
      let changes: readonly ChangeItem[] = [];
      const previousEncounter = previous[0];
      if (previousEncounter) {
        const previousRows = await loadSnapshotRows(
          tx,
          tenantId,
          previousEncounter.id,
          JSON.parse(previousEncounter.chiefComplaintCodesJson),
        );
        changes = compareEncounters(
          toSnapshot(previousRows),
          snapshotOf(complaints, {
            symptoms: loaded.symptoms,
            medications: loaded.medications,
            allergies: loaded.allergies,
            labs,
            vitals,
            documentCount: documents.length,
          }),
        );
      }

      const input: SummaryInput = {
        patient: {
          fullName: patient.fullName,
          ageYears: patient.ageYears,
          sex: patient.sex,
          preferredLanguage: patient.preferredLanguage,
        },
        encounter: {
          id: encounter.id,
          chiefComplaintCodes: complaints,
          chiefComplaintCodesLabelled: complaints.map((code) => ({
            code,
            display: displayOf(code),
          })),
          chiefComplaintVerbatim: encounter.chiefComplaintVerbatim,
          locale: encounter.locale,
          createdAt: encounter.createdAt,
          submittedAt: encounter.submittedAt,
          patientConfirmedAt: encounter.patientConfirmedAt,
        },
        symptoms: loaded.symptoms.map((s) =>
          fact(
            s.displayName,
            s.originClass,
            s.verificationState,
            [
              s.severity ? `severity ${s.severity}` : null,
              s.durationValue !== null ? `${s.durationValue} days` : null,
              s.patientText ? `"${s.patientText}"` : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined,
            socratesEvidenceIds(s.socratesJson),
          ),
        ),
        conditions: loaded.conditions.map((h) =>
          fact(
            h.displayName,
            h.originClass,
            h.verificationState,
            [
              h.kind,
              h.relation ? `relation: ${h.relation}` : null,
              h.onsetYear ? `since ${h.onsetYear}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined,
          ),
        ),
        medications: loaded.medications.map((m) =>
          fact(
            m.asWrittenName,
            m.originClass,
            m.verificationState,
            [
              m.frequency && m.frequency !== "UNKNOWN" ? m.frequency : null,
              m.documentId ? "from document" : "patient stated",
            ]
              .filter(Boolean)
              .join(" · ") || undefined,
            collectionEvidenceIds(
              evidence,
              "manual_medication_entry",
              m.id,
            ).concat(
              collectionEvidenceIds(evidence, "document", m.documentId ?? ""),
            ),
          ),
        ),
        allergies: loaded.allergies.map((a) =>
          fact(
            a.freeTextName ?? a.conceptCode ?? "Unknown allergen",
            a.originClass,
            a.verificationState,
            [
              a.reactionText ? `reaction: ${a.reactionText}` : null,
              a.severity && a.severity !== "UNKNOWN" ? a.severity : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined,
          ),
        ),
        vitals: vitals.map((v) =>
          fact(
            `${displayOf(v.conceptCode)}${v.componentCode ? ` (${v.componentCode})` : ""}`,
            v.originClass,
            v.verificationState,
            `${v.value} ${v.unit}`,
            collectionEvidenceIds(evidence, "manual_vitals_entry", v.id),
          ),
        ),
        labs: labs.map((l) =>
          fact(
            displayOf(l.testCode),
            l.originClass,
            l.verificationState,
            `${l.value} ${l.unit} (${l.flag})`,
          ),
        ),
        documents: documents.map((d) => ({
          documentType: d.documentType,
          status: d.status,
          entities: entities
            .filter((e) => e.documentId === d.id)
            .map((e) => ({
              kind: e.kind,
              rawText: e.rawText,
              verificationState: e.verificationState,
            })),
        })),
        triage: triage
          ? {
              level: triage.level,
              priority: triage.priority,
              requiresHumanReview: triage.requiresHumanReview === 1,
              explanation: triage.explanation,
              hits: (
                JSON.parse(triage.hitsJson) as {
                  identifier: string;
                  description: string;
                  clinicalRationale: string;
                  severity: string;
                }[]
              ).map((hit) => ({
                identifier: hit.identifier,
                description: hit.description,
                clinicalRationale: hit.clinicalRationale,
                severity: hit.severity,
              })),
            }
          : null,
        previousEncounters,
        changes,
        notes: notes.map((n) => ({
          authorName: n.authorName,
          note: n.note,
          createdAt: n.createdAt,
        })),
        diagnoses: diagnoses.map((d) => ({
          displayText: d.displayText,
          status: d.status,
        })),
      };

      const sections = buildSummarySections(input);

      // One active draft per encounter: replace any previous draft's sections.
      const prior = await tx
        .selectFrom("summaries")
        .selectAll()
        .where("tenantId", "=", tenantId)
        .where("encounterId", "=", encounterId)
        .orderBy("createdAt", "desc")
        .executeTakeFirst();
      let summaryId: string;
      if (prior) {
        summaryId = prior.id;
        await tx
          .deleteFrom("summary_sections")
          .where("summaryId", "=", summaryId)
          .execute();
      } else {
        summaryId = ulid();
        await tx
          .insertInto("summaries")
          .values({
            id: summaryId,
            tenantId,
            encounterId,
            providerJson: JSON.stringify({
              provider: "deterministic",
              model: DETERMINISTIC_PROVIDER,
            }),
            ungroundedClaimCount: 0,
            verified: 0,
            verifiedBy: null,
            verifiedAt: null,
            attestation: null,
            createdAt: nowIso,
          })
          .execute();
      }
      for (const section of sections) {
        await tx
          .insertInto("summary_sections")
          .values({
            id: ulid(),
            summaryId,
            sectionKey: section.sectionKey,
            text: section.text,
            kind: section.kind,
            evidenceIdsJson: JSON.stringify(section.evidenceIds),
            verificationState: "UNVERIFIED",
            originalAiText: null,
            editedBy: null,
            editedAt: null,
          })
          .execute();
      }
      await appendAuditEvent(
        tx,
        this.deps.logger,
        { requestId: "summary-generate" },
        {
          tenantId,
          actorId: audit.actorId,
          actorKind: audit.actorKind,
          action: "SUMMARY_GENERATED",
          resourceType: "encounter",
          resourceId: encounterId,
          encounterId,
          result: "SUCCESS",
          detail: { sections: sections.length },
        },
      );
      return summaryId;
    });
  }
}
