/**
 * Clinical summary route — staff (`summary.read`) or the owning kiosk session.
 */

import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { SummaryService } from "./summary.service";

const encounterParams = z.object({ encounterId: z.string().min(1) });

export async function registerSummaryRoutes(
  app: FastifyInstance,
  service: SummaryService,
): Promise<void> {
  app.get("/api/v1/encounters/:encounterId/summary", async (request) => {
    const { encounterId } = encounterParams.parse(request.params);
    return service.read(request, encounterId);
  });
}
