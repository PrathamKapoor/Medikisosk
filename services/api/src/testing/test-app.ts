import { createDatabase, type AppDatabase } from "../db/kysely";
import { runMigrations } from "../db/migrate";
import { MIGRATIONS } from "../db/migrations";
import { loadConfig, type AppConfig } from "../config/env";
import { createLogger, type AppLogger } from "../platform/logger";
import { buildApp } from "../app";
import { seedBase } from "../db/seed";
import { seedDemoCase } from "../db/seed-demo";
import type { FastifyInstance } from "fastify";

export const TEST_NOW = () => new Date("2026-09-17T12:00:00.000Z");

export const TEST_ENV: Record<string, string> = {
  NODE_ENV: "test",
  MEDIKIOSK_DEPLOYMENT_MODE: "local",
  API_PORT: "8099",
  API_HOST: "127.0.0.1",
  API_PUBLIC_URL: "http://localhost:8099",
  KIOSK_ORIGIN: "http://localhost:5173",
  CONSOLE_ORIGIN: "http://localhost:5174",
  MEDIKIOSK_DB_DIALECT: "sqlite",
  MEDIKIOSK_SQLITE_PATH: ":memory:",
  MEDIKIOSK_JWT_SECRET: "dev-only-insecure-jwt-secret-replace-me",
  MEDIKIOSK_SESSION_ENCRYPTION_KEY: "dev-only-insecure-session-key-replace-me",
  MEDIKIOSK_HASH_PEPPER: "dev-only-insecure-pepper-replace-me",
  IDENTITY_PROVIDER: "mock",
  LLM_PROVIDER: "mock",
  LLM_MODEL: "medikiosk-deterministic-v1",
  ASR_PROVIDER: "browser",
  OCR_PROVIDER: "mock",
  OCR_MODEL: "medikiosk-synthetic-ocr-v1",
  TTS_PROVIDER: "browser",
  NER_PROVIDER: "deterministic",
  LOG_LEVEL: "error",
  LOG_PHI: "false",
  METRICS_ENABLED: "false",
};

export interface BuiltTestApp {
  readonly app: FastifyInstance;
  readonly db: AppDatabase;
  readonly config: AppConfig;
  readonly tenantId: string;
  readonly destroy: () => Promise<void>;
}

/** Real SQLite connection, migrations and synthetic seeds, isolated per fixture. */
export async function buildTestApp(
  options: {
    now?: () => Date;
    logger?: AppLogger;
  } = {},
): Promise<BuiltTestApp> {
  const { config } = loadConfig(TEST_ENV);
  const { db } = await createDatabase(config);
  let app: FastifyInstance | undefined;
  try {
    await runMigrations(db, MIGRATIONS);
    const base = await seedBase(db, config.MEDIKIOSK_HASH_PEPPER);
    await seedDemoCase(db, base.tenantId, config);
    app = await buildApp({
      config,
      db,
      logger: options.logger ?? createLogger(config),
      now: options.now ?? TEST_NOW,
    });
    await app.ready();
    const readyApp = app;
    return {
      app: readyApp,
      db,
      config,
      tenantId: base.tenantId,
      destroy: async () => {
        try {
          await readyApp.close();
        } finally {
          await db.destroy();
        }
      },
    };
  } catch (error) {
    try {
      await app?.close();
    } finally {
      await db.destroy();
    }
    throw error;
  }
}
