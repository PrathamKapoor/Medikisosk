/**
 * API entry point.
 *
 * Loads configuration, opens the database, builds the application and listens. Nothing else: the
 * wiring lives in `app.ts`, so this file stays readable and a deployment problem is easy to locate.
 *
 * Boot order is deliberate. Configuration is validated before the logger exists, so a fatal
 * misconfiguration is reported by the process rather than by an application that never started. The
 * database is opened before the server listens, so the API is never briefly reachable in a
 * half-initialised state.
 */

import dotenv from 'dotenv';
import { loadConfig } from './config/env';
import { createLogger } from './platform/logger';
import { createDatabase } from './db/kysely';
import { buildApp } from './app';

async function main(): Promise<void> {
  // Loaded before configuration is read. Missing `.env` is not an error: in staging and production the
  // environment is supplied by the orchestrator.
  dotenv.config();

  const { config, warnings } = loadConfig();
  const logger = createLogger(config);

  logger.info(
    { route: 'boot' },
    `MediKiosk API starting in ${config.MEDIKIOSK_DEPLOYMENT_MODE} mode on ${config.MEDIKIOSK_DB_DIALECT}`,
  );

  // Mocks are announced at every boot. An operator should never have to read the config to learn that
  // identity or OCR is a deterministic stand-in.
  for (const warning of warnings) {
    logger.warn({ route: 'boot' }, warning);
  }
  if (config.usingDevelopmentSecrets) {
    logger.warn(
      { route: 'boot' },
      'Development default secrets are in use. This is acceptable locally only; production refuses to start with them.',
    );
  }

  const handle = await createDatabase(config);
  const app = await buildApp({ config, db: handle.db, logger });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ route: 'shutdown' }, `Received ${signal}. Closing the server.`);
    try {
      await app.close();
      await handle.destroy();
      logger.info({ route: 'shutdown' }, 'Shutdown complete.');
      process.exit(0);
    } catch (error) {
      logger.error({ route: 'shutdown' }, 'Shutdown failed', {
        reason: error instanceof Error ? error.message : 'unknown',
      });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: config.API_PORT, host: config.API_HOST });

  logger.info(
    { route: 'boot' },
    `Listening on http://${config.API_HOST}:${config.API_PORT} — health at /health, readiness at /ready`,
  );
}

main().catch((error: unknown) => {
  // Configuration validation fails before the logger exists, so this is the one place a raw message is
  // written to stderr. It contains no PHI: it is a configuration refusal.
  process.stderr.write(
    `MediKiosk API failed to start: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});