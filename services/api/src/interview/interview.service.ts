/**
 * Interview runtime — service orchestration.
 *
 * One authoritative sequence for every clinical mutation (single transaction):
 * authenticate + ownership → consent guard → load InterviewInput (state.repo) → engine
 * (selectNextQuestion / evaluateResponse / computeCompletion) → persist response row → persist
 * evidence → persist fact rows → re-run triage (triage.build) → audit → contract shape.
 *
 * The engine decides *what* to ask and *what* a response means; this service only gates access,
 * persists the outcome and records audit. It never asserts an acuity level (ADR-009).
 */

import { ulid } from "ulid";
import {
  bearerToken,
  verifyToken,
  hasPermission,
  type KioskTokenClaims,
} from "@medikiosk/auth";
import {
  errors,
  MediKioskError,
  isTerminal,
  isOpen,
} from "@medikiosk/shared-types";
import {
  INTERVIEW_RUNTIME_VERSION,
  evaluateResponse,
  selectActivePathways,
  selectNextQuestion,
  type CompletionView,
  type InterviewInput,
  type NextQuestionResult,
  type ResponseOutcome,
} from "@medikiosk/interview-engine";
import {
  PATHWAY_VERSION,
  type InterviewPathway,
  type PathwayQuestion,
} from "@medikiosk/clinical-schema";
import type { FastifyRequest } from "fastify";
import type { AppDatabase } from "../db/kysely";
import type { AppConfig } from "../config/env";
import type { AppLogger } from "../platform/logger";
import type { SessionRow } from "../db/schema";
import type { LoadedInterview } from "./state.repo";
import { sessionFor, assertLocale } from "../kiosk/session.repo";
import { requireConsent } from "../consent/consent.service";
import { replayMutation, type MutationResult } from "../kiosk/replay";
import { appendAuditEvent, type AuditAction } from "../platform/audit";
import { authenticateStaff } from "../auth/middleware/authenticate";
import { parseRoles } from "../auth/repository/user.repo";
import {
  createEncounterAndSession,
  insertEvidenceRow,
  insertResponseRow,
  loadInterview,
  persistFactDeltas,
  recordNoKnownAllergies,
} from "./state.repo";
import { evaluateAndPersistTriage } from "./triage.build";
import type { CreateEncounterBody, ResponseBody } from "./types";

const CONSENT_SCOPE = {
  purpose: "treatment",
  category: "SYMPTOMS",
  action: "CLINICAL_INTAKE",
  destination: "TREATING_HOSPITAL",
} as const;

const QUESTIONNAIRE_VERSION = "1.0.0";

/** A normalised answer's fields the response row / evidence need. */
interface NormalisedView {
  readonly language?: string;
  readonly confidence?: number;
  readonly codeMixed?: boolean;
  readonly negated?: boolean;
  readonly uncertain?: boolean;
}

function normalisedOf(value: unknown): NormalisedView | null {
  if (value && typeof value === "object" && "language" in value)
    return value as NormalisedView;
  return null;
}

function maskName(name: string): string {
  if (name.length <= 2) return "*".repeat(name.length);
  return name.slice(0, 1) + "*".repeat(name.length - 2) + name.slice(-1);
}

export class InterviewService {
  constructor(
    readonly deps: {
      db: AppDatabase;
      config: AppConfig;
      logger: AppLogger;
      now: () => Date;
    },
  ) {}

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

  private async ownerSession(
    tx: AppDatabase,
    principal: KioskTokenClaims,
    now: Date,
  ): Promise<SessionRow> {
    return sessionFor(tx, principal, now);
  }

  private async ownedEncounter(
    tx: AppDatabase,
    principal: KioskTokenClaims,
    encounterId: string,
  ): Promise<LoadedInterview> {
    const loaded = await loadInterview(tx, principal.tenantId, encounterId);
    if (loaded.encounter.sessionId !== principal.sessionId)
      throw errors.notFound("Encounter");
    return loaded;
  }

