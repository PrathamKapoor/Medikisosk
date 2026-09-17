import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { hasPermission, type KioskTokenClaims } from "@medikiosk/auth";
import { errors, MediKioskError } from "@medikiosk/shared-types";
import { authenticateStaff } from "../auth/middleware/authenticate";
import { parseRoles } from "../auth/repository/user.repo";
import { KioskService } from "./kiosk.service";
import { assertLocale } from "./session.repo";
import {
  acceptConsent,
  consentInputSchema,
  consentRecord,
  readVersion,
} from "../consent/consent.service";
import { startIdentity, verifyIdentity } from "../identity/identity.service";
import { replayMutation, type MutationResult } from "./replay";
import type { AppDatabase } from "../db/kysely";

function send(reply: FastifyReply, result: MutationResult) {
  if (result.error)
    throw new MediKioskError(result.error.code, result.error.message);
  return reply.status(result.status).send(result.body);
}
const localeBody = z.object({ locale: z.string().min(2).max(16) }).strict();
const sessionParams = z.object({ sessionId: z.string().min(1) });
function ownedSession(request: FastifyRequest, principal: KioskTokenClaims) {
  if (sessionParams.parse(request.params).sessionId !== principal.sessionId)
    throw errors.notFound("Session");
}
export async function registerKioskRoutes(
  app: FastifyInstance,
  service: KioskService,
) {
  app.get("/api/v1/consent/versions", async (request) => {
    const query = z
      .object({ locale: z.string().default("en-IN") })
      .parse(request.query);
    return readVersion(service.deps.db, query.locale);
  });
  app.post("/api/v1/kiosk/sessions", async (request, reply) =>
    send(
      reply,
      await service.open(request, localeBody.parse(request.body).locale),
    ),
  );
  app.get("/api/v1/kiosk/sessions/:sessionId", async (request) => {
    const principal = await service.authenticate(request);
    ownedSession(request, principal);
    return service.read(principal);
  });
  app.patch("/api/v1/kiosk/sessions/:sessionId", async (request, reply) => {
    const principal = await service.authenticate(request);
    ownedSession(request, principal);
    const body = localeBody.parse(request.body);
    return send(
      reply,
      await service.mutate(
        request,
        principal,
        "session.locale",
        body,
        async (db, session) => {
          await assertLocale(db, principal.tenantId, body.locale);
          await db
            .updateTable("sessions")
            .set({
              locale: body.locale,
              updatedAt: service.deps.now().toISOString(),
            })
            .where("id", "=", session.id)
            .where("tenantId", "=", principal.tenantId)
            .execute();
          await service.audit(
            db,
            request,
            principal.tenantId,
            session.id,
            "INTERVIEW_LANGUAGE_CHANGED",
          );
          return {
            status: 200,
            body: await service.view(db, { ...session, locale: body.locale }),
          };
        },
      ),
    );
  });
  app.post("/api/v1/kiosk/sessions/:sessionId/wipe", async (request, reply) => {
    const body = z
      .object({})
      .strict()
      .parse(request.body ?? {});
    let principal: KioskTokenClaims;
    try {
      principal = await service.authenticate(request);
    } catch (error) {
      if (
        !(error instanceof MediKioskError) ||
        error.code !== "UNAUTHENTICATED"
      )
        throw error;
      const staff = await authenticateStaff(
        request,
        service.deps.config,
        service.deps.now(),
      );
      const { sessionId } = sessionParams.parse(request.params);
      const now = service.deps.now();
      return send(
        reply,
        await replayMutation({
          db: service.deps.db,
          secret: service.deps.config.MEDIKIOSK_SESSION_ENCRYPTION_KEY,
          tenantId: staff.tenantId,
          actor: `staff:${staff.userId}`,
          route: "session.wipe",
          key: service.key(request),
          body: { sessionId, ...body },
          sessionId,
          now,
          expiresAt: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
          authenticate: async (db: AppDatabase) => {
            const user = await db
              .selectFrom("users")
              .selectAll()
              .where("id", "=", staff.userId)
              .where("tenantId", "=", staff.tenantId)
              .where("active", "=", 1)
              .executeTakeFirst();
            const tenant = await db
              .selectFrom("tenants")
              .select("id")
              .where("id", "=", staff.tenantId)
              .where("deletedAt", "is", null)
              .executeTakeFirst();
            if (!user || !tenant) throw errors.unauthenticated();
            if (!hasPermission(parseRoles(user.rolesJson), "kiosk.manage"))
              throw errors.forbidden();
            const session = await db
              .selectFrom("sessions")
              .select("id")
              .where("id", "=", sessionId)
              .where("tenantId", "=", staff.tenantId)
              .executeTakeFirst();
            if (!session) throw errors.notFound("Session");
          },
          execute: async (db) => {
            const session = await db
              .selectFrom("sessions")
              .selectAll()
              .where("id", "=", sessionId)
              .where("tenantId", "=", staff.tenantId)
              .executeTakeFirstOrThrow();
            return service.wipe(db, session, request, "STAFF");
          },
        }),
      );
    }
    ownedSession(request, principal);
    return send(
      reply,
      await service.mutate(
        request,
        principal,
        "session.wipe",
        body,
        async (db, session) => service.wipe(db, session, request),
      ),
    );
  });
  app.post("/api/v1/kiosk/identity/start", async (request, reply) => {
    const principal = await service.authenticate(request);
    const body = z
      .object({
        sessionId: z.string(),
        method: z.enum(["GUEST", "ABHA_OTP", "ABHA_QR", "RETURNING"]),
      })
      .strict()
      .parse(request.body);
    if (body.sessionId !== principal.sessionId)
      throw errors.notFound("Session");
    return send(
      reply,
      await service.mutate(
        request,
        principal,
        "identity.start",
        body,
        async (db, session) => {
          const result = await startIdentity(
            db,
            session,
            body.method,
            service.deps.config,
            service.deps.now(),
          );
          if (!result.error)
            await service.audit(
              db,
              request,
              principal.tenantId,
              session.id,
              "IDENTITY_FLOW_STARTED",
            );
          return result;
        },
      ),
    );
  });
  app.post("/api/v1/kiosk/identity/verify", async (request, reply) => {
    const principal = await service.authenticate(request);
    const body = z
      .object({ challengeId: z.string(), otp: z.string().regex(/^\d{6}$/) })
      .strict()
      .parse(request.body);
    return send(
      reply,
      await service.mutate(
        request,
        principal,
        "identity.verify",
        body,
        async (db, session) => {
          const result = await verifyIdentity(
            db,
            session,
            body.challengeId,
            body.otp,
            service.deps.config,
            service.deps.now(),
          );
          await service.audit(
            db,
            request,
            principal.tenantId,
            session.id,
            result.error ? "IDENTITY_VERIFICATION_FAILED" : "IDENTITY_VERIFIED",
          );
          return result;
        },
      ),
    );
  });
  app.post("/api/v1/kiosk/consent", async (request, reply) => {
    const principal = await service.authenticate(request);
    const body = consentInputSchema.parse(request.body);
    if (body.sessionId !== principal.sessionId)
      throw errors.notFound("Session");
    return send(
      reply,
      await service.mutate(
        request,
        principal,
        "consent.accept",
        body,
        async (db, session) => {
          const record = await acceptConsent(
            db,
            session,
            body,
            service.deps.now(),
          );
          const granted = record.decisions.filter(
            (d) => d.granted && d.categories.length > 0,
          );
          await service.audit(
            db,
            request,
            principal.tenantId,
            session.id,
            granted.length === 0
              ? "CONSENT_DECLINED"
              : granted.length === record.decisions.length
                ? "CONSENT_GRANTED"
                : "CONSENT_PARTIAL",
          );
          return { status: 201, body: record };
        },
      ),
    );
  });
  app.post("/api/v1/consent/:consentId/revoke", async (request, reply) => {
    const principal = await service.authenticate(request);
    const { consentId } = z
      .object({ consentId: z.string() })
      .parse(request.params);
    const body = z
      .object({ reason: z.literal("PATIENT_REQUEST") })
      .strict()
      .parse(request.body);
    return send(
      reply,
      await service.mutate(
        request,
        principal,
        `consent.revoke:${consentId}`,
        body,
        async (db, session) => {
          const consent = await db
            .selectFrom("consents")
            .selectAll()
            .where("id", "=", consentId)
            .where("tenantId", "=", principal.tenantId)
            .where("sessionId", "=", principal.sessionId)
            .where("patientId", "=", session.patientId ?? "")
            .executeTakeFirst();
          if (!consent) throw errors.notFound("Consent");
          const revokedAt =
            consent.revokedAt ?? service.deps.now().toISOString();
          await db
            .updateTable("consents")
            .set({ revokedAt, revokeReason: body.reason })
            .where("id", "=", consent.id)
            .where("tenantId", "=", principal.tenantId)
            .execute();
          if (!consent.revokedAt)
            await service.audit(
              db,
              request,
              principal.tenantId,
              session.id,
              "CONSENT_REVOKED",
            );
          return {
            status: 200,
            body: consentRecord({ ...consent, revokedAt }, service.deps.now()),
          };
        },
      ),
    );
  });
  app.get("/api/v1/patients/:patientId/consents", async (request) => {
    const principal = await authenticateStaff(
      request,
      service.deps.config,
      service.deps.now(),
    );
    const { patientId } = z
      .object({ patientId: z.string() })
      .parse(request.params);
    return service.deps.db.transaction().execute(async (db) => {
      const user = await db
        .selectFrom("users")
        .selectAll()
        .where("id", "=", principal.userId)
        .where("tenantId", "=", principal.tenantId)
        .where("active", "=", 1)
        .executeTakeFirst();
      const tenant = await db
        .selectFrom("tenants")
        .select("id")
        .where("id", "=", principal.tenantId)
        .where("deletedAt", "is", null)
        .executeTakeFirst();
      if (!user || !tenant) throw errors.unauthenticated();
      if (!hasPermission(parseRoles(user.rolesJson), "patient.read"))
        throw errors.forbidden();
      const patient = await db
        .selectFrom("patients")
        .select("id")
        .where("id", "=", patientId)
        .where("tenantId", "=", principal.tenantId)
        .where("deletedAt", "is", null)
        .executeTakeFirst();
      if (!patient) throw errors.notFound("Patient");
      const rows = await db
        .selectFrom("consents")
        .selectAll()
        .where("patientId", "=", patientId)
        .where("tenantId", "=", principal.tenantId)
        .orderBy("createdAt", "desc")
        .execute();
      await service.audit(
        db,
        request,
        principal.tenantId,
        patientId,
        "CONSENT_VIEWED",
      );
      return {
        consents: rows.map((row) => consentRecord(row, service.deps.now())),
      };
    });
  });
}
