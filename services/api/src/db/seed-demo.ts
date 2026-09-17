/**
 * Demo clinical seed, orchestrator.
 *
 * Runs the parts in dependency order and returns the fixed fixture ids the demo walkthrough and the
 * evaluation harness assert against.
 */

import type { AppConfig } from "../config/env";
import type { AppDatabase } from "./kysely";
import {
  DEMO_FIXTURES,
  seedDemoEncounters,
  seedDemoPatient,
} from "./seed-demo-patient";
import { seedDemoPriorFacts } from "./seed-demo-prior";
import { seedDemoCurrentVisit, type DemoCaseIds } from "./seed-demo-current";

export async function seedDemoCase(
  db: AppDatabase,
  tenantId: string,
  _config: AppConfig,
): Promise<DemoCaseIds> {
  await seedDemoPatient(db, tenantId);
  await seedDemoEncounters(db, tenantId);
  await seedDemoPriorFacts(db, tenantId);
  await seedDemoCurrentVisit(db, tenantId);

  return {
    tenantId,
    patientId: DEMO_FIXTURES.patientId,
    previousEncounterId: DEMO_FIXTURES.previousEncounterId,
    currentEncounterId: DEMO_FIXTURES.currentEncounterId,
  };
}
