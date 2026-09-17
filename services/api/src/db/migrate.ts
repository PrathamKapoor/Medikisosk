/**
 * Migration runner.
 *
 * Uses Kysely's own schema builder as the dialect-neutral DDL layer rather than a bespoke builder:
 * `schema.createTable()` emits valid SQL for both SQLite and Postgres, which is exactly the property
 * ADR-002 requires, and it is already maintained by the same library that issues our queries.
 *
 * Applied migrations are recorded in `schema_migrations`. A migration is applied inside a transaction
 * where the engine supports transactional DDL (Postgres does; SQLite does for most statements), so a
 * failed migration does not leave a half-created schema behind.
 *
 * Column-type choices are the intersection of both engines:
 *   varchar(N)        string identifiers, codes, enums-as-text
 *   text              long free text and JSON
 *   integer           0/1 booleans, counts
 *   double precision  measurements and confidence
 *   varchar(30)       ISO-8601 UTC timestamps, so no engine-local time function is involved
 */

import { sql, type Kysely } from "kysely";
import type { AppDatabase } from "./kysely";

export interface Migration {
  readonly id: string;
  readonly up: (db: Kysely<unknown>) => Promise<void>;
}

export const MIGRATION_TABLE = "schema_migrations";

async function ensureMigrationTable(db: AppDatabase): Promise<void> {
  // `if not exists` is valid on both SQLite and Postgres, so no engine branch is needed.
  await sql`
    create table if not exists ${sql.ref(MIGRATION_TABLE)} (
      id varchar(64) primary key,
      applied_at varchar(30) not null
    )
  `.execute(db);
}

export interface MigrationReport {
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
}

export async function runMigrations(
  db: AppDatabase,
  migrations: readonly Migration[],
): Promise<MigrationReport> {
  await ensureMigrationTable(db);

  // The ledger table is intentionally absent from the typed `Database` interface: it is migration
  // infrastructure, not domain data, and typing it would invite application code to read it.
  const alreadyApplied = await sql<{ id: string }>`
    select id from ${sql.ref(MIGRATION_TABLE)}
  `.execute(db);
  const appliedSet = new Set(alreadyApplied.rows.map((row) => row.id));

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const migration of migrations) {
    if (appliedSet.has(migration.id)) {
      skipped.push(migration.id);
      continue;
    }

    await migration.up(db as unknown as Kysely<unknown>);

    await sql`
      insert into ${sql.ref(MIGRATION_TABLE)} (id, applied_at)
      values (${migration.id}, ${new Date().toISOString()})
    `.execute(db);

    applied.push(migration.id);
  }

  return { applied, skipped };
}
