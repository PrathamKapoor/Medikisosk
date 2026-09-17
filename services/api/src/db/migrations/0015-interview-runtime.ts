/**
 * Migration 0015 — interview runtime.
 *
 * Adds the interview-session bookkeeping row and the columns needed by the Phase 3 runtime.
 * The interview's *clinical* state is deliberately NOT duplicated here: questionnaire_responses,
 * symptoms, medications, allergy_records, history_entries and evidence are the source of truth
 * and the current question / completion status are derived from them (ADR-012). This table only
 * anchors lifecycle bookkeeping, the active pathway set and the pathway/runtime versions against
 * which the history must be interpreted.
 *
 * Follows repository conventions: ULID ids (varchar(26)), ISO-8601 UTC timestamps (varchar(30)),
 * booleans as integer 0/1, JSON as text parsed with Zod at the repository boundary.
 */

import type { Kysely } from "kysely";

export const MIGRATION_0015_INTERVIEW_RUNTIME = {
  id: "0015_interview_runtime",
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable("interview_sessions")
      .addColumn("id", "varchar(26)", (col) => col.primaryKey())
      .addColumn("tenantId", "varchar(26)", (col) =>
        col.notNull().references("tenants.id"),
      )
      .addColumn("encounterId", "varchar(26)", (col) =>
        col.notNull().references("encounters.id"),
      )
      .addColumn("patientId", "varchar(26)", (col) =>
        col.notNull().references("patients.id"),
      )
      // The kiosk session that drove the interview. No FK on purpose: a wiped session row is
      // replaced, but its interview history must remain interpretable (ADR-007).
      .addColumn("kioskSessionId", "varchar(26)", (col) => col.notNull())
      // ACTIVE | COMPLETED | ABANDONED — lifecycle only; interview status is derived.
      .addColumn("status", "varchar(24)", (col) => col.notNull())
      .addColumn("pathwayKeysJson", "text", (col) => col.notNull())
      .addColumn("pathwayVersion", "varchar(24)", (col) => col.notNull())
      .addColumn("runtimeVersion", "varchar(24)", (col) => col.notNull())
      .addColumn("startedAt", "varchar(30)", (col) => col.notNull())
      .addColumn("completedAt", "varchar(30)")
      .addColumn("createdAt", "varchar(30)", (col) => col.notNull())
      .addColumn("updatedAt", "varchar(30)", (col) => col.notNull())
      .addColumn("deletedAt", "varchar(30)")
      .execute();

    await db.schema
      .createIndex("idx_interview_sessions_encounter")
      .on("interview_sessions")
      .columns(["tenantId", "encounterId"])
      .execute();

    // The server recomputes normalisation and records whether the client-supplied hint disagreed,
    // so a divergent client interpretation is visible in the response row (contract §7).
    await db.schema
      .alterTable("questionnaire_responses")
      .addColumn("hintMismatch", "integer", (col) => col.notNull().defaultTo(0))
      .execute();

    await db.schema
      .createIndex("idx_questionnaire_responses_encounter")
      .on("questionnaire_responses")
      .columns(["tenantId", "encounterId"])
      .execute();
  },
  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .dropIndex("idx_questionnaire_responses_encounter")
      .execute();
    await db.schema
      .alterTable("questionnaire_responses")
      .dropColumn("hintMismatch")
      .execute();
    await db.schema.dropIndex("idx_interview_sessions_encounter").execute();
    await db.schema.dropTable("interview_sessions").execute();
  },
};
