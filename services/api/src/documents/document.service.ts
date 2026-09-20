/**
 * Document pipeline service — upload, validation, mock-OCR extraction, patient confirmation and
 * clinician verification.
 *
 * The honest contract (ADR-003): the OCR provider is the deterministic mock unless the operator
 * configures `OCR_PROVIDER` otherwise. The mock recognises only registered synthetic bytes by
 * SHA-256; anything else yields an explicit UNRECOGNISED issue and zero entities — never
 * fabricated text. The UI labels this "Demo extraction".
 *
 * Persistence order (ADR-005): document row → evidence row → entity row → (on patient
 * confirmation) clinical fact rows. Every mutation runs inside `replayMutation` with the kiosk
 * consent guard; clinician verification is staff-only (`document.verify`).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { ulid } from "ulid";
import { z } from "zod";
import {
  bearerToken,
  hasPermission,
  verifyToken,
  type KioskTokenClaims,
} from "@medikiosk/auth";
import { errors, MediKioskError } from "@medikiosk/shared-types";
import { DeterministicMockOcrProvider } from "@medikiosk/ai";
import { flagLabResult, labTestDefinition } from "@medikiosk/clinical-schema";
import { selectActivePathways } from "@medikiosk/interview-engine";
import type { FastifyRequest } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import type { Transaction } from "kysely";
import type { AppDatabase } from "../db/kysely";
import type { Database } from "../db/schema";
import type { AppConfig } from "../config/env";
import type { AppLogger } from "../platform/logger";
import { sessionFor } from "../kiosk/session.repo";
import { requireConsent } from "../consent/consent.service";
import { replayMutation, type MutationResult } from "../kiosk/replay";
import { appendAuditEvent, type AuditAction } from "../platform/audit";
import { authenticateStaff } from "../auth/middleware/authenticate";
import { parseRoles } from "../auth/repository/user.repo";
import { evaluateAndPersistTriage } from "../interview/triage.build";
import { loadInterview, type LoadedInterview } from "../interview/state.repo";
import {
  demoDocumentByName,
  DEMO_DOCUMENTS,
  mockOcrEntries,
} from "./demo-docs";
import { parseDocumentEntities } from "./parse-entities";

const CONSENT_SCOPE = {
  purpose: "treatment",
  category: "SYMPTOMS",
  action: "CLINICAL_INTAKE",
  destination: "TREATING_HOSPITAL",
} as const;

const PATIENT_REPORTED = "PATIENT_REPORTED";
const DOCUMENT_DERIVED = "DOCUMENT_DERIVED";
const UNVERIFIED = "UNVERIFIED";

const DOCUMENT_TYPES = [
  "PRESCRIPTION",
  "LAB_REPORT",
  "DISCHARGE_SUMMARY",
  "MEDICAL_CERTIFICATE",
  "OTHER",
] as const;

/** Client-safe MIME allowlist: clinical paperwork arrives as text, PDF or phone-camera images. */
const ALLOWED_MIME: Record<string, string> = {
  "text/plain": ".txt",
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
};
const ALLOWED_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
]);
/** Executable / active-content extensions are never accepted, whatever the MIME claims. */
const BLOCKED_EXTENSIONS = new Set([
  ".exe",
  ".msi",
  ".bat",
  ".cmd",
  ".com",
  ".scr",
  ".ps1",
  ".vbs",
  ".js",
  ".jar",
  ".apk",
  ".dll",
  ".sh",
  ".html",
  ".htm",
  ".svg",
  ".swf",
  ".lnk",
]);

