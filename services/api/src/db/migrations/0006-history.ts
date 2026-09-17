/**
 * Migration 0006 — structured past history.
 *
 * Past medical, surgical and family history live in one table distinguished by `kind`, because they
 * share a shape and the interview asks them through one pathway. The columns specific to a kind
 * (`relation` for family history, `procedureText` for surgery) are nullable, and that nullability is
 * meaningful: a procedure row with a null `relation` is correct, not incomplete.
 */

import type { Kysely } from "kysely";

export const MIGRATION_0006_HISTORY = {
  id: "0006_history",
  async up(db: Kysely<unknown>): Promise<void> {
    const schema = db.schema;

    await schema
      .createTable("history_entries")
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
      .addColumn("kind", "varchar(24)", (col) => col.notNull())
      .addColumn("conceptCode", "varchar(64)")
      .addColumn("displayName", "varchar(200)", (col) => col.notNull())
      .addColumn("relation", "varchar(24)")
      .addColumn("onsetYear", "integer")
      .addColumn("resolvedYear", "integer")
      .addColumn("active", "integer")
      .addColumn("controlled", "integer")
      .addColumn("procedureText", "varchar(200)")
      .addColumn("performedOn", "varchar(10)")
      .addColumn("facility", "varchar(200)")
      .addColumn("notes", "text")
      .addColumn("originClass", "varchar(24)", (col) => col.notNull())
      .addColumn("confidence", "double precision", (col) => col.notNull())
      .addColumn("verificationState", "varchar(16)", (col) => col.notNull())
      .addColumn("createdAt", "varchar(30)", (col) => col.notNull())
      .execute();

    await schema
      .createIndex("idx_history_patient")
      .on("history_entries")
      .columns(["tenantId", "patientId", "kind"])
      .execute();

    await schema
      .createTable("personal_history")
      .addColumn("tenantId", "varchar(26)", (col) =>
        col.notNull().references("tenants.id"),
      )
      .addColumn("patientId", "varchar(26)", (col) =>
        col.notNull().references("patients.id"),
      )
      .addColumn("encounterId", "varchar(26)", (col) =>
        col.notNull().references("encounters.id"),
      )
      .addColumn("smoking", "varchar(16)", (col) => col.notNull())
      .addColumn("alcohol", "varchar(16)", (col) => col.notNull())
      // Stored separately from smoking on purpose: combining them loses chewing, which is a distinct and
      // common Indian exposure.
      .addColumn("tobaccoChewing", "varchar(16)", (col) => col.notNull())
      .addColumn("dietPattern", "varchar(24)")
      .addColumn("physicalActivity", "varchar(24)")
      .addColumn("saltIntake", "varchar(24)")
      .addColumn("sleepQuality", "varchar(24)")
      .addColumn("occupationalExposure", "varchar(300)")
      .addColumn("recentTravel", "varchar(300)")
      .addColumn("menstrualLastPeriod", "varchar(10)")
      .addColumn("createdAt", "varchar(30)", (col) => col.notNull())
      .addColumn("updatedAt", "varchar(30)", (col) => col.notNull())
      .addPrimaryKeyConstraint("pk_personal_history", [
        "tenantId",
        "encounterId",
      ])
      .execute();
  },
};
