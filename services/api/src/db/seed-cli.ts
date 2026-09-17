/**
 * Seed command.
 *
 * Seeds the base dataset — tenant, staff, kiosk and consent versions — plus the longitudinal demo
 * case when `--profile demo` is passed. Like migrations, this is idempotent: running it twice in a
 * row changes nothing the second time.
 */

import dotenv from 'dotenv';
import { loadConfig } from '../config/env';
import { createDatabase } from './kysely';
import { runMigrations } from './migrate';
import { MIGRATIONS } from './migrations/index';
import { seedBase } from './seed';
import { seedDemoCase } from './seed-demo';

async function main(): Promise<void> {
  dotenv.config();

  const profile = process.argv.includes('--profile') ? process.argv[process.argv.indexOf('--profile') + 1] : 'base';

  const { config } = loadConfig();
  const handle = await createDatabase(config);

  try {
    await runMigrations(handle.db, MIGRATIONS);
    const base = await seedBase(handle.db, config.MEDIKIOSK_HASH_PEPPER);
    process.stdout.write(
      `Seeded tenant ${base.tenantId}: ${base.users.length} staff, ${base.kiosks.length} kiosk(s), ${base.consentVersions.length} consent version(s).\n`,
    );

    if ((profile ?? 'base') === 'demo') {
      const demo = await seedDemoCase(handle.db, base.tenantId, config);
      process.stdout.write(
        `Seeded demo case: patient ${demo.patientId}, previous ${demo.previousEncounterId}, current ${demo.currentEncounterId}.\n`,
      );
    } else {
      process.stdout.write('Base seed only. Pass --profile demo for the longitudinal demo case.\n');
    }
  } finally {
    await handle.destroy();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Seed failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exit(1);
});