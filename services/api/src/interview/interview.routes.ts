/**
 * Interview runtime — Fastify routes (contract §6–§7).
 *
 * Every mutating endpoint authenticates the kiosk session, then the service owns the replay /
 * transaction / consent / audit ordering. Reading an encounter is available to the owning kiosk
 * session or a staff member with `patient.read` (the GET handler falls back to staff auth when the
 * bearer token is not a valid kiosk session).
 */

import { z } from "zod";
import type { FastifyInstance, FastifyReply } from "fastify";
import { MediKioskError } from "@medikiosk/shared-types";
import { InterviewService } from "./interview.service";
import type { MutationResult } from "../kiosk/replay";

function send(reply: FastifyReply, result: MutationResult) {
  if (result.error)
    throw new MediKioskError(result.error.code, result.error.message);
  return reply.status(result.status).send(result.body);
}

const encounterParams = z.object({ encounterId: z.string().min(1) });

const createEncounterBody = z
  .object({
    patientId: z.string().min(1),
    sessionId: z.string().min(1),
    encounterType: z.literal("OPD"),
    chiefComplaintCodes: z.array(z.string().min(1)).min(1),
    chiefComplaintVerbatim: z.string().max(2000).optional(),
    locale: z.string().min(2).max(16),
    ayushMode: z.boolean().optional(),
    questionnaireVersion: z.string().max(24).optional(),
  })
  .strict();

const responseBody = z
  .object({
    questionKey: z.string().min(1),
    state: z
      .enum(["ANSWERED", "SKIPPED", "DECLINED", "UNKNOWN", "NOT_APPLICABLE"])
      .optional(),
    rawAnswer: z.string().max(4000).optional(),
    modality: z.enum(["VOICE", "TOUCH", "STAFF_ASSISTED", "IMPORTED"]),
    asrConfidence: z.number().min(0).max(1).optional(),
    asrLanguage: z.string().max(16).optional(),
    normalisedAnswer: z.unknown().optional(),
  })
  .strict();

const localeBody = z.object({ locale: z.string().min(2).max(16) }).strict();

export async function registerInterviewRoutes(
  app: FastifyInstance,
  service: InterviewService,
) {
  app.post("/api/v1/encounters", async (request, reply) => {
    const principal = await service.authenticate(request);
    const body = createEncounterBody.parse(request.body);
    return send(reply, await service.createEncounter(request, principal, body));
  });

  app.get("/api/v1/encounters/:encounterId", async (request) => {
    const { encounterId } = encounterParams.parse(request.params);
    try {
      const principal = await service.authenticate(request);
      return service.readKiosk(request, principal, encounterId);
    } catch (error) {
      if (
        !(error instanceof MediKioskError) ||
        error.code !== "UNAUTHENTICATED"
      )
        throw error;
      return service.readStaff(request, encounterId);
    }
  });

  app.get("/api/v1/encounters/:encounterId/interview/next", async (request) => {
    const { encounterId } = encounterParams.parse(request.params);
    const principal = await service.authenticate(request);
    return service.next(request, principal, encounterId);
  });

  app.post(
    "/api/v1/encounters/:encounterId/interview/response",
    async (request, reply) => {
      const { encounterId } = encounterParams.parse(request.params);
      const principal = await service.authenticate(request);
      const body = responseBody.parse(request.body);
      return send(
        reply,
        await service.respond(request, principal, encounterId, body),
      );
    },
  );

  app.post(
    "/api/v1/encounters/:encounterId/interview/finish",
    async (request) => {
      const { encounterId } = encounterParams.parse(request.params);
      const principal = await service.authenticate(request);
      return service.finish(request, principal, encounterId);
    },
  );

  app.post(
    "/api/v1/encounters/:encounterId/interview/language",
    async (request, reply) => {
      const { encounterId } = encounterParams.parse(request.params);
      const principal = await service.authenticate(request);
      const body = localeBody.parse(request.body);
      return send(
        reply,
        await service.language(request, principal, encounterId, body.locale),
      );
    },
  );

  app.post("/api/v1/encounters/:encounterId/submit", async (request, reply) => {
    const { encounterId } = encounterParams.parse(request.params);
    const principal = await service.authenticate(request);
    return send(reply, await service.submit(request, principal, encounterId));
  });
}
