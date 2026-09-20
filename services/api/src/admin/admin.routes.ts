/**
 * Administration routes — staff-only except the public liveness-style system health probe.
 */

import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { AdminService, auditQuerySchema } from "./admin.service";

const kioskParams = z.object({ kioskId: z.string().min(1) });
const encounterParams = z.object({ encounterId: z.string().min(1) });

export async function registerAdminRoutes(
  app: FastifyInstance,
  service: AdminService,
): Promise<void> {
  app.get("/api/v1/admin/overview", async (request) => {
    return service.overview(request);
  });

  app.get("/api/v1/admin/kiosks", async (request) => {
    return service.kiosks(request);
  });

  app.post("/api/v1/admin/kiosks/:kioskId/heartbeat", async (request) => {
    const { kioskId } = kioskParams.parse(request.params);
    return service.heartbeat(request, kioskId);
  });

  app.get("/api/v1/admin/audit", async (request) => {
    const query = auditQuerySchema.parse(request.query ?? {});
    return service.auditLog(request, query);
  });

  app.get("/api/v1/system/health", async () => {
    return service.health();
  });

  app.get("/api/v1/encounters/:encounterId/fhir", async (request) => {
    const { encounterId } = encounterParams.parse(request.params);
    return service.fhirBundle(request, encounterId);
  });
}
