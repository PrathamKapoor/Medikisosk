/**
 * Migration 0011 — FHIR resources, sync outbox and background jobs.
 *
 * Two different queues exist on purpose. `sync_jobs` is the interoperability outbox: clinical data
 * that must reach an external system and must never be lost because an endpoint was down. `jobs` is
 * the internal background queue: OCR, extraction, evaluation runs. Separating them means a backlog in
 * one cannot starve the other, and an operator can reason about "what has not left the building"
 * independently from "what has not finished computing".
 */

import type { Kysely } from "kysely";

export const MIGRATION_0011_INTEROP = {
  id: "0011_interop",
  async up(db: Kysely<unknown>): Promise<void> {
    const schema = db.schema;

    // The exact bundle or resource that was generated, retained so "what did we send" is inspectable.
    await schema
      .createTable("fhir_resources")
      .addColumn("id", "varchar(26)", (col) => col.primaryKey())
      .addColumn("tenantId", "varchar(26)", (col) =>
        col.notNull().references("tenants.id"),
      )
      .addColumn("encounterId", "varchar(26)", (col) =>
        col.notNull().references("encounters.id"),
      )
      .addColumn("resourceType", "varchar(48)", (col) => col.notNull())
      .addColumn("resourceId", "varchar(128)", (col) => col.notNull())
      .addColumn("version", "varchar(24)", (col) => col.notNull())
      .addColumn("payloadJson", "text", (col) => col.notNull())
      .addColumn("createdAt", "varchar(30)", (col) => col.notNull())
      .execute();

    await schema
      .createIndex("idx_fhir_encounter")
      .on("fhir_resources")
      .columns(["tenantId", "encounterId"])
      .execute();

    // Outbound interoperability queue. Written in the same transaction as the clinical change, so a
    // failed transmission is a retained job rather than lost data.
    await schema
      .createTable("sync_jobs")
      .addColumn("id", "varchar(26)", (col) => col.primaryKey())
      .addColumn("tenantId", "varchar(26)", (col) =>
        col.notNull().references("tenants.id"),
      )
      .addColumn("kind", "varchar(32)", (col) => col.notNull())
      .addColumn("encounterId", "varchar(26)")
      .addColumn("payloadRef", "varchar(128)")
      .addColumn("endpoint", "varchar(400)")
      .addColumn("status", "varchar(24)", (col) =>
        col.notNull().defaultTo("PENDING"),
      )
      .addColumn("attempts", "integer", (col) => col.notNull().defaultTo(0))
      .addColumn("maxAttempts", "integer", (col) => col.notNull().defaultTo(8))
      .addColumn("nextAttemptAt", "varchar(30)")
      .addColumn("lastError", "text")
      .addColumn("createdAt", "varchar(30)", (col) => col.notNull())
      .addColumn("updatedAt", "varchar(30)", (col) => col.notNull())
      .addColumn("completedAt", "varchar(30)")
      .execute();

    await schema
      .createIndex("idx_sync_jobs_status")
      .on("sync_jobs")
      .columns(["tenantId", "status", "nextAttemptAt"])
      .execute();

    // Internal background work: OCR, extraction, evaluation runs. Bounded attempts keep one poisoned
    // document from occupying a worker forever.
    await schema
      .createTable("jobs")
      .addColumn("id", "varchar(26)", (col) => col.primaryKey())
      .addColumn("tenantId", "varchar(26)", (col) =>
        col.notNull().references("tenants.id"),
      )
      .addColumn("type", "varchar(40)", (col) => col.notNull())
      .addColumn("encounterId", "varchar(26)")
      .addColumn("documentId", "varchar(26)")
      .addColumn("payloadJson", "text", (col) => col.notNull())
      .addColumn("status", "varchar(24)", (col) =>
        col.notNull().defaultTo("PENDING"),
      )
      .addColumn("attempts", "integer", (col) => col.notNull().defaultTo(0))
      .addColumn("maxAttempts", "integer", (col) => col.notNull().defaultTo(5))
      .addColumn("nextAttemptAt", "varchar(30)")
      .addColumn("lastError", "text")
      .addColumn("createdAt", "varchar(30)", (col) => col.notNull())
      .addColumn("startedAt", "varchar(30)")
      .addColumn("completedAt", "varchar(30)")
      .execute();

    await schema
      .createIndex("idx_jobs_status")
      .on("jobs")
      .columns(["tenantId", "status", "nextAttemptAt"])
      .execute();
  },
};