  private async audit(
    tx: AppDatabase,
    request: FastifyRequest,
    actorKind: "KIOSK" | "STAFF",
    entry: {
      tenantId: string;
      actorId?: string;
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
        actorKind,
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

  /** POST /api/v1/encounters */
  createEncounter(
    request: FastifyRequest,
    principal: KioskTokenClaims,
    body: CreateEncounterBody,
  ): Promise<MutationResult> {
    const now = this.deps.now();
    return replayMutation({
      db: this.deps.db,
      secret: this.deps.config.MEDIKIOSK_SESSION_ENCRYPTION_KEY,
      tenantId: principal.tenantId,
      actor: `session:${principal.sessionId}`,
      route: "encounter.create",
      key: this.key(request),
      body,
      sessionId: principal.sessionId,
      now,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
      authenticate: async (tx) => {
        await this.ownerSession(tx, principal, now);
      },
      execute: async (tx) =>
        this.doCreateEncounter(tx, request, principal, body),
    });
  }

  private async doCreateEncounter(
    tx: AppDatabase,
    request: FastifyRequest,
    principal: KioskTokenClaims,
    body: CreateEncounterBody,
  ): Promise<MutationResult> {
    const now = this.deps.now();
    if (body.sessionId !== principal.sessionId)
      throw errors.notFound("Session");
    if (body.encounterType !== "OPD")
      throw errors.validation("Only OPD encounters are supported.");
    if (
      !Array.isArray(body.chiefComplaintCodes) ||
      body.chiefComplaintCodes.length === 0
    )
      throw errors.validation("At least one chief complaint is required.");
    await assertLocale(tx, principal.tenantId, body.locale);

    const session = await this.ownerSession(tx, principal, now);
    if (session.patientId !== body.patientId) throw errors.notFound("Patient");
    const patient = await tx
      .selectFrom("patients")
      .selectAll()
      .where("id", "=", body.patientId)
      .where("tenantId", "=", principal.tenantId)
      .where("deletedAt", "is", null)
      .executeTakeFirst();
    if (!patient) throw errors.notFound("Patient");

    const scope = {
      tenantId: principal.tenantId,
      patientId: body.patientId,
      sessionId: principal.sessionId,
      ...CONSENT_SCOPE,
    };
    await requireConsent(tx, scope, now);

    const input: InterviewInput = {
      complaints: body.chiefComplaintCodes,
      patient: {
        ...(patient.ageYears === null ? {} : { ageYears: patient.ageYears }),
        ...(patient.sex === "MALE" ||
        patient.sex === "FEMALE" ||
        patient.sex === "OTHER"
          ? { sex: patient.sex }
          : {}),
        ...(patient.pregnant === null
          ? {}
          : { pregnant: patient.pregnant === 1 }),
      },
      responses: [],
      symptomFacts: [],
      conditionCodes: [],
      medicationCodes: [],
      allergyCategories: [],
      vitals: {},
      labFlaggedHigh: [],
      labFlaggedLow: [],
      documentCount: 0,
    };
    const activePathwayKeys = selectActivePathways(input).map((p) => p.key);
    const { encounterId, interviewSessionId } = await createEncounterAndSession(
      tx,
      {
        tenantId: principal.tenantId,
        patientId: body.patientId,
        kioskSessionId: principal.sessionId,
        encounterType: body.encounterType,
        chiefComplaintCodes: body.chiefComplaintCodes,
        chiefComplaintVerbatim: body.chiefComplaintVerbatim ?? null,
        locale: body.locale,
        ayushMode: body.ayushMode ?? false,
        questionnaireVersion:
          body.questionnaireVersion ?? QUESTIONNAIRE_VERSION,
        pathwayVersion: PATHWAY_VERSION,
        runtimeVersion: INTERVIEW_RUNTIME_VERSION,
        activePathwayKeys,
        now: now.toISOString(),
      },
    );
    await this.audit(tx, request, "KIOSK", {
      tenantId: principal.tenantId,
      actorId: principal.sessionId,
      action: "ENCOUNTER_CREATED",
      resourceId: encounterId,
      detail: { complaints: body.chiefComplaintCodes.length },
    });
    await this.audit(tx, request, "KIOSK", {
      tenantId: principal.tenantId,
      actorId: principal.sessionId,
      action: "INTERVIEW_STARTED",
      resourceId: encounterId,
      detail: { pathways: activePathwayKeys.length },
    });
    return {
      status: 201,
      body: {
        encounterId,
        status: "IN_PROGRESS",
        activePathways: activePathwayKeys,
        interviewSessionId,
      },
    };
  }

  /** GET /api/v1/encounters/:encounterId (kiosk owner). */
  async readKiosk(
    request: FastifyRequest,
    principal: KioskTokenClaims,
    encounterId: string,
  ): Promise<unknown> {
    const now = this.deps.now();
    await this.ownerSession(this.deps.db, principal, now);
    const loaded = await this.ownedEncounter(
      this.deps.db,
      principal,
      encounterId,
    );
    return this.buildCaseView(loaded);
  }

  /** GET /api/v1/encounters/:encounterId (staff with patient.read). */
  async readStaff(
    request: FastifyRequest,
    encounterId: string,
  ): Promise<unknown> {
    const staff = await authenticateStaff(
      request,
      this.deps.config,
      this.deps.now(),
    );
    return this.deps.db.transaction().execute(async (tx) => {
      const user = await tx
        .selectFrom("users")
        .selectAll()
        .where("id", "=", staff.userId)
        .where("tenantId", "=", staff.tenantId)
        .where("active", "=", 1)
        .executeTakeFirst();
      const tenant = await tx
        .selectFrom("tenants")
        .select("id")
        .where("id", "=", staff.tenantId)
        .where("deletedAt", "is", null)
        .executeTakeFirst();
      if (!user || !tenant) throw errors.unauthenticated();
      if (!hasPermission(parseRoles(user.rolesJson), "patient.read"))
        throw errors.forbidden();
      const loaded = await loadInterview(tx, staff.tenantId, encounterId);
      await this.audit(tx, request, "STAFF", {
        tenantId: staff.tenantId,
        actorId: staff.userId,
        action: "RECORD_VIEWED",
        resourceId: encounterId,
      });
      return this.buildCaseView(loaded);
    });
  }

  private buildCaseView(loaded: LoadedInterview): unknown {
    const pathways = selectActivePathways(loaded.input);
    const next = selectNextQuestion(loaded.input, pathways);
    const triage = loaded.latestTriage;
    return {
      patient: {
        id: loaded.patient.id,
        fullNameMasked: loaded.patient.fullName
          ? maskName(loaded.patient.fullName)
          : null,
        ageYears: loaded.patient.ageYears,
        sex: loaded.patient.sex,
        guestRef: loaded.patient.guestRef,
      },
      encounter: {
        id: loaded.encounter.id,
        status: loaded.encounter.status,
        encounterType: loaded.encounter.encounterType,
        locale: loaded.encounter.locale,
        ayushMode: loaded.encounter.ayushMode === 1,
        questionnaireVersion: loaded.encounter.questionnaireVersion,
        pathwayVersion: loaded.encounter.pathwayVersion,
        chiefComplaintVerbatim: loaded.encounter.chiefComplaintVerbatim,
        submittedAt: loaded.encounter.submittedAt,
        createdAt: loaded.encounter.createdAt,
      },
      complaints: JSON.parse(
        loaded.encounter.chiefComplaintCodesJson,
      ) as string[],
      interviewSession: {
        id: loaded.interviewSession.id,
        status: loaded.interviewSession.status,
        pathways: JSON.parse(
          loaded.interviewSession.pathwayKeysJson,
        ) as string[],
        pathwayVersion: loaded.interviewSession.pathwayVersion,
        runtimeVersion: loaded.interviewSession.runtimeVersion,
        startedAt: loaded.interviewSession.startedAt,
        completedAt: loaded.interviewSession.completedAt,
      },
      responses: loaded.responses.map((r) => ({
        questionKey: r.questionKey,
        state: r.state,
        rawAnswer: r.rawAnswer,
        normalisedJson: r.normalisedJson ? JSON.parse(r.normalisedJson) : null,
        askCount: r.askCount,
        hintMismatch: r.hintMismatch === 1,
        answeredAt: r.answeredAt,
      })),
      symptomFacts: loaded.symptoms.map((s) => ({
        conceptCode: s.conceptCode,
        displayName: s.displayName,
        severity: s.severity,
        onsetDate: s.onsetDate,
        durationDays: s.durationValue,
        socrates: s.socratesJson ? JSON.parse(s.socratesJson) : {},
      })),
      medications: loaded.medications.map((m) => ({
        conceptCode: m.conceptCode,
        asWrittenName: m.asWrittenName,
        status: m.status,
      })),
      allergies: loaded.allergies.map((a) => ({
        conceptCode: a.conceptCode,
        freeTextName: a.freeTextName,
        category: a.category,
      })),
      latestTriage: triage
        ? {
            level: triage.level,
            priority: triage.priority,
            requiresHumanReview: triage.requiresHumanReview === 1,
            hits: JSON.parse(triage.hitsJson),
            assessedAt: triage.assessedAt,
          }
        : null,
      completion: completionView(next.completion, triage ?? null),
    };
  }

  /** GET .../interview/next */
  async next(
    request: FastifyRequest,
    principal: KioskTokenClaims,
    encounterId: string,
  ): Promise<unknown> {
    const now = this.deps.now();
    await this.ownerSession(this.deps.db, principal, now);
    const loaded = await this.ownedEncounter(
      this.deps.db,
      principal,
      encounterId,
    );
    if (loaded.encounter.status === "SUBMITTED")
      throw new MediKioskError(
        "ENCOUNTER_ALREADY_SUBMITTED",
        "This encounter has already been submitted.",
      );
    const pathways = selectActivePathways(loaded.input);
    const next = selectNextQuestion(loaded.input, pathways);
    return {
      question: next.question,
      progress: next.progress,
      completion: next.completion,
      safetyStatus: loaded.latestTriage?.level ?? "NOT_EVALUATED",
      requiresHumanReview: loaded.latestTriage?.requiresHumanReview === 1,
      rationale: next.rationale,
    };
  }

  /** POST .../interview/response */
  respond(
    request: FastifyRequest,
    principal: KioskTokenClaims,
    encounterId: string,
    body: ResponseBody,
  ): Promise<MutationResult> {
    const now = this.deps.now();
    return replayMutation({
      db: this.deps.db,
      secret: this.deps.config.MEDIKIOSK_SESSION_ENCRYPTION_KEY,
      tenantId: principal.tenantId,
      actor: `session:${principal.sessionId}`,
      route: "interview.response",
      key: this.key(request),
      body,
      sessionId: principal.sessionId,
      now,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
      authenticate: async (tx) => {
        await this.ownerSession(tx, principal, now);
      },
      execute: async (tx) =>
        this.doRespond(tx, request, principal, encounterId, body),
    });
  }

  private async doRespond(
    tx: AppDatabase,
    request: FastifyRequest,
    principal: KioskTokenClaims,
    encounterId: string,
    body: ResponseBody,
  ): Promise<MutationResult> {
    const now = this.deps.now();
    await this.ownerSession(tx, principal, now);
    const loaded = await this.ownedEncounter(tx, principal, encounterId);
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

    const input = loaded.input;
    const pathways = selectActivePathways(input);
    const activeQuestion = this.activeQuestionMap(pathways);
    const current = selectNextQuestion(input, pathways);
    this.assertQuestionActive(input, current, body.questionKey, activeQuestion);

    const prior = input.responses.filter(
      (r) => r.questionKey === body.questionKey,
    );
    const askCount = prior.length + 1;
    const question = activeQuestion.get(body.questionKey);
    const pathwayKey = question?.pathway.key ?? "UNKNOWN";
    const kind = question?.question.kind ?? "";
    const category = question?.question.category ?? "";

    const outcome = evaluateResponse(input, pathways, {
      questionKey: body.questionKey,
      state: body.state,
      rawAnswer: body.rawAnswer ?? "",
      modality: body.modality,
      asrConfidence: body.asrConfidence,
      asrLanguage: body.asrLanguage,
      clientHintJson: body.normalisedAnswer,
      now,
    });

    const normal = normalisedOf(outcome.normalisedJson);
    const language = body.asrLanguage ?? normal?.language ?? "en-IN";
    const recorded = now.toISOString();
    const responseId = await insertResponseRow(tx, {
      tenantId: principal.tenantId,
      encounterId,
      questionKey: body.questionKey,
      pathwayKey,
      kind,
      category,
      state: outcome.state,
      modality: body.modality,
      rawAnswer: body.rawAnswer ?? "",
      normalisedJson: outcome.normalisedJson,
      confidence: normal?.confidence ?? null,
      language,
      codeMixed: normal?.codeMixed ?? false,
      negated: normal?.negated ?? false,
      uncertain: normal?.uncertain ?? false,
      askCount,
      hintMismatch: outcome.hintMismatch,
      answeredAt: recorded,
      createdAt: recorded,
    });

    let evidenceIds: string[] = [];
    if (outcome.evidenceExpected) {
      const evidenceId = await insertEvidenceRow(tx, {
        tenantId: principal.tenantId,
        encounterId,
        responseId,
        rawValue: body.rawAnswer ?? "",
        normalisedJson: outcome.normalisedJson,
        confidence: normal?.confidence ?? null,
        language,
        createdBy: principal.sessionId,
        capturedAt: recorded,
      });
      evidenceIds = [evidenceId];
    }

    await persistFactDeltas(tx, {
      tenantId: principal.tenantId,
      patientId: loaded.encounter.patientId,
      encounterId,
      outcome,
      evidenceId: evidenceIds[0] ?? "",
      askCount,
      now: recorded,
    });

    if (
      body.questionKey === "q.history.allergies" &&
      outcome.state === "ANSWERED" &&
      normal?.negated === true
    ) {
      await recordNoKnownAllergies(tx, {
        tenantId: principal.tenantId,
        patientId: loaded.encounter.patientId,
        recordedBy: principal.sessionId,
        recordedAt: recorded,
      });
    }

    const reloaded = await loadInterview(tx, principal.tenantId, encounterId);
    const pathways2 = selectActivePathways(reloaded.input);
    const triage = await evaluateAndPersistTriage(
      tx,
      reloaded,
      pathways2,
      recorded,
    );

    await this.auditResponseOutcome(
      tx,
      request,
      principal,
      encounterId,
      outcome,
    );

    const next = outcome.next;
    return {
      status: 201,
      body: {
        responseId,
        evidenceIds,
        advisories: outcome.advisories,
        nextQuestionKey: next.question?.key ?? null,
        normalisationAgreed: !outcome.hintMismatch,
        state: outcome.state,
        progress: next.progress,
        completion: next.completion,
        safetyStatus: triage.level,
        requiresHumanReview: triage.requiresHumanReview,
      },
    };
  }

  private async auditResponseOutcome(
    tx: AppDatabase,
    request: FastifyRequest,
    principal: KioskTokenClaims,
    encounterId: string,
    outcome: ResponseOutcome,
  ): Promise<void> {
    let action: AuditAction;
    if (outcome.state === "SKIPPED") action = "QUESTION_SKIPPED";
    else if (
      outcome.state === "DECLINED" ||
      outcome.state === "UNKNOWN" ||
      outcome.state === "NOT_APPLICABLE"
    )
      action = "QUESTION_DECLINED";
    else action = "FACT_EXTRACTED";
    await this.audit(tx, request, "KIOSK", {
      tenantId: principal.tenantId,
      actorId: principal.sessionId,
      action,
      resourceId: encounterId,
      detail: {
        state: outcome.state,
        evidence: outcome.evidenceExpected,
        facts: outcome.facts.length,
      },
    });
    if (
      outcome.state === "NEEDS_CLARIFICATION" ||
      outcome.state === "LOW_CONFIDENCE"
    ) {
      await this.audit(tx, request, "KIOSK", {
        tenantId: principal.tenantId,
        actorId: principal.sessionId,
        action: "CLARIFICATION_REQUESTED",
        resourceId: encounterId,
      });
    }
    if (outcome.advisories.length > 0) {
      await this.audit(tx, request, "KIOSK", {
        tenantId: principal.tenantId,
        actorId: principal.sessionId,
        action: "SAFETY_CONDITION_TRIGGERED",
        resourceId: encounterId,
        detail: { advisories: outcome.advisories.length },
      });
    }
  }

  /** POST .../interview/finish — read-only advisory mirror. */
  async finish(
    request: FastifyRequest,
    principal: KioskTokenClaims,
    encounterId: string,
  ): Promise<unknown> {
    const now = this.deps.now();
    await this.ownerSession(this.deps.db, principal, now);
    const loaded = await this.ownedEncounter(
      this.deps.db,
      principal,
      encounterId,
    );
    const completion = selectNextQuestion(
      loaded.input,
      selectActivePathways(loaded.input),
    ).completion;
    const unanswered = completion.outstandingRequired.filter((key) => {
      return loaded.responses.filter((r) => r.questionKey === key).length === 0;
    });
    return {
      complete: completion.status === "COMPLETE",
      unansweredRequired: unanswered,
      canFinishAnyway: true,
    };
  }

  /** POST .../interview/language */
  language(
    request: FastifyRequest,
    principal: KioskTokenClaims,
    encounterId: string,
    locale: string,
  ): Promise<MutationResult> {
    const now = this.deps.now();
    return replayMutation({
      db: this.deps.db,
      secret: this.deps.config.MEDIKIOSK_SESSION_ENCRYPTION_KEY,
      tenantId: principal.tenantId,
      actor: `session:${principal.sessionId}`,
      route: "interview.language",
      key: this.key(request),
      body: { locale },
      sessionId: principal.sessionId,
      now,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
      authenticate: async (tx) => {
        await this.ownerSession(tx, principal, now);
      },
      execute: async (tx) => {
        const current = this.deps.now();
        await this.ownerSession(tx, principal, current);
        await this.ownedEncounter(tx, principal, encounterId);
        await assertLocale(tx, principal.tenantId, locale);
        await tx
          .updateTable("encounters")
          .set({ locale, updatedAt: current.toISOString() })
          .where("id", "=", encounterId)
          .where("tenantId", "=", principal.tenantId)
          .execute();
        await this.audit(tx, request, "KIOSK", {
          tenantId: principal.tenantId,
          actorId: principal.sessionId,
          action: "INTERVIEW_LANGUAGE_CHANGED",
          resourceId: encounterId,
        });
        return {
          status: 200,
          body: { locale, clinicalStatePreserved: true },
        };
      },
    });
  }

  /** POST .../submit */
  submit(
    request: FastifyRequest,
    principal: KioskTokenClaims,
    encounterId: string,
  ): Promise<MutationResult> {
    const now = this.deps.now();
    return replayMutation({
      db: this.deps.db,
      secret: this.deps.config.MEDIKIOSK_SESSION_ENCRYPTION_KEY,
      tenantId: principal.tenantId,
      actor: `session:${principal.sessionId}`,
      route: "interview.submit",
      key: this.key(request),
      body: { encounterId },
      sessionId: principal.sessionId,
      now,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
      authenticate: async (tx) => {
        await this.ownerSession(tx, principal, now);
      },
      execute: async (tx) => this.doSubmit(tx, request, principal, encounterId),
    });
  }

  private async doSubmit(
    tx: AppDatabase,
    request: FastifyRequest,
    principal: KioskTokenClaims,
    encounterId: string,
  ): Promise<MutationResult> {
    const now = this.deps.now();
    await this.ownerSession(tx, principal, now);
    const loaded = await this.ownedEncounter(tx, principal, encounterId);
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

    const recorded = now.toISOString();
    const pathways = selectActivePathways(loaded.input);
    const triage = await evaluateAndPersistTriage(
      tx,
      loaded,
      pathways,
      recorded,
    );
    const completion = selectNextQuestion(loaded.input, pathways).completion;

    const queueEntryId = await this.upsertQueueEntry(
      tx,
      loaded,
      triage,
      recorded,
    );
    await tx
      .updateTable("encounters")
      .set({ status: "SUBMITTED", submittedAt: recorded, updatedAt: recorded })
      .where("id", "=", encounterId)
      .where("tenantId", "=", principal.tenantId)
      .execute();
    await tx
      .updateTable("interview_sessions")
      .set({ status: "COMPLETED", completedAt: recorded, updatedAt: recorded })
      .where("encounterId", "=", encounterId)
      .where("tenantId", "=", principal.tenantId)
      .execute();
    await tx
      .insertInto("timeline_events")
      .values({
        id: ulid(),
        tenantId: principal.tenantId,
        patientId: loaded.encounter.patientId,
        encounterId,
        eventType: "ENCOUNTER_SUBMITTED",
        eventAt: recorded,
        headline: "Encounter submitted for review",
        detailJson: JSON.stringify({
          level: triage.level,
          priority: triage.priority,
        }),
        evidenceIdsJson: JSON.stringify([]),
        createdAt: recorded,
      })
      .execute();

    await this.audit(tx, request, "KIOSK", {
      tenantId: principal.tenantId,
      actorId: principal.sessionId,
      action: "ENCOUNTER_SUBMITTED",
      resourceId: encounterId,
      detail: {
        level: triage.level,
        incomplete: completion.status !== "COMPLETE",
      },
    });
    await this.audit(tx, request, "KIOSK", {
      tenantId: principal.tenantId,
      actorId: principal.sessionId,
      action: "TRIAGE_TRIGGERED",
      resourceId: encounterId,
      detail: { level: triage.level, queueEntryId: queueEntryId.slice(0, 12) },
    });

    return {
      status: 200,
      body: {
        status: "READY_FOR_REVIEW",
        triageLevel: triage.level,
        priority: triage.priority,
        queueEntryId,
        incomplete: completion.status !== "COMPLETE",
        outstandingRequired: completion.outstandingRequired,
      },
    };
  }

  private async upsertQueueEntry(
    tx: AppDatabase,
    loaded: LoadedInterview,
    triage: {
      level: string;
      priority: string;
      hits: readonly { ruleIdentifier: string; description: string }[];
    },
    recorded: string,
  ): Promise<string> {
    const existing = await tx
      .selectFrom("queue_entries")
      .selectAll()
      .where("encounterId", "=", loaded.encounter.id)
      .where("tenantId", "=", loaded.encounter.tenantId)
      .executeTakeFirst();
    const identifiers = triage.hits.map((h) => h.ruleIdentifier);
    const reason = triage.hits[0]?.description ?? "No rule fired";
    if (existing) {
      await tx
        .updateTable("queue_entries")
        .set({
          priority: triage.priority,
          status: "WAITING",
          reason,
          ruleIdentifiersJson: JSON.stringify(identifiers),
          updatedAt: recorded,
        })
        .where("id", "=", existing.id)
        .execute();
      return existing.id;
    }
    const id = ulid();
    await tx
      .insertInto("queue_entries")
      .values({
        id,
        tenantId: loaded.encounter.tenantId,
        encounterId: loaded.encounter.id,
        patientId: loaded.encounter.patientId,
        priority: triage.priority,
        status: "WAITING",
        reason,
        ruleIdentifiersJson: JSON.stringify(identifiers),
        enqueuedAt: recorded,
        calledAt: null,
        completedAt: null,
        updatedAt: recorded,
      })
      .execute();
    return id;
  }

  private activeQuestionMap(
    activePathways: readonly InterviewPathway[],
  ): Map<string, { pathway: InterviewPathway; question: PathwayQuestion }> {
    const map = new Map<
      string,
      { pathway: InterviewPathway; question: PathwayQuestion }
    >();
    for (const pathway of activePathways) {
      for (const question of pathway.questions) {
        if (!map.has(question.key))
          map.set(question.key, { pathway, question });
      }
    }
    return map;
  }

  /**
   * Gate a response body's question key: it must be the current next question, or an open-state
   * question already asked and within its ask budget — otherwise QUESTION_NOT_ACTIVE /
   * QUESTION_ALREADY_COMPLETED.
   */
  private assertQuestionActive(
    input: InterviewInput,
    current: NextQuestionResult,
    questionKey: string,
    activeQuestion: Map<
      string,
      { pathway: InterviewPathway; question: PathwayQuestion }
    >,
  ): void {
    const asked = input.responses.filter((r) => r.questionKey === questionKey);
    const state =
      asked.length === 0 ? "UNANSWERED" : asked[asked.length - 1]!.state;
    if (asked.length > 0 && isTerminal(state as never)) {
      throw new MediKioskError(
        "QUESTION_ALREADY_COMPLETED",
        `Question "${questionKey}" is already completed and cannot be re-answered.`,
      );
    }
    const currentKey = current.question?.key ?? null;
    if (currentKey === questionKey) return;
    if (currentKey === null)
      throw new MediKioskError(
        "QUESTION_NOT_ACTIVE",
        `Question "${questionKey}" is not currently being asked.`,
      );
    const maxAsks = activeQuestion.get(questionKey)?.question.maxAsks ?? 2;
    const reopenable =
      asked.length >= 1 &&
      (isOpen(state as never) || state === "SKIPPED") &&
      asked.length < maxAsks;
    if (!reopenable)
      throw new MediKioskError(
        "QUESTION_NOT_ACTIVE",
        `Question "${questionKey}" is not currently being asked.`,
      );
  }
}

function completionView(
  completion: CompletionView,
  latestTriage: { level: string; requiresHumanReview: number } | null,
): CompletionView {
  const escalated =
    latestTriage !== null &&
    (latestTriage.level !== "GREEN" || latestTriage.requiresHumanReview === 1);
  if (!escalated) return completion;
  return { ...completion, status: "SAFETY_ESCALATION" };
}
