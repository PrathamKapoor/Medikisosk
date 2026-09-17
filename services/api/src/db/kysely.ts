/**
 * Kysely database construction with runtime dialect selection.
 *
 * One code path reads and writes; only the driver differs. `MEDIKIOSK_DB_DIALECT=sqlite` uses the
 * file database with foreign keys enforced, `postgres` uses a pooled connection. Every other module
 * receives `AppDatabase` and never knows which engine is underneath, which is what keeps the SQLite
 * development path honest against the Postgres production path. See ADR-002.
 */

import { Kysely, PostgresDialect, SqliteDialect, type KyselyConfig } from 'kysely';
import { Pool } from 'pg';
import type { Database } from './schema';
import type { AppConfig } from '../config/env';

export type AppDatabase = Kysely<Database>;

export interface DatabaseHandle {
  readonly db: AppDatabase;
  readonly dialect: 'sqlite' | 'postgres';
  readonly destroy: () => Promise<void>;
}

export async function createDatabase(config: AppConfig): Promise<DatabaseHandle> {
  if (config.MEDIKIOSK_DB_DIALECT === 'postgres') {
    return createPostgres(config);
  }
  return createSqlite(config);
}

async function createSqlite(config: AppConfig): Promise<DatabaseHandle> {
  // Loaded lazily so a Postgres-only deployment never requires the native module.
  const DatabaseCtor = (await import('better-sqlite3')).default;

  const { mkdirSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  mkdirSync(dirname(config.MEDIKIOSK_SQLITE_PATH), { recursive: true });

  const sqlite = new DatabaseCtor(config.MEDIKIOSK_SQLITE_PATH);
  // Foreign keys are off by default in SQLite. Leaving them off would silently accept orphaned
  // clinical rows, so they are enforced on every connection.
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  const kyselyConfig: KyselyConfig = {
    dialect: new SqliteDialect({ database: sqlite }),
  };
  const db = new Kysely<Database>(kyselyConfig);

  return {
    db,
    dialect: 'sqlite',
    destroy: async () => {
      await db.destroy();
    },
  };
}

async function createPostgres(config: AppConfig): Promise<DatabaseHandle> {
  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  pool.on('error', () => {
    // Pool errors are surfaced through queries; an unhandled pool error event would crash the
    // process, so a no-op listener exists and the readiness probe reports the outage instead.
  });

  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

  // Fail fast at boot when the database is unreachable, rather than serving a half-alive API.
  // Readiness implies migrations ran, so `tenants` must exist.
  await db
    .selectFrom('tenants')
    .select('id')
    .limit(1)
    .executeTakeFirstOrThrow();

  return {
    db,
    dialect: 'postgres',
    destroy: async () => {
      await db.destroy();
      await pool.end();
    },
  };
}

/** Run a callback inside a transaction. The callback must not leak the transaction object. */
export async function transaction<T>(
  db: AppDatabase,
  fn: (trx: AppDatabase) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(fn);
}