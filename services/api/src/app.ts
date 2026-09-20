/**
 * Fastify application factory.
 *
 * Why a factory rather than a top-level `fastify()` call: tests need to build an app against an
 * in-memory database and an injected clock, and a module-level singleton makes that impossible. The
 * factory also keeps `index.ts` free of wiring, so the bootstrap file only loads configuration, opens
 * the database and listens.
 */

import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import {
  capabilitiesFor,
  type AppConfig,
} from "./config/env-with-capabilities";
import type { AppDatabase } from "./db/kysely";
import type { AppLogger } from "./platform/logger";
import {
  registerErrorHandler,
  registerRequestIdHeader,
  registerTenantHeaderGuard,
} from "./platform/http-errors";
import { AuthService } from "./auth/service/auth.service";
import { registerAuthRoutes } from "./auth/routes/auth.routes";
import { KioskService } from "./kiosk/kiosk.service";
import { registerKioskRoutes } from "./kiosk/kiosk.routes";
import { InterviewService } from "./interview/interview.service";
import { registerInterviewRoutes } from "./interview/interview.routes";
import { IntakeService } from "./intake/intake.service";
import { registerIntakeRoutes } from "./intake/intake.routes";
import { DocumentService } from "./documents/document.service";
import { registerDocumentRoutes } from "./documents/document.routes";

export interface BuildAppDeps {
  readonly config: AppConfig;
  readonly db: AppDatabase;
  readonly logger: AppLogger;
  /** Injected so tests can freeze time. */
  readonly now?: () => Date;
}

export async function buildApp(deps: BuildAppDeps): Promise<FastifyInstance> {
  const { config, db, logger } = deps;
  const now = deps.now ?? (() => new Date());

  const app = Fastify({
    logger: false, // pino is wired separately as an AppLogger so PHI scrubbing is applied.
    trustProxy: false,
    bodyLimit: 1024 * 1024,
    genReqId: () => `req_${Math.random().toString(36).slice(2, 11)}`,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: [config.KIOSK_ORIGIN, config.CONSOLE_ORIGIN],
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Idempotency-Key",
      "X-Kiosk-Id",
      "X-Kiosk-Token",
    ],
    exposedHeaders: ["X-Request-Id"],
  });
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
  });

  registerRequestIdHeader(app);
  registerTenantHeaderGuard(app);
  registerErrorHandler(app, logger);

  /**
   * Liveness. Deliberately performs no database call: a health check that fails when the database is
   * briefly unavailable would cause the orchestrator to restart an API that is perfectly healthy.
   */
  app.get("/health", async () => ({
    status: "ok",
    version: "0.1.0",
    uptimeSeconds: Math.round(process.uptime()),
  }));

  /** Readiness. Does touch the database, because "ready to serve" means "can read and write". */
  app.get("/ready", async (_request, reply) => {
    try {
      await db.selectFrom("tenants").select("id").limit(1).executeTakeFirst();
      reply.status(200).send({ status: "ready", database: "ok" });
    } catch (error) {
      logger.warn({}, "Readiness probe failed", {
        reason: error instanceof Error ? error.name : "unknown",
      });
      reply.status(503).send({ status: "not_ready", database: "unavailable" });
    }
  });

  /**
   * Capability declaration. Generated from the same configuration the providers are built from, so it
   * can never drift from reality — this is the mechanism that stops a mock being presented as real.
   */
  app.get("/api/v1/capabilities", async () => capabilitiesFor(config));

  const authService = new AuthService({ db, logger, config, now });
  await registerAuthRoutes(app, { authService, config, now });
  const kioskService = new KioskService({ db, logger, config, now });
  await registerKioskRoutes(app, kioskService);
  const interviewService = new InterviewService({ db, config, logger, now });
  await registerInterviewRoutes(app, interviewService);
  const intakeService = new IntakeService({ db, config, logger, now });
  await registerIntakeRoutes(app, intakeService);
  await app.register(multipart, {
    limits: {
      fileSize: config.DOCUMENT_MAX_UPLOAD_MB * 1024 * 1024,
      files: 1,
      fields: 8,
    },
  });
  const documentService = new DocumentService({ db, config, logger, now });
  await registerDocumentRoutes(app, documentService);
  let cleanupTimer: NodeJS.Timeout | undefined;
  let cleanupRunning: Promise<void> | undefined;
  app.addHook("onReady", async () => {
    await kioskService.sweep();
    cleanupTimer = setInterval(
      () => {
        if (cleanupRunning) return;
        cleanupRunning = kioskService
          .sweep()
          .catch(() => {
            logger.error({}, "Session cleanup failed", {
              code: "SESSION_CLEANUP_FAILED",
            });
          })
          .finally(() => {
            cleanupRunning = undefined;
          });
      },
      Math.min(60_000, config.MEDIKIOSK_TEMP_RETENTION_MINUTES * 60_000),
    );
    cleanupTimer.unref();
  });
  app.addHook("onClose", async () => {
    clearInterval(cleanupTimer);
    await cleanupRunning;
  });

  return app;
}
