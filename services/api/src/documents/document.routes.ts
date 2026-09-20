/**
 * Document pipeline routes.
 *
 * Multipart uploads are kiosk-session-owned; the download and entity-verification routes accept
 * either the owning kiosk session or staff with the matching permission (the same fallback shape
 * as the encounter read route).
 */

import { z } from "zod";
import type { FastifyInstance, FastifyReply } from "fastify";
import { MediKioskError } from "@medikiosk/shared-types";
import {
  DocumentService,
  verifyEntityBodySchema,
} from "./document.service";
import type { MutationResult } from "../kiosk/replay";

function send(reply: FastifyReply, result: MutationResult) {
  if (result.error)
    throw new MediKioskError(result.error.code, result.error.message);
  return reply.status(result.status).send(result.body);
}

const encounterParams = z.object({ encounterId: z.string().min(1) });
const documentParams = z.object({
  encounterId: z.string().min(1),
  documentId: z.string().min(1),
});
const downloadParams = z.object({ documentId: z.string().min(1) });
const entityParams = z.object({
  documentId: z.string().min(1),
  entityId: z.string().min(1),
});
const demoParams = z.object({ name: z.string().min(1).max(64) });

export async function registerDocumentRoutes(
  app: FastifyInstance,
  service: DocumentService,
): Promise<void> {
  app.post(
    "/api/v1/encounters/:encounterId/documents",
    async (request, reply) => {
      const { encounterId } = encounterParams.parse(request.params);
      const principal = await service.authenticate(request);
      const file = await request.file();
      if (!file)
        throw new MediKioskError(
          "DOCUMENT_MALFORMED",
          "The request must contain one uploaded file.",
        );
      const fields = file.fields as unknown as Record<
        string,
        { value?: unknown } | undefined
      >;
      const documentType = String(fields.documentType?.value ?? "OTHER");
      return send(
        reply,
        await service.upload(request, principal, encounterId, file, documentType),
      );
    },
  );

  app.get("/api/v1/encounters/:encounterId/documents", async (request) => {
    const { encounterId } = encounterParams.parse(request.params);
    return service.list(request, encounterId);
  });

  app.get("/api/v1/documents/:documentId/download", async (request, reply) => {
    const { documentId } = downloadParams.parse(request.params);
    const downloaded = await service.download(request, documentId);
    return reply
      .type(downloaded.mimeType)
      .header(
        "Content-Disposition",
        `attachment; filename="${downloaded.filename.replace(/"/g, "")}"`,
      )
      .send(Buffer.from(downloaded.bytes));
  });

  app.post(
    "/api/v1/encounters/:encounterId/documents/:documentId/confirm",
    async (request, reply) => {
      const { encounterId, documentId } = documentParams.parse(request.params);
      const principal = await service.authenticate(request);
      return send(
        reply,
        await service.confirmExtraction(
          request,
          principal,
          encounterId,
          documentId,
        ),
      );
    },
  );

  app.post(
    "/api/v1/encounters/:encounterId/documents/:documentId/reject",
    async (request, reply) => {
      const { encounterId, documentId } = documentParams.parse(request.params);
      const principal = await service.authenticate(request);
      return send(
        reply,
        await service.rejectExtraction(
          request,
          principal,
          encounterId,
          documentId,
        ),
      );
    },
  );

  app.post(
    "/api/v1/documents/:documentId/entities/:entityId/verify",
    async (request, reply) => {
      const { documentId, entityId } = entityParams.parse(request.params);
      const body = verifyEntityBodySchema.parse(request.body ?? {});
      // Clinician verification is staff-only; no Idempotency-Key contract here because the
      // console issues discrete review actions. A repeated VERIFY is a safe no-op by state.
      const result = await service.verifyEntity(
        request,
        documentId,
        entityId,
        body,
      );
      return send(reply, result);
    },
  );

  app.get("/api/v1/demo-documents", async (request) => {
    return service.listDemoDocuments(request);
  });

  app.get("/api/v1/demo-documents/:name", async (request, reply) => {
    const { name } = demoParams.parse(request.params);
    const fixture = await service.demoDocumentBytes(request, name);
    return reply
      .type(fixture.mimeType)
      .header("Content-Disposition", `attachment; filename="${name}"`)
      .send(Buffer.from(fixture.bytes));
  });
}
