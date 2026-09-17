/**
 * Migration 0004 — clinical fact tables.
 *
 * Each fact table repeats the provenance columns (`originClass`, `confidence`, `verificationState`)
 * rather than sharing a parent table. That repetition is deliberate: a clinician reading a symptom must
 * be able to see where it came from without a join, and a schema in which provenance is optional by
 * construction is a schema that will eventually store an unprovenanced fact.
 */

import type { Kysely } from "kysely";

export const MIGRATION_0004_CLINICAL_FACTS = {
  id: "0004_clinical_facts",
  async up(db: Kysely<unknown>): Promise<void> {
    const schema = db.schema;

    await schema
      .createTable("symptoms")
      .addColumn("id", "varchar(26)", (col) => col.primaryKey())
      .addColumn("tenantId", "varchar(26)", (col) =>
        col.notNull().references("tenants.id"),
      )
      .addColumn("patientId", "varchar(26)", (col) =>
        col.notNull().references("patients.id"),
      )
      .addColumn("encounterId", "varchar(26)", (col) =>
        col.notNull().references("encounters.id"),
      )
      .addColumn("conceptCode", "varchar(64)", (col) => col.notNull())
      .addColumn("displayName", "varchar(200)", (col) => col.notNull())
      .addColumn("patientText", "text")
      .addColumn("onsetDate", "varchar(10)")
      .addColumn("durationValue", "double precision")
      .addColumn("durationUnit", "varchar(16)")
      .addColumn("durationVerbatim", "varchar(200)")
      .addColumn("durationApproximate", "integer", (col) =>
        col.notNull().defaultTo(0),
      )
      .addColumn("severity", "varchar(16)")
      .addColumn("severityVerbatim", "varchar(200)")
      .addColumn("certainty", "varchar(16)", (col) => col.notNull())
      .addColumn("socratesJson", "text", (col) => col.notNull())
      .addColumn("originClass", "varchar(24)", (col) => col.notNull())
      .addColumn("confidence", "double precision", (col) => col.notNull())
      .addColumn("verificationState", "varchar(16)", (col) => col.notNull())
      .addColumn("verifiedAt", "varchar(30)")
      .addColumn("verifiedBy", "varchar(26)")
      .addColumn("createdAt", "varchar(30)", (col) => col.notNull())
      .addColumn("updatedAt", "varchar(30)", (col) => col.notNull())
      .execute();

    await schema
      .createIndex("idx_symptoms_encounter")
      .on("symptoms")
      .columns(["tenantId", "encounterId"])
      .execute();

    await schema
      .createTable("medications")
      .addColumn("id", "varchar(26)", (col) => col.primaryKey())
      .addColumn("tenantId", "varchar(26)", (col) =>
        col.notNull().references("tenants.id"),
      )
      .addColumn("patientId", "varchar(26)", (col) =>
        col.notNull().references("patients.id"),
      )
      .addColumn("encounterId", "varchar(26)", (col) =>
        col.notNull().references("encounters.id"),
      )
      .addColumn("conceptCode", "varchar(64)", (col) => col.notNull())
      .addColumn("asWrittenName", "varchar(200)", (col) => col.notNull())
      .addColumn("strengthValue", "double precision")
      .addColumn("strengthUnit", "varchar(16)")
      .addColumn("doseValue", "double precision")
      .addColumn("doseUnit", "varchar(16)")
      .addColumn("frequency", "varchar(16)", (col) =>
        col.notNull().defaultTo("UNKNOWN"),
      )
      .addColumn("route", "varchar(24)", (col) =>
        col.notNull().defaultTo("UNKNOWN"),
      )
      .addColumn("durationDays", "integer")
      .addColumn("status", "varchar(16)", (col) =>
        col.notNull().defaultTo("CURRENT"),
      )
      .addColumn("startedOn", "varchar(10)")
      .addColumn("stoppedOn", "varchar(10)")
      .addColumn("isPrescribed", "integer", (col) => col.notNull().defaultTo(0))
      .addColumn("documentId", "varchar(26)")
      .addColumn("originClass", "varchar(24)", (col) => col.notNull())
      .addColumn("confidence", "double precision", (col) => col.notNull())
      .addColumn("verificationState", "varchar(16)", (col) => col.notNull())
      .addColumn("verifiedAt", "varchar(30)")
      .addColumn("verifiedBy", "varchar(26)")
      .addColumn("createdAt", "varchar(30)", (col) => col.notNull())
      .addColumn("updatedAt", "varchar(30)", (col) => col.notNull())
      .execute();

    // Reconciliation reads the current medication list for a patient, so this index matches that query.
    await schema
      .createIndex("idx_medications_patient")
      .on("medications")
      .columns(["tenantId", "patientId", "status"])
      .execute();

    await schema
      .createTable("vitals")
      .addColumn("id", "varchar(26)", (col) => col.primaryKey())
      .addColumn("tenantId", "varchar(26)", (col) =>
        col.notNull().references("tenants.id"),
      )
      .addColumn("patientId", "varchar(26)", (col) =>
        col.notNull().references("patients.id"),
      )
      .addColumn("encounterId", "varchar(26)", (col) =>
        col.notNull().references("encounters.id"),
      )
      .addColumn("conceptCode", "varchar(64)", (col) => col.notNull())
      .addColumn("componentCode", "varchar(16)")
      .addColumn("value", "double precision", (col) => col.notNull())
      .addColumn("unit", "varchar(24)", (col) => col.notNull())
      .addColumn("measuredAt", "varchar(30)", (col) => col.notNull())
      .addColumn("source", "varchar(24)", (col) => col.notNull())
      .addColumn("deviceId", "varchar(64)")
      .addColumn("implausible", "integer", (col) => col.notNull().defaultTo(0))
      .addColumn("originClass", "varchar(24)", (col) => col.notNull())
      .addColumn("confidence", "double precision", (col) => col.notNull())
      .addColumn("verificationState", "varchar(16)", (col) => col.notNull())
      .addColumn("verifiedAt", "varchar(30)")
      .addColumn("verifiedBy", "varchar(26)")
      .addColumn("createdAt", "varchar(30)", (col) => col.notNull())
      .execute();

    await schema
      .createIndex("idx_vitals_encounter")
      .on("vitals")
      .columns(["tenantId", "encounterId", "conceptCode"])
      .execute();
  },
};
