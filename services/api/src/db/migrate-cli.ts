/**
 * Migration command.
 *
 * Applies every pending migration in order and prints a report. Idempotent: running it twice in a
 * row applies nothing the second time. Used by `npm run db:migrate` and by the demo script, so a
 * fresh clone reaches a working database with one command.
 */

import dotenv from 'dotenv';
import { loadConfig } from '../config/env';
import { createDatabase } from './kysely';
import { runMigrations } from './migrate';
import { MIGRATIONS } from './migrations/index';

async function main(): Promise<void> {
  dotenv.config();

  const { config } = loadConfig();
  const handle = await createDatabase(config);

  try {
    const report = await runMigrations(handle.db, MIGRATIONS);
    if (report.applied.length === 0) {
      process.stdout.write(`Database is up to date (${report.skipped.length} migration(s) already applied).\n`);
    } else {
      process.stdout.write(
        `Applied ${report.applied.length} migration(s): ${report.applied.join(', ')}.\n`,
      );
    }
  } finally {
    await handle.destroy();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Migration failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});