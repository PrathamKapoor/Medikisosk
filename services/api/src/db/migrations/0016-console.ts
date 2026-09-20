/**
 * Migration 0016 - review confirmation, completion state, queue tokens and doctor notes.
 *
 * The kiosk workflow gains an explicit patient-review gate (`encounters.patientConfirmedAt`:
 * submission is refused until the patient has confirmed the assembled record), the queue gains a
 * human-showable token number, and the encounter gains the completion/disposition columns the
 * physician console writes. Doctor notes live in their own table so they are never mixed with
 * patient-reported or system-derived data (ADR-005 separation).
 */

import type { Kysely } from "kysely";

export const MIGRATION_0016_CONSOLE = {
  id: "0016_console",
  async up(db: Kysely<unknown>): Promise<void> {
    const schema = db.schema;

    await schema
      .alterTable("encounters")
      .addColumn("patientConfirmedAt", "varchar(30)")
      .execute();
    await schema
      .alterTable("encounters")
      .addColumn("completedAt", "varchar(30)")
      .execute();
    await schema
      .alterTable("encounters")
      .addColumn("disposition", "varchar(64)")
      .execute();
    await schema
      .alterTable("encounters")
      .addColumn("dispositionBy", "varchar(26)")
      .execute();

    await schema
      .alterTable("queue_entries")
      .addColumn("tokenNumber", "varchar(12)")
      .execute();
    await schema
      .createIndex("idx_queue_status")
      .on("queue_entries")
      .columns(["tenantId", "status", "enqueuedAt"])
      .execute();

    await schema
      .createTable("encounter_notes")
      .addColumn("id", "varchar(26)", (col) => col.primaryKey())
      .addColumn("tenantId", "varchar(26)", (col) =>
        col.notNull().references("tenants.id"),
      )
      .addColumn("encounterId", "varchar(26)", (col) =>
        col.notNull().references("encounters.id"),
      )
      .addColumn("authorId", "varchar(26)", (col) => col.notNull())
      .addColumn("authorName", "varchar(120)", (col) => col.notNull())
      .addColumn("note", "text", (col) => col.notNull())
      .addColumn("createdAt", "varchar(30)", (col) => col.notNull())
      .execute();
    await schema
      .createIndex("idx_notes_encounter")
      .on("encounter_notes")
      .columns(["tenantId", "encounterId", "createdAt"])
      .execute();
  },
};
