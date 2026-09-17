import { ulid } from "ulid";
import {
  bearerToken,
  verifyToken,
  signKioskToken,
  type KioskTokenClaims,
} from "@medikiosk/auth";
import { errors, MediKioskError } from "@medikiosk/shared-types";
import type { FastifyRequest } from "fastify";
import type { AppDatabase } from "../db/kysely";
import type { AppConfig } from "../config/env";
import type { SessionRow } from "../db/schema";
import type { AppLogger } from "../platform/logger";
import { appendAuditEvent, type AuditAction } from "../platform/audit";
import {
  activeDevice,
  assertLocale,
  clearTransient,
  sessionFor,
} from "./session.repo";
import { replayMutation, type MutationResult } from "./replay";
import { sessionConsent } from "../consent/consent.service";

export class KioskService {
  constructor(
    readonly deps: {
      db: AppDatabase;
      config: AppConfig;
      logger: AppLogger;
      now: () => Date;
    },
  ) {}
  async authenticate(request: FastifyRequest) {
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
    if (
      !result.claims.sessionId ||
      !result.claims.kioskId ||
      !result.claims.tenantId ||
      result.claims.sub !== result.claims.sessionId
    )
      throw errors.unauthenticated();
    return result.claims;
  }
  async view(db: AppDatabase, session: SessionRow) {
    const consent = await sessionConsent(db, session, this.deps.now());
    return {
      sessionId: session.id,
      patientId: session.patientId,
      locale: session.locale,
      status: session.status,
      expiresAt: session.expiresAt,
      remainingSeconds: Math.max(
        0,
        Math.ceil(
          (Date.parse(session.expiresAt) - this.deps.now().getTime()) / 1000,
        ),
      ),
      step: !session.patientId
        ? "IDENTITY"
        : !consent
          ? "CONSENT"
          : consent.stopRequired
            ? "STOPPED"
            : "COMPLETE",
      ...(consent ? { consent } : {}),
    };
  }
  async read(principal: KioskTokenClaims) {
    return this.deps.db
      .transaction()
      .execute(async (tx) =>
        this.view(tx, await sessionFor(tx, principal, this.deps.now())),
      );
  }
  async audit(
    db: AppDatabase,
    request: FastifyRequest | undefined,
    tenantId: string,
    resourceId: string,
    action: AuditAction,
    actorKind: "KIOSK" | "SYSTEM" | "STAFF" = "KIOSK",
  ) {
    const written = await appendAuditEvent(
      db,
      this.deps.logger,
      { requestId: request?.id },
      {
        tenantId,
        actorKind,
        action,
        resourceType: "session",
        resourceId,
        result:
          action === "IDENTITY_VERIFICATION_FAILED" ? "FAILURE" : "SUCCESS",
      },
    );
    if (!written)
      throw new MediKioskError(
        "SERVICE_UNAVAILABLE",
        "The audit record could not be saved.",
      );
  }
  async open(request: FastifyRequest, locale: string) {
    const kioskId = request.headers["x-kiosk-id"];
    const deviceToken = request.headers["x-kiosk-token"];
    if (typeof kioskId !== "string" || typeof deviceToken !== "string")
      throw errors.unauthenticated();
    const { kiosk } = await activeDevice(this.deps.db, kioskId, deviceToken);
    const now = this.deps.now();
    const expiresAt = new Date(
      now.getTime() + this.deps.config.MEDIKIOSK_SESSION_TTL_MINUTES * 60_000,
    ).toISOString();
    const sessionId = ulid();
    return replayMutation({
      db: this.deps.db,
      secret: this.deps.config.MEDIKIOSK_SESSION_ENCRYPTION_KEY,
      tenantId: kiosk.tenantId,
      actor: `device:${kiosk.id}`,
      route: "session.open",
      key: this.key(request),
      body: { locale },
      sessionId,
      now,
      expiresAt,
      authenticate: async (tx) => {
        await tx
          .updateTable("kiosks")
          .set((eb) => ({ updatedAt: eb.ref("updatedAt") }))
          .where("id", "=", kiosk.id)
          .execute();
        await activeDevice(tx, kioskId, deviceToken);
      },
      execute: async (tx) => {
        await assertLocale(tx, kiosk.tenantId, locale);
        const { tenant } = await activeDevice(tx, kiosk.id, deviceToken);
        await tx
          .insertInto("sessions")
          .values({
            id: sessionId,
            tenantId: tenant.id,
            kioskId,
            patientId: null,
            locale,
            status: "ACTIVE",
            expiresAt,
            endedAt: null,
            wipedAt: null,
            transientArtifactsDeleted: 0,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          })
          .execute();
        await tx
          .updateTable("kiosks")
          .set({ lastSeenAt: now.toISOString() })
          .where("id", "=", kioskId)
          .where("tenantId", "=", tenant.id)
          .execute();
        const token = await signKioskToken(
          { sub: sessionId, sessionId, kioskId, tenantId: tenant.id },
          this.deps.config.MEDIKIOSK_JWT_SECRET,
          { now, ttlMinutes: this.deps.config.MEDIKIOSK_SESSION_TTL_MINUTES },
        );
        await this.audit(tx, request, tenant.id, sessionId, "SESSION_OPENED");
        return {
          status: 201,
          body: {
            sessionId,
            token,
            expiresAt,
            ttlMinutes: this.deps.config.MEDIKIOSK_SESSION_TTL_MINUTES,
            kiosk: { id: kiosk.id, name: kiosk.name },
            tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
          },
        };
      },
    });
  }
  key(request: FastifyRequest) {
    const key = request.headers["idempotency-key"];
    return typeof key === "string" ? key : undefined;
  }
  async mutate(
    request: FastifyRequest,
    principal: KioskTokenClaims,
    route: string,
    body: unknown,
    execute: (db: AppDatabase, session: SessionRow) => Promise<MutationResult>,
  ) {
    const now = this.deps.now();
    const session = await this.deps.db
      .selectFrom("sessions")
      .selectAll()
      .where("id", "=", principal.sessionId)
      .where("tenantId", "=", principal.tenantId)
      .executeTakeFirst();
    if (!session) throw errors.notFound("Session");
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
      expiresAt: session.expiresAt,
      authenticate: async (tx) => {
        await sessionFor(tx, principal, now, route === "session.wipe");
      },
      execute: async (tx) =>
        execute(
          tx,
          await sessionFor(tx, principal, now, route === "session.wipe"),
        ),
    });
  }
  async wipe(
    db: AppDatabase,
    session: SessionRow,
    request?: FastifyRequest,
    actorKind: "KIOSK" | "STAFF" = "KIOSK",
  ) {
    const count = await clearTransient(db, session.tenantId, session.id, true);
    const now = this.deps.now().toISOString();
    await db
      .updateTable("sessions")
      .set({ status: "ENDED", endedAt: now, wipedAt: now, updatedAt: now })
      .where("id", "=", session.id)
      .where("tenantId", "=", session.tenantId)
      .execute();
    if (!session.wipedAt)
      await this.audit(
        db,
        request,
        session.tenantId,
        session.id,
        "SESSION_WIPED",
        actorKind,
      );
    return {
      status: 200,
      body: {
        wiped: true,
        transientArtifactsDeleted: 0,
        identityChallengesDeleted: count,
        clinicalRecordRetained: true,
      },
    };
  }
  async sweep() {
    const now = this.deps.now().toISOString();
    await this.deps.db.transaction().execute(async (tx) => {
      const expired = await tx
        .selectFrom("sessions")
        .selectAll()
        .where("status", "=", "ACTIVE")
        .where("expiresAt", "<=", now)
        .execute();
      for (const session of expired) {
        await tx
          .updateTable("sessions")
          .set({
            status: "EXPIRED",
            endedAt: now,
            wipedAt: now,
            updatedAt: now,
          })
          .where("id", "=", session.id)
          .where("tenantId", "=", session.tenantId)
          .where("status", "=", "ACTIVE")
          .execute();
        await clearTransient(tx, session.tenantId, session.id);
        await this.audit(
          tx,
          undefined,
          session.tenantId,
          session.id,
          "SESSION_WIPED",
          "SYSTEM",
        );
      }
      await tx
        .deleteFrom("identity_challenges")
        .where("expiresAt", "<=", now)
        .execute();
      await tx
        .deleteFrom("idempotency_keys")
        .where("expiresAt", "<=", now)
        .execute();
    });
  }
}
