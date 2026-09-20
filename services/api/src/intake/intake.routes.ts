/**
 * Structured intake routes — kiosk-session-owned, consent-gated.
 *
 * The route layer only validates the request shape, authenticates the kiosk session and delegates
 * to the service (which owns replay/transaction/consent/audit ordering).
 */

import { z } from "zod";
import type { FastifyInstance, FastifyReply } from "fastify";
import { MediKioskError } from "@medikiosk/shared-types";
import {
  IntakeService,
  allergiesBodySchema,
  historyBodySchema,
  medicationsBodySchema,
  removeBodySchema,
  vitalsBodySchema,
} from "./intake.service";
import type { MutationResult } from "../kiosk/replay";

function send(reply: FastifyReply, result: MutationResult) {
  if (result.error)
    throw new MediKioskError(result.error.code, result.error.message);
  return reply.status(result.status).send(result.body);
}

const encounterParams = z.object({ encounterId: z.string().min(1) });

export async function registerIntakeRoutes(
  app: FastifyInstance,
  service: IntakeService,
): Promise<void> {
  app.post("/api/v1/encounters/:encounterId/vitals", async (request, reply) => {
    const { encounterId } = encounterParams.parse(request.params);
    const principal = await service.authenticate(request);
    const body = vitalsBodySchema.parse(request.body ?? {});
    return send(
      reply,
      await service.recordVitals(request, principal, encounterId, body),
    );
  });

  app.post("/api/v1/encounters/:encounterId/history", async (request, reply) => {
    const { encounterId } = encounterParams.parse(request.params);
    const principal = await service.authenticate(request);
    const body = historyBodySchema.parse(request.body ?? {});
    return send(
      reply,
      await service.addHistory(request, principal, encounterId, body),
    );
  });

  app.post(
    "/api/v1/encounters/:encounterId/medications",
    async (request, reply) => {
      const { encounterId } = encounterParams.parse(request.params);
      const principal = await service.authenticate(request);
      const body = medicationsBodySchema.parse(request.body ?? {});
      return send(
        reply,
        await service.addMedications(request, principal, encounterId, body),
      );
    },
  );

  app.post(
    "/api/v1/encounters/:encounterId/allergies",
    async (request, reply) => {
      const { encounterId } = encounterParams.parse(request.params);
      const principal = await service.authenticate(request);
      const body = allergiesBodySchema.parse(request.body ?? {});
      return send(
        reply,
        await service.addAllergies(request, principal, encounterId, body),
      );
    },
  );

  app.post(
    "/api/v1/encounters/:encounterId/clinical/remove",
    async (request, reply) => {
      const { encounterId } = encounterParams.parse(request.params);
      const principal = await service.authenticate(request);
      const body = removeBodySchema.parse(request.body ?? {});
      return send(
        reply,
        await service.removeClinicalEntry(request, principal, encounterId, body),
      );
    },
  );

  app.get("/api/v1/encounters/:encounterId/review", async (request) => {
    const { encounterId } = encounterParams.parse(request.params);
    const principal = await service.authenticate(request);
    return service.review(request, principal, encounterId);
  });

  app.post(
    "/api/v1/encounters/:encounterId/confirm",
    async (request, reply) => {
      const { encounterId } = encounterParams.parse(request.params);
      const principal = await service.authenticate(request);
      return send(
        reply,
        await service.confirmReview(request, principal, encounterId),
      );
    },
  );
}
