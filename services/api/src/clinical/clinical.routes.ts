/**
 * Clinical console routes — staff-only. The route layer validates shapes and delegates; the
 * service owns authorisation, transactions and audit.
 */

import { z } from "zod";
import type { FastifyInstance } from "fastify";
import {
  ClinicalService,
  compareQuerySchema,
  diagnosisBodySchema,
  dispositionBodySchema,
  noteBodySchema,
} from "./clinical.service";

const queueParams = z.object({ queueId: z.string().min(1) });
const patientParams = z.object({ patientId: z.string().min(1) });
const encounterParams = z.object({ encounterId: z.string().min(1) });
const searchQuery = z.object({ query: z.string().min(1).max(120) }).strict();
const queueQuery = z
  .object({ status: z.string().min(1).max(24).optional() })
  .strict();

export async function registerClinicalRoutes(
  app: FastifyInstance,
  service: ClinicalService,
): Promise<void> {
  app.get("/api/v1/queue", async (request) => {
    const { status } = queueQuery.parse(request.query ?? {});
    return service.queue(request, status);
  });

  app.post("/api/v1/queue/:queueId/call", async (request) => {
    const { queueId } = queueParams.parse(request.params);
    return service.transitionQueue(request, queueId, "call");
  });

  app.post("/api/v1/queue/:queueId/start", async (request) => {
    const { queueId } = queueParams.parse(request.params);
    return service.transitionQueue(request, queueId, "start");
  });

  app.post("/api/v1/queue/:queueId/cancel", async (request) => {
    const { queueId } = queueParams.parse(request.params);
    return service.transitionQueue(request, queueId, "cancel");
  });

  app.get("/api/v1/patients", async (request) => {
    const { query } = searchQuery.parse(request.query ?? {});
    return service.searchPatients(request, query);
  });

  app.get("/api/v1/patients/:patientId", async (request) => {
    const { patientId } = patientParams.parse(request.params);
    return service.patientRecord(request, patientId);
  });

  app.get("/api/v1/patients/:patientId/timeline", async (request) => {
    const { patientId } = patientParams.parse(request.params);
    return service.patientTimeline(request, patientId);
  });

  app.get("/api/v1/patients/:patientId/compare", async (request) => {
    const { patientId } = patientParams.parse(request.params);
    const { previous, current } = compareQuerySchema.parse(request.query ?? {});
    return service.compareEncounters(request, patientId, previous, current);
  });

  app.get("/api/v1/encounters/:encounterId/case", async (request) => {
    const { encounterId } = encounterParams.parse(request.params);
    return service.caseView(request, encounterId);
  });

  app.post("/api/v1/encounters/:encounterId/notes", async (request) => {
    const { encounterId } = encounterParams.parse(request.params);
    const body = noteBodySchema.parse(request.body ?? {});
    return service.addNote(request, encounterId, body);
  });

  app.post("/api/v1/encounters/:encounterId/diagnoses", async (request) => {
    const { encounterId } = encounterParams.parse(request.params);
    const body = diagnosisBodySchema.parse(request.body ?? {});
    return service.addDiagnosis(request, encounterId, body);
  });

  app.post("/api/v1/encounters/:encounterId/disposition", async (request) => {
    const { encounterId } = encounterParams.parse(request.params);
    const body = dispositionBodySchema.parse(request.body ?? {});
    return service.recordDisposition(request, encounterId, body);
  });

  app.post("/api/v1/encounters/:encounterId/complete", async (request) => {
    const { encounterId } = encounterParams.parse(request.params);
    return service.completeEncounter(request, encounterId);
  });
}