export const verifyEntityBodySchema = z
  .object({
    action: z.enum(["VERIFY", "REJECT", "EDIT"]),
    correctedJson: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .refine(
    (body) => body.action !== "EDIT" || body.correctedJson !== undefined,
    "EDIT requires correctedJson with the corrected fields.",
  );

export type VerifyEntityBody = z.infer<typeof verifyEntityBodySchema>;

function extOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

function sanitiseOriginalName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "document";
  return base.replace(/[^\w.\-() ]/g, "_").slice(0, 120) || "document";
}

function sha256HexBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export class DocumentService {
  private readonly ocr: DeterministicMockOcrProvider;

  constructor(
    readonly deps: {
      db: AppDatabase;
      config: AppConfig;
      logger: AppLogger;
      now: () => Date;
    },
  ) {
    this.ocr = new DeterministicMockOcrProvider(mockOcrEntries());
  }

  // -------------------------------------------------------------------------
  // Authentication
  // -------------------------------------------------------------------------

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

  /** Staff principal holding a permission, or FORBIDDEN (404-style cross-tenant stays in repo). */
  private async staffWith(
    request: FastifyRequest,
    permission: "document.read" | "document.verify",
  ): Promise<{ userId: string; displayName: string; tenantId: string }> {
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
      if (!user) throw errors.unauthenticated();
      if (!hasPermission(parseRoles(user.rolesJson), permission))
        throw errors.forbidden();
      return {
        userId: user.id,
        displayName: user.displayName,
        tenantId: staff.tenantId,
      };
    });
  }

  key(request: FastifyRequest) {
    const key = request.headers["idempotency-key"];
    return typeof key === "string" ? key : undefined;
  }

  private async audit(
    tx: AppDatabase,
    request: FastifyRequest,
    actorKind: "KIOSK" | "STAFF",
    entry: {
      tenantId: string;
      actorId: string;
      action: AuditAction;
      resourceType?: string;
      resourceId: string;
      encounterId?: string;
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
        resourceType: entry.resourceType ?? "document",
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

  // -------------------------------------------------------------------------
  // Upload + extraction
  // -------------------------------------------------------------------------

  /**
   * POST /encounters/:id/documents — multipart upload, validate, store, extract.
   *
   * The idempotency body is the file's identity (type, name, size, checksum): re-uploading the
   * identical file replays the identical result instead of duplicating the document. Storage names
   * are content-addressed (`<sha256>.<ext>`), so a retry never orphans a second file.
   */
  async upload(
    request: FastifyRequest,
    principal: KioskTokenClaims,
    encounterId: string,
    file: MultipartFile,
    documentType: string,
  ): Promise<MutationResult> {
    if (
      !DOCUMENT_TYPES.includes(documentType as (typeof DOCUMENT_TYPES)[number])
    )
      throw errors.validation(
        "Document type must be one of PRESCRIPTION, LAB_REPORT, DISCHARGE_SUMMARY, MEDICAL_CERTIFICATE or OTHER.",
      );
    const now = this.deps.now();
    const bytes = await file.toBuffer();
    const maxBytes = this.deps.config.DOCUMENT_MAX_UPLOAD_MB * 1024 * 1024;
    if (bytes.length === 0)
      throw new MediKioskError(
        "DOCUMENT_MALFORMED",
        "The uploaded file is empty.",
      );
    if (bytes.length > maxBytes)
      throw new MediKioskError(
        "PAYLOAD_TOO_LARGE",
        `The file is too large. The limit is ${this.deps.config.DOCUMENT_MAX_UPLOAD_MB} MB.`,
      );
    const originalName = sanitiseOriginalName(file.filename || "document");
    const extension = extOf(originalName);
    if (BLOCKED_EXTENSIONS.has(extension))
      throw new MediKioskError(
        "DOCUMENT_TYPE_UNSUPPORTED",
        "Executable and active-content files are not accepted.",
      );
    // Client-supplied MIME is advisory only: the extension must be known AND the MIME must be
    // one of the allowlist (unknown MIME is refused rather than sniffed).
    if (!ALLOWED_MIME[file.mimetype] || !ALLOWED_EXTENSIONS.has(extension))
      throw new MediKioskError(
        "DOCUMENT_TYPE_UNSUPPORTED",
        "Only text, PDF and image files (txt, md, pdf, jpg, png) are accepted.",
      );

    const checksum = sha256HexBytes(bytes);
    const storageName = `${checksum}${ALLOWED_MIME[file.mimetype]}`;
    const fingerprint = {
      documentType,
      originalName,
      byteSize: bytes.length,
      checksum,
    };

    return replayMutation({
      db: this.deps.db,
      secret: this.deps.config.MEDIKIOSK_SESSION_ENCRYPTION_KEY,
      tenantId: principal.tenantId,
      actor: `session:${principal.sessionId}`,
      route: "document.upload",
      key: this.key(request),
      body: fingerprint,
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
        const recorded = this.deps.now().toISOString();
        const loaded = await loadInterview(tx, principal.tenantId, encounterId);

        // Content-addressed dedup: the identical file on the same encounter returns the
        // existing document instead of a duplicate row.
        const duplicate = await tx
          .selectFrom("documents")
          .selectAll()
          .where("tenantId", "=", principal.tenantId)
          .where("encounterId", "=", encounterId)
          .where("checksum", "=", checksum)
          .where("deletedAt", "is", null)
          .executeTakeFirst();
        if (duplicate) {
          const existing = await this.listForTenant(
            tx,
            principal.tenantId,
            encounterId,
          );
          const match = existing.find((d) => d.id === duplicate.id);
          return {
            status: 200,
            body: {
              documentId: duplicate.id,
              documentType: duplicate.documentType,
              status: duplicate.status,
              demoExtraction: true,
              ocrConfidence: duplicate.ocrConfidence,
              alreadyExisted: true,
              entities: match?.entities ?? [],
            },
          };
        }

        // Content-addressed storage: writing the same bytes twice lands on the same path.
        await mkdir(this.deps.config.MEDIKIOSK_UPLOAD_DIR, { recursive: true });
        await writeFile(
          join(this.deps.config.MEDIKIOSK_UPLOAD_DIR, storageName),
          bytes,
        );

        const documentId = ulid();
        const ocrResult = await this.ocr.extract({
          documentId,
          pages: [
            {
              pageNumber: 1,
              mimeType: file.mimetype,
              bytesBase64: Buffer.from(bytes).toString("base64"),
            },
          ],
          languageHint: loaded.encounter.locale,
        });

        const pageText = ocrResult.pages[0]?.text ?? "";
        const ocrIssues = ocrResult.pages.flatMap((p) => p.issues);
        const entities = pageText ? [...parseDocumentEntities(pageText)] : [];

        await tx
          .insertInto("documents")
          .values({
            id: documentId,
            tenantId: principal.tenantId,
            patientId: loaded.encounter.patientId,
            encounterId,
            documentType,
            mimeType: file.mimetype,
            byteSize: bytes.length,
            pageCount: 1,
            storagePath: storageName,
            checksum,
            status: "EXTRACTED",
            qualityJson: JSON.stringify({
              originalName,
              ocrProvider: "mock-ocr",
              demoExtraction: true,
              issues: ocrIssues,
            }),
            ocrConfidence: ocrResult.overallConfidence,
            uploadedAt: recorded,
            processedAt: recorded,
            createdAt: recorded,
            deletedAt: null,
          })
          .execute();
        await tx
          .insertInto("document_pages")
          .values({
            id: ulid(),
            documentId,
            pageNumber: 1,
            ocrText: pageText || null,
            qualityScore: ocrResult.overallConfidence,
            createdAt: recorded,
          })
          .execute();

        const inserted: {
          id: string;
          kind: string;
          rawText: string;
          confidence: number;
          conceptCode: string | null;
          testCode: string | null;
        }[] = [];
        for (const entity of entities) {
          const evidenceId = ulid();
          await tx
            .insertInto("evidence")
            .values({
              id: evidenceId,
              tenantId: principal.tenantId,
              encounterId,
              type: "DOCUMENT_ENTITY",
              originClass: DOCUMENT_DERIVED,
              source: "document",
              sourceRef: documentId,
              rawValue: entity.rawText,
              normalisedJson: JSON.stringify(entity.normalised),
              confidence: entity.confidence,
              language: loaded.encounter.locale,
              capturedAt: recorded,
              createdBy: principal.sessionId,
              verificationState: UNVERIFIED,
              verifiedAt: null,
              verifiedBy: null,
              supersededBy: null,
            })
            .execute();
          const entityId = ulid();
          await tx
            .insertInto("document_entities")
            .values({
              id: entityId,
              tenantId: principal.tenantId,
              documentId,
              kind: entity.kind,
              conceptCode: entity.conceptCode,
              testCode: entity.testCode,
              rawText: entity.rawText,
              normalisedJson: JSON.stringify(entity.normalised),
              flag: null,
              confidence: entity.confidence,
              verificationState: UNVERIFIED,
              needsClinicianReview: 1,
              evidenceId,
              verifiedAt: null,
              verifiedBy: null,
              createdAt: recorded,
              updatedAt: recorded,
            })
            .execute();
          await tx
            .updateTable("evidence")
            .set({ sourceRef: entityId })
            .where("id", "=", evidenceId)
            .execute();
          inserted.push({
            id: entityId,
            kind: entity.kind,
            rawText: entity.rawText,
            confidence: entity.confidence,
            conceptCode: entity.conceptCode,
            testCode: entity.testCode,
          });
        }

        await this.audit(tx, request, "KIOSK", {
          tenantId: principal.tenantId,
          actorId: principal.sessionId,
          action: "DOCUMENT_UPLOADED",
          resourceId: documentId,
          encounterId,
          detail: {
            documentType,
            bytes: bytes.length,
            entities: inserted.length,
          },
        });
        await this.audit(tx, request, "KIOSK", {
          tenantId: principal.tenantId,
          actorId: principal.sessionId,
          action: "OCR_COMPLETED",
          resourceId: documentId,
          encounterId,
          detail: {
            provider: "mock-ocr",
            entities: inserted.length,
            unrecognised: ocrIssues.length > 0,
          },
        });

        return {
          status: 201,
          body: {
            documentId,
            documentType,
            status: "EXTRACTED",
            demoExtraction: true,
            ocrConfidence: ocrResult.overallConfidence,
            ocrIssues,
            entities: inserted,
          },
        };
      },
    });
  }

  // -------------------------------------------------------------------------
  // Listing + download
  // -------------------------------------------------------------------------

  /**
   * GET /encounters/:id/documents — the kiosk owner, or staff with `document.read` reading through
   * the clinical case.
   */
  async list(request: FastifyRequest, encounterId: string): Promise<unknown> {
    let tenantId: string;
    try {
      const principal = await this.authenticate(request);
      await sessionFor(this.deps.db, principal, this.deps.now());
      const encounter = await this.deps.db
        .selectFrom("encounters")
        .selectAll()
        .where("id", "=", encounterId)
        .where("tenantId", "=", principal.tenantId)
        .where("deletedAt", "is", null)
        .executeTakeFirst();
      if (!encounter || encounter.sessionId !== principal.sessionId)
        throw errors.notFound("Encounter");
      tenantId = principal.tenantId;
    } catch (error) {
      if (
        !(error instanceof MediKioskError) ||
        error.code !== "UNAUTHENTICATED"
      )
        throw error;
      tenantId = (await this.staffWith(request, "document.read")).tenantId;
    }
    return this.listForTenant(this.deps.db, tenantId, encounterId);
  }

  private async listForTenant(
    db: AppDatabase,
    tenantId: string,
    encounterId: string,
  ) {
    const documents = await db
      .selectFrom("documents")
      .selectAll()
      .where("tenantId", "=", tenantId)
      .where("encounterId", "=", encounterId)
      .where("deletedAt", "is", null)
      .orderBy("uploadedAt", "asc")
      .execute();
    const entities = await db
      .selectFrom("document_entities")
      .selectAll()
      .where("tenantId", "=", tenantId)
      .where(
        "documentId",
        "in",
        documents.length === 0 ? [""] : documents.map((d) => d.id),
      )
      .execute();
    return documents.map((d) => ({
      id: d.id,
      documentType: d.documentType,
      mimeType: d.mimeType,
      byteSize: d.byteSize,
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
    }));
  }

  /** GET /documents/:id/download — streams the stored bytes (kiosk owner or staff). */
  async download(
    request: FastifyRequest,
    documentId: string,
  ): Promise<{ bytes: Uint8Array; mimeType: string; filename: string }> {
    let tenantId: string;
    try {
      const principal = await this.authenticate(request);
      await sessionFor(this.deps.db, principal, this.deps.now());
      const document = await this.deps.db
        .selectFrom("documents")
        .selectAll()
        .where("id", "=", documentId)
        .where("tenantId", "=", principal.tenantId)
        .where("deletedAt", "is", null)
        .executeTakeFirst();
      if (!document) throw errors.notFound("Document");
      const encounter = await this.deps.db
        .selectFrom("encounters")
        .select("sessionId")
        .where("id", "=", document.encounterId)
        .executeTakeFirst();
      if (!encounter || encounter.sessionId !== principal.sessionId)
        throw errors.notFound("Document");
      tenantId = principal.tenantId;
    } catch (error) {
      if (
        !(error instanceof MediKioskError) ||
        error.code !== "UNAUTHENTICATED"
      )
        throw error;
      tenantId = (await this.staffWith(request, "document.read")).tenantId;
    }
    const document = await this.deps.db
      .selectFrom("documents")
      .selectAll()
      .where("id", "=", documentId)
      .where("tenantId", "=", tenantId)
      .where("deletedAt", "is", null)
      .executeTakeFirst();
    if (!document) throw errors.notFound("Document");
    // The stored name is content-addressed (`<sha256>.<ext>`); joining it with the configured
    // directory cannot escape, but the join is still built from two trusted parts only.
    const bytes = await readFile(
      join(this.deps.config.MEDIKIOSK_UPLOAD_DIR, document.storagePath),
    );
    const quality = JSON.parse(document.qualityJson) as {
      originalName?: string;
    };
    return {
      bytes: new Uint8Array(bytes),
      mimeType: document.mimeType,
      filename: sanitiseOriginalName(
        quality.originalName ?? `document-${documentId}`,
      ),
    };
  }

  // -------------------------------------------------------------------------
  // Patient confirmation → clinical fact rows
  // -------------------------------------------------------------------------

  /**
   * POST /encounters/:id/documents/:id/confirm — the patient accepts the extracted information.
   * Only then are clinical fact rows written (DOCUMENT_DERIVED, UNVERIFIED): the extraction is
   * shown first, stored as fact second. Idempotent per document.
   */
  confirmExtraction(
    request: FastifyRequest,
    principal: KioskTokenClaims,
    encounterId: string,
    documentId: string,
  ): Promise<MutationResult> {
    const now = this.deps.now();
    return replayMutation({
      db: this.deps.db,
      secret: this.deps.config.MEDIKIOSK_SESSION_ENCRYPTION_KEY,
      tenantId: principal.tenantId,
      actor: `session:${principal.sessionId}`,
      route: "document.confirm",
      key: this.key(request),
      body: { documentId },
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
        const recorded = this.deps.now().toISOString();
        const document = await tx
          .selectFrom("documents")
          .selectAll()
          .where("id", "=", documentId)
          .where("tenantId", "=", principal.tenantId)
          .where("encounterId", "=", encounterId)
          .where("deletedAt", "is", null)
          .executeTakeFirst();
        if (!document) throw errors.notFound("Document");
        if (document.status === "PATIENT_CONFIRMED")
          return {
            status: 200,
            body: {
              documentId,
              status: "PATIENT_CONFIRMED",
              alreadyConfirmed: true,
            },
          };
        if (document.status === "REJECTED")
          throw new MediKioskError(
            "ENCOUNTER_NOT_EDITABLE",
            "A rejected document cannot be confirmed.",
          );

        const loaded = await loadInterview(tx, principal.tenantId, encounterId);
        const entities = await tx
          .selectFrom("document_entities")
          .selectAll()
          .where("tenantId", "=", principal.tenantId)
          .where("documentId", "=", documentId)
          .execute();
        const created = { medications: 0, labs: 0, vitals: 0 };
        for (const entity of entities) {
          const normalised = entity.normalisedJson
            ? (JSON.parse(entity.normalisedJson) as Record<string, unknown>)
            : {};
          if (entity.kind === "MEDICATION") {
            const existing = await tx
              .selectFrom("medications")
              .select("id")
              .where("tenantId", "=", principal.tenantId)
              .where("documentId", "=", documentId)
              .where("asWrittenName", "=", entity.rawText)
              .executeTakeFirst();
            if (!existing) {
              const name =
                typeof normalised.name === "string" && normalised.name
                  ? normalised.name
                  : entity.rawText;
              await tx
                .insertInto("medications")
                .values({
                  id: ulid(),
                  tenantId: principal.tenantId,
                  patientId: loaded.encounter.patientId,
                  encounterId,
                  conceptCode: entity.conceptCode ?? "",
                  asWrittenName: name,
                  strengthValue:
                    typeof normalised.strengthValue === "number"
                      ? normalised.strengthValue
                      : null,
                  strengthUnit:
                    typeof normalised.strengthUnit === "string"
                      ? normalised.strengthUnit
                      : null,
                  doseValue: null,
                  doseUnit: null,
                  frequency:
                    typeof normalised.frequency === "string"
                      ? normalised.frequency
                      : "UNKNOWN",
                  route: "",
                  durationDays: null,
                  status: "CURRENT",
                  startedOn: null,
                  stoppedOn: null,
                  // Prescribed-ness comes from the document type, not assumed: a prescription
                  // states the intent to prescribe; a lab report that mentions a drug does not.
                  isPrescribed:
                    document.documentType === "PRESCRIPTION" ? 1 : 0,
                  documentId,
                  originClass: DOCUMENT_DERIVED,
                  confidence: entity.confidence,
                  verificationState: UNVERIFIED,
                  verifiedAt: null,
                  verifiedBy: null,
                  createdAt: recorded,
                  updatedAt: recorded,
                })
                .execute();
              created.medications += 1;
            }
          } else if (entity.kind === "LAB_RESULT" && entity.testCode) {
            const value = Number(normalised.value);
            const unit =
              typeof normalised.unit === "string" && normalised.unit
                ? normalised.unit
                : (labTestDefinition(entity.testCode)?.canonicalUnit ?? "");
            if (!Number.isFinite(value) || !unit) continue;
            const existing = await tx
              .selectFrom("lab_results")
              .select("id")
              .where("tenantId", "=", principal.tenantId)
              .where("documentId", "=", documentId)
              .where("testCode", "=", entity.testCode)
              .executeTakeFirst();
            if (!existing) {
              const flagged = flagLabResult({
                testCode: entity.testCode,
                value,
                unit,
              });
              const reference = labTestDefinition(
                entity.testCode,
              )?.defaultReference;
              await tx
                .insertInto("lab_results")
                .values({
                  id: ulid(),
                  tenantId: principal.tenantId,
                  patientId: loaded.encounter.patientId,
                  encounterId,
                  testCode: entity.testCode,
                  value,
                  unit,
                  referenceLow: reference?.low ?? null,
                  referenceHigh: reference?.high ?? null,
                  referenceSource: flagged.referenceSource,
                  flag: flagged.flag,
                  implausible: 0,
                  collectedAt: recorded,
                  reportedAt: recorded,
                  documentId,
                  sourceComment: null,
                  originClass: DOCUMENT_DERIVED,
                  confidence: entity.confidence,
                  verificationState: UNVERIFIED,
                  verifiedAt: null,
                  verifiedBy: null,
                  createdAt: recorded,
                })
                .execute();
              created.labs += 1;
            }
          } else if (entity.kind === "VITAL" && entity.conceptCode) {
            const value = Number(normalised.value);
            const unit =
              typeof normalised.unit === "string" && normalised.unit
                ? normalised.unit
                : "";
            if (!Number.isFinite(value) || !unit) continue;
            await tx
              .insertInto("vitals")
              .values({
                id: ulid(),
                tenantId: principal.tenantId,
                patientId: loaded.encounter.patientId,
                encounterId,
                conceptCode: entity.conceptCode,
                componentCode: null,
                value,
                unit,
                measuredAt: recorded,
                source: "IMPORTED_REPORT",
                deviceId: null,
                implausible: 0,
                originClass: DOCUMENT_DERIVED,
                confidence: entity.confidence,
                verificationState: UNVERIFIED,
                verifiedAt: null,
                verifiedBy: null,
                createdAt: recorded,
              })
              .execute();
            created.vitals += 1;
          }
        }

        await tx
          .updateTable("documents")
          .set({ status: "PATIENT_CONFIRMED", processedAt: recorded })
          .where("id", "=", documentId)
          .where("tenantId", "=", principal.tenantId)
          .execute();

        const reloaded = await loadInterview(
          tx,
          principal.tenantId,
          encounterId,
        );
        const triage = await evaluateAndPersistTriage(
          tx,
          reloaded,
          selectActivePathways(reloaded.input),
          recorded,
        );
        await this.audit(tx, request, "KIOSK", {
          tenantId: principal.tenantId,
          actorId: principal.sessionId,
          action: "EVIDENCE_PATIENT_CONFIRMED",
          resourceId: documentId,
          encounterId,
          detail: {
            medications: created.medications,
            labs: created.labs,
            vitals: created.vitals,
            level: triage.level,
          },
        });
        return {
          status: 200,
          body: {
            documentId,
            status: "PATIENT_CONFIRMED",
            alreadyConfirmed: false,
            created,
            safetyStatus: triage.level,
            requiresHumanReview: triage.requiresHumanReview,
          },
        };
      },
    });
  }

  /** POST /encounters/:id/documents/:id/reject — the patient rejects a bad extraction. */
  rejectExtraction(
    request: FastifyRequest,
    principal: KioskTokenClaims,
    encounterId: string,
    documentId: string,
  ): Promise<MutationResult> {
    const now = this.deps.now();
    return replayMutation({
      db: this.deps.db,
      secret: this.deps.config.MEDIKIOSK_SESSION_ENCRYPTION_KEY,
      tenantId: principal.tenantId,
      actor: `session:${principal.sessionId}`,
      route: "document.reject",
      key: this.key(request),
      body: { documentId },
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
      },
      execute: async (tx) => {
        const document = await tx
          .selectFrom("documents")
          .selectAll()
          .where("id", "=", documentId)
          .where("tenantId", "=", principal.tenantId)
          .where("encounterId", "=", encounterId)
          .where("deletedAt", "is", null)
          .executeTakeFirst();
        if (!document) throw errors.notFound("Document");
        if (document.status === "PATIENT_CONFIRMED")
          throw new MediKioskError(
            "ENCOUNTER_NOT_EDITABLE",
            "A confirmed document cannot be rejected; ask the clinician to correct it.",
          );
        await tx
          .updateTable("documents")
          .set({ status: "REJECTED" })
          .where("id", "=", documentId)
          .where("tenantId", "=", principal.tenantId)
          .execute();
        await tx
          .updateTable("document_entities")
          .set({ verificationState: "REJECTED" })
          .where("documentId", "=", documentId)
          .where("tenantId", "=", principal.tenantId)
          .execute();
        await this.audit(tx, request, "KIOSK", {
          tenantId: principal.tenantId,
          actorId: principal.sessionId,
          action: "FACT_REJECTED",
          resourceId: documentId,
          encounterId,
          detail: { origin: "document_rejected_by_patient" },
        });
        return { status: 200, body: { documentId, status: "REJECTED" } };
      },
    });
  }

  // -------------------------------------------------------------------------
  // Clinician verification of extracted entities
  // -------------------------------------------------------------------------

  /**
   * POST /documents/:id/entities/:entityId/verify — VERIFY, REJECT or EDIT.
   *
   * Evidence rows are immutable: an EDIT writes a NEW evidence row (the old one records
   * `supersededBy`), a NEW entity row with the corrected value, and updates the linked clinical
   * fact row in place. VERIFY/REJECT flip the verification state on the entity, its evidence and
   * the linked fact (a rejected fact is deleted — it was never a clinical statement, only an
   * unconfirmed extraction claim).
   */
  verifyEntity(
    request: FastifyRequest,
    documentId: string,
    entityId: string,
    body: VerifyEntityBody,
  ): Promise<MutationResult> {
    // The staff lookup runs BEFORE the mutation transaction: staffWith opens its own short
    // transaction, and nesting it inside the mutation transaction would deadlock the
    // single-connection SQLite driver.
    return this.staffWith(request, "document.verify").then((principal) =>
      this.deps.db.transaction().execute(async (tx) => {
        const entity = await tx
          .selectFrom("document_entities")
          .selectAll()
          .where("id", "=", entityId)
          .where("tenantId", "=", principal.tenantId)
          .where("documentId", "=", documentId)
          .executeTakeFirst();
        if (!entity) throw errors.notFound("Entity");
        const document = await tx
          .selectFrom("documents")
          .selectAll()
          .where("id", "=", documentId)
          .where("tenantId", "=", principal.tenantId)
          .where("deletedAt", "is", null)
          .executeTakeFirst();
        if (!document) throw errors.notFound("Document");

        const recorded = this.deps.now().toISOString();
        let resultBody: Record<string, unknown>;

        if (body.action === "VERIFY") {
          await this.markEntity(
            tx,
            entityId,
            principal.tenantId,
            "VERIFIED",
            principal.userId,
            recorded,
          );
          await this.markEvidence(
            tx,
            principal.tenantId,
            entity,
            "VERIFIED",
            principal.userId,
            recorded,
          );
          await this.markFactRow(
            tx,
            principal,
            document,
            entity,
            "VERIFIED",
            recorded,
            null,
          );
          await this.maybeMarkDocumentVerified(
            tx,
            principal.tenantId,
            documentId,
            recorded,
          );
          await this.audit(tx, request, "STAFF", {
            tenantId: principal.tenantId,
            actorId: principal.userId,
            action: "FACT_VERIFIED",
            resourceId: entityId,
            encounterId: document.encounterId,
            detail: { kind: entity.kind },
          });
          resultBody = { entityId, verificationState: "VERIFIED" };
        } else if (body.action === "REJECT") {
          await this.markEntity(
            tx,
            entityId,
            principal.tenantId,
            "REJECTED",
            principal.userId,
            recorded,
          );
          await this.markEvidence(
            tx,
            principal.tenantId,
            entity,
            "REJECTED",
            principal.userId,
            recorded,
          );
          await this.removeFactRow(tx, principal.tenantId, document, entity);
          await this.audit(tx, request, "STAFF", {
            tenantId: principal.tenantId,
            actorId: principal.userId,
            action: "FACT_REJECTED",
            resourceId: entityId,
            encounterId: document.encounterId,
            detail: { kind: entity.kind },
          });
          resultBody = { entityId, verificationState: "REJECTED" };
        } else {
          const corrected = body.correctedJson ?? {};
          const merged = {
            ...(entity.normalisedJson ? JSON.parse(entity.normalisedJson) : {}),
            ...corrected,
          };
          // New evidence row (the old one is superseded, never rewritten).
          const newEvidenceId = ulid();
          await tx
            .insertInto("evidence")
            .values({
              id: newEvidenceId,
              tenantId: principal.tenantId,
              encounterId: document.encounterId,
              type: "DOCUMENT_ENTITY",
              originClass: DOCUMENT_DERIVED,
              source: "document",
              sourceRef: documentId,
              rawValue: entity.rawText,
              normalisedJson: JSON.stringify({
                ...merged,
                correctedBy: "clinician",
              }),
              confidence: entity.confidence,
              language: null,
              capturedAt: recorded,
              createdBy: principal.userId,
              verificationState: "VERIFIED",
              verifiedAt: recorded,
              verifiedBy: principal.userId,
              supersededBy: null,
            })
            .execute();
          if (entity.evidenceId) {
            await tx
              .updateTable("evidence")
              .set({ supersededBy: newEvidenceId })
              .where("id", "=", entity.evidenceId)
              .where("tenantId", "=", principal.tenantId)
              .execute();
          }
          await this.markEntity(
            tx,
            entityId,
            principal.tenantId,
            "CORRECTED",
            principal.userId,
            recorded,
          );
          const newEntityId = ulid();
          await tx
            .insertInto("document_entities")
            .values({
              id: newEntityId,
              tenantId: principal.tenantId,
              documentId,
              kind: entity.kind,
              conceptCode: entity.conceptCode,
              testCode: entity.testCode,
              rawText: entity.rawText,
              normalisedJson: JSON.stringify(merged),
              flag: entity.flag,
              confidence: entity.confidence,
              verificationState: "VERIFIED",
              needsClinicianReview: 0,
              evidenceId: newEvidenceId,
              verifiedAt: recorded,
              verifiedBy: principal.userId,
              createdAt: recorded,
              updatedAt: recorded,
            })
            .execute();
          await tx
            .updateTable("evidence")
            .set({ sourceRef: newEntityId })
            .where("id", "=", newEvidenceId)
            .execute();
          await this.markFactRow(
            tx,
            principal,
            document,
            entity,
            "VERIFIED",
            recorded,
            corrected,
          );
          await this.audit(tx, request, "STAFF", {
            tenantId: principal.tenantId,
            actorId: principal.userId,
            action: "FACT_EDITED",
            resourceId: newEntityId,
            encounterId: document.encounterId,
            // Field names only, never clinical values: the audit trail is PHI-free by construction.
            detail: {
              kind: entity.kind,
              correctedFields: Object.keys(corrected).sort().join(","),
            },
          });
          resultBody = {
            entityId: newEntityId,
            supersedes: entityId,
            verificationState: "VERIFIED",
          };
        }

        // Verification shifts clinical state: re-run the safety rules so the case view is current.
        try {
          const loaded = await loadInterview(
            tx,
            principal.tenantId,
            document.encounterId,
          );
          await evaluateAndPersistTriage(
            tx,
            loaded,
            selectActivePathways(loaded.input),
            recorded,
          );
        } catch {
          // Encounter rows may predate the interview runtime (seeded history); triage then stays
          // as assessed. Verification itself must not fail because of it.
        }

        return { status: 200, body: resultBody };
      }),
    );
  }

  private async markEntity(
    tx: Transaction<Database>,
    entityId: string,
    tenantId: string,
    state: string,
    verifiedBy: string,
    recorded: string,
  ): Promise<void> {
    await tx
      .updateTable("document_entities")
      .set({
        verificationState: state,
        verifiedAt: recorded,
        verifiedBy,
        updatedAt: recorded,
      })
      .where("id", "=", entityId)
      .where("tenantId", "=", tenantId)
      .execute();
  }

  private async markEvidence(
    tx: Transaction<Database>,
    tenantId: string,
    entity: { evidenceId: string | null },
    state: string,
    verifiedBy: string,
    recorded: string,
  ): Promise<void> {
    if (!entity.evidenceId) return;
    await tx
      .updateTable("evidence")
      .set({ verificationState: state, verifiedAt: recorded, verifiedBy })
      .where("id", "=", entity.evidenceId)
      .where("tenantId", "=", tenantId)
      .execute();
  }

  /** The fact row created from an entity (medication, lab or vital), if any. */
  private async findFactRow(
    tx: Transaction<Database>,
    tenantId: string,
    encounterId: string,
    documentId: string,
    entity: {
      kind: string;
      rawText: string;
      testCode: string | null;
      conceptCode: string | null;
      normalisedJson: string | null;
    },
  ): Promise<
    | { table: "medications"; id: string }
    | { table: "lab_results"; id: string }
    | { table: "vitals"; id: string }
    | null
  > {
    if (entity.kind === "MEDICATION") {
      // The fact row stores the parsed name when one was extracted, else the raw line.
      const normalised = entity.normalisedJson
        ? (JSON.parse(entity.normalisedJson) as { name?: unknown })
        : {};
      const candidates = [
        entity.rawText,
        ...(typeof normalised.name === "string" && normalised.name
          ? [normalised.name]
          : []),
      ];
      for (const candidate of candidates) {
        const row = await tx
          .selectFrom("medications")
          .select("id")
          .where("tenantId", "=", tenantId)
          .where("documentId", "=", documentId)
          .where("asWrittenName", "=", candidate)
          .executeTakeFirst();
        if (row) return { table: "medications", id: row.id };
      }
      return null;
    }
    if (entity.kind === "LAB_RESULT" && entity.testCode) {
      const row = await tx
        .selectFrom("lab_results")
        .select("id")
        .where("tenantId", "=", tenantId)
        .where("documentId", "=", documentId)
        .where("testCode", "=", entity.testCode)
        .executeTakeFirst();
      return row ? { table: "lab_results", id: row.id } : null;
    }
    if (entity.kind === "VITAL" && entity.conceptCode) {
      // Vitals carry no document pointer, so the match is the exact extracted reading:
      // the same encounter, the same code, the exact inserted value, document-derived.
      const normalised = entity.normalisedJson
        ? (JSON.parse(entity.normalisedJson) as { value?: unknown })
        : {};
      const value = Number(normalised.value);
      if (!Number.isFinite(value)) return null;
      const row = await tx
        .selectFrom("vitals")
        .select("id")
        .where("tenantId", "=", tenantId)
        .where("encounterId", "=", encounterId)
        .where("conceptCode", "=", entity.conceptCode)
        .where("value", "=", value)
        .where("originClass", "=", DOCUMENT_DERIVED)
        .executeTakeFirst();
      return row ? { table: "vitals", id: row.id } : null;
    }
    return null;
  }

  /** Flip the fact row to a verification state, applying EDIT corrections when given. */
  private async markFactRow(
    tx: Transaction<Database>,
    principal: { tenantId: string; userId: string },
    document: { id: string; encounterId: string },
    entity: {
      kind: string;
      rawText: string;
      testCode: string | null;
      conceptCode: string | null;
      normalisedJson: string | null;
    },
    state: string,
    recorded: string,
    corrected: Record<string, unknown> | null,
  ): Promise<void> {
    const found = await this.findFactRow(
      tx,
      principal.tenantId,
      document.encounterId,
      document.id,
      entity,
    );
    if (!found) return;
    const verification = {
      verificationState: state,
      verifiedAt: recorded,
      verifiedBy: principal.userId,
    };
    if (found.table === "medications") {
      const name =
        corrected && typeof corrected.name === "string" && corrected.name
          ? corrected.name
          : undefined;
      const frequency =
        corrected &&
        typeof corrected.frequency === "string" &&
        corrected.frequency
          ? corrected.frequency
          : undefined;
      await tx
        .updateTable("medications")
        .set({
          ...(name ? { asWrittenName: name } : {}),
          ...(frequency ? { frequency } : {}),
          ...verification,
          updatedAt: recorded,
        })
        .where("id", "=", found.id)
        .execute();
      return;
    }
    if (found.table === "lab_results") {
      const rawValue =
        corrected && corrected.value !== undefined
          ? Number(corrected.value)
          : undefined;
      const unit =
        corrected && typeof corrected.unit === "string" && corrected.unit
          ? corrected.unit
          : undefined;
      if (rawValue !== undefined && !Number.isFinite(rawValue))
        throw errors.validation("The corrected lab value must be a number.");
      const current = await tx
        .selectFrom("lab_results")
        .select(["testCode", "value", "unit"])
        .where("id", "=", found.id)
        .executeTakeFirstOrThrow();
      const value = rawValue ?? current.value;
      const finalUnit = unit ?? current.unit;
      const flagged = flagLabResult({
        testCode: current.testCode,
        value,
        unit: finalUnit,
      });
      const reference = labTestDefinition(current.testCode)?.defaultReference;
      await tx
        .updateTable("lab_results")
        .set({
          value,
          unit: finalUnit,
          referenceLow: reference?.low ?? null,
          referenceHigh: reference?.high ?? null,
          referenceSource: flagged.referenceSource,
          flag: flagged.flag,
          ...verification,
        })
        .where("id", "=", found.id)
        .execute();
      return;
    }
    const rawValue =
      corrected && corrected.value !== undefined
        ? Number(corrected.value)
        : undefined;
    const unit =
      corrected && typeof corrected.unit === "string" && corrected.unit
        ? corrected.unit
        : undefined;
    if (rawValue !== undefined && !Number.isFinite(rawValue))
      throw errors.validation("The corrected vital value must be a number.");
    await tx
      .updateTable("vitals")
      .set({
        ...(rawValue !== undefined ? { value: rawValue } : {}),
        ...(unit ? { unit } : {}),
        ...verification,
      })
      .where("id", "=", found.id)
      .execute();
  }

  /** Delete the fact row created from a rejected entity (it was never a clinical statement). */
  private async removeFactRow(
    tx: Transaction<Database>,
    tenantId: string,
    document: { id: string; encounterId: string },
    entity: {
      kind: string;
      rawText: string;
      testCode: string | null;
      conceptCode: string | null;
      normalisedJson: string | null;
    },
  ): Promise<void> {
    const found = await this.findFactRow(
      tx,
      tenantId,
      document.encounterId,
      document.id,
      entity,
    );
    if (!found) return;
    if (found.table === "medications")
      await tx.deleteFrom("medications").where("id", "=", found.id).execute();
    else if (found.table === "lab_results")
      await tx.deleteFrom("lab_results").where("id", "=", found.id).execute();
    else await tx.deleteFrom("vitals").where("id", "=", found.id).execute();
  }

  /** When every entity of a document is verified or corrected, the document is VERIFIED. */
  private async maybeMarkDocumentVerified(
    tx: Transaction<Database>,
    tenantId: string,
    documentId: string,
    recorded: string,
  ): Promise<void> {
    const open = await tx
      .selectFrom("document_entities")
      .select("id")
      .where("tenantId", "=", tenantId)
      .where("documentId", "=", documentId)
      .where("verificationState", "=", "UNVERIFIED")
      .executeTakeFirst();
    if (!open) {
      await tx
        .updateTable("documents")
        .set({ status: "VERIFIED" })
        .where("id", "=", documentId)
        .where("tenantId", "=", tenantId)
        .execute();
    }
  }

  // -------------------------------------------------------------------------
  // Demo document fixtures (kiosk session)
  // -------------------------------------------------------------------------

  /** GET /demo-documents — the fixed synthetic set the kiosk offers for attachment. */
  async listDemoDocuments(request: FastifyRequest): Promise<unknown> {
    const principal = await this.authenticate(request);
    await sessionFor(this.deps.db, principal, this.deps.now());
    return DEMO_DOCUMENTS.map((fixture) => ({
      name: fixture.name,
      documentType: fixture.documentType,
      mimeType: fixture.mimeType,
      byteSize: fixture.bytes.length,
    }));
  }

  /** GET /demo-documents/:name — the raw bytes, uploaded by the kiosk like any other file. */
  async demoDocumentBytes(
    request: FastifyRequest,
    name: string,
  ): Promise<{ bytes: Uint8Array; mimeType: string }> {
    const principal = await this.authenticate(request);
    await sessionFor(this.deps.db, principal, this.deps.now());
    if (!/^[a-z0-9-]+\.txt$/.test(name)) throw errors.notFound("Demo document");
    const fixture = demoDocumentByName(name);
    if (!fixture) throw errors.notFound("Demo document");
    return { bytes: fixture.bytes, mimeType: fixture.mimeType };
  }
}
