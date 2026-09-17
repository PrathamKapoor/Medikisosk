/**
 * Migration 0009 — triage assessments and the queue.
 *
 * `triage_assessments` records the rule-set version alongside the level. Without it a historical triage
 * decision could not be replayed: the rules that produced it would be unknown, and "why was this
 * patient escalated?" would be unanswerable.
 *
 * The override columns are separate from the assessment columns so both the system's recommendation
 * and the clinician's decision survive. The system records an override; it never overwrites its own
 * assessment, and it never overrides the clinician.
 */

import type { Kysely } from "kysely";

export const MIGRATION_0009_TRIAGE = {
  id: "0009_triage",
  async up(db: Kysely<unknown>): Promise<void> {
    const schema = db.schema;

    await schema
      .createTable("triage_assessments")
      .addColumn("id", "varchar(26)", (col) => col.primaryKey())
      .addColumn("tenantId", "varchar(26)", (col) =>
        col.notNull().references("tenants.id"),
      )
      .addColumn("encounterId", "varchar(26)", (col) =>
        col.notNull().references("encounters.id"),
      )
      .addColumn("level", "varchar(16)", (col) => col.notNull())
      .addColumn("priority", "varchar(16)", (col) => col.notNull())
      .addColumn("ruleSetVersion", "varchar(24)", (col) => col.notNull())
      .addColumn("requiresHumanReview", "integer", (col) =>
        col.notNull().defaultTo(0),
      )
      .addColumn("explanation", "text", (col) => col.notNull())
      .addColumn("hitsJson", "text", (col) => col.notNull())
      .addColumn("overriddenTo", "varchar(16)")
      .addColumn("overriddenBy", "varchar(26)")
      .addColumn("overrideReason", "text")
      .addColumn("overriddenAt", "varchar(30)")
      .addColumn("assessedAt", "varchar(30)", (col) => col.notNull())
      .execute();

    await schema
      .createIndex("idx_triage_encounter")
      .on("triage_assessments")
      .columns(["tenantId", "encounterId"])
      .execute();

    await schema
      .createTable("queue_entries")
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
      .addColumn("priority", "varchar(16)", (col) => col.notNull())
      .addColumn("status", "varchar(24)", (col) =>
        col.notNull().defaultTo("WAITING"),
      )
      .addColumn("reason", "text")
      .addColumn("ruleIdentifiersJson", "text", (col) => col.notNull())
      .addColumn("enqueuedAt", "varchar(30)", (col) => col.notNull())
      .addColumn("calledAt", "varchar(30)")
      .addColumn("completedAt", "varchar(30)")
      .addColumn("updatedAt", "varchar(30)", (col) => col.notNull())
      .execute();

    // The queue is read ordered by priority then arrival, so the index mirrors that access pattern.
    await schema
      .createIndex("idx_queue_tenant_status")
      .on("queue_entries")
      .columns(["tenantId", "status", "priority", "enqueuedAt"])
      .execute();
  },
};
