/**
 * Migration 0002 — external identifiers, identity challenges, consent versions and consent records.
 *
 * Two properties in this migration carry privacy weight:
 *
 * 1. `external_identifiers.valueHash` stores a keyed hash, never the raw ABHA number, and
 *    `valueMasked` stores the display form `XX-XXXX-XXXX-1234`. A database theft therefore does not
 *    yield identifiers.
 * 2. `identity_challenges.otpHash` stores a hash of the one-time code, never the code. An operator
 *    reading the table cannot complete a patient's authentication.
 */

import type { Kysely } from "kysely";

export const MIGRATION_0002_IDENTITY_ACCESS = {
  id: "0002_identity_access",
  async up(db: Kysely<unknown>): Promise<void> {
    const schema = db.schema;

    await schema
      .createTable("external_identifiers")
      .addColumn("id", "varchar(26)", (col) => col.primaryKey())
      .addColumn("tenantId", "varchar(26)", (col) =>
        col.notNull().references("tenants.id"),
      )
      .addColumn("patientId", "varchar(26)", (col) =>
        col.notNull().references("patients.id"),
      )
      .addColumn("kind", "varchar(32)", (col) => col.notNull())
      .addColumn("valueHash", "varchar(200)", (col) => col.notNull())
      .addColumn("valueMasked", "varchar(64)", (col) => col.notNull())
      .addColumn("verified", "integer", (col) => col.notNull().defaultTo(0))
      .addColumn("verifiedAt", "varchar(30)")
      .addColumn("createdAt", "varchar(30)", (col) => col.notNull())
      .execute();

    await schema
      .createIndex("idx_external_ids_hash")
      .on("external_identifiers")
      .columns(["tenantId", "kind", "valueHash"])
      .execute();

    await schema
      .createTable("identity_challenges")
      .addColumn("id", "varchar(26)", (col) => col.primaryKey())
      .addColumn("tenantId", "varchar(26)", (col) =>
        col.notNull().references("tenants.id"),
      )
      .addColumn("sessionId", "varchar(26)", (col) =>
        col.notNull().references("sessions.id"),
      )
      .addColumn("method", "varchar(32)", (col) => col.notNull())
      .addColumn("providerName", "varchar(32)", (col) => col.notNull())
      .addColumn("otpHash", "varchar(200)")
      .addColumn("attempts", "integer", (col) => col.notNull().defaultTo(0))
      .addColumn("expiresAt", "varchar(30)", (col) => col.notNull())
      .addColumn("consumedAt", "varchar(30)")
      .addColumn("createdAt", "varchar(30)", (col) => col.notNull())
      .execute();

    // Consent wording is versioned. Changing a data category or a statement produces a new version and
    // never retroactively alters the wording a patient already agreed to.
    await schema
      .createTable("consent_versions")
      .addColumn("version", "varchar(24)", (col) => col.notNull())
      .addColumn("locale", "varchar(16)", (col) => col.notNull())
      .addColumn("purposesJson", "text", (col) => col.notNull())
      .addColumn("publishedAt", "varchar(30)", (col) => col.notNull())
      .addColumn("retiredAt", "varchar(30)")
      .addPrimaryKeyConstraint("pk_consent_versions", ["version", "locale"])
      .execute();

    await schema
      .createTable("consents")
      .addColumn("id", "varchar(26)", (col) => col.primaryKey())
      .addColumn("tenantId", "varchar(26)", (col) =>
        col.notNull().references("tenants.id"),
      )
      .addColumn("patientId", "varchar(26)", (col) =>
        col.notNull().references("patients.id"),
      )
      .addColumn("sessionId", "varchar(26)")
      .addColumn("consentVersion", "varchar(24)", (col) => col.notNull())
      .addColumn("locale", "varchar(16)", (col) => col.notNull())
      .addColumn("method", "varchar(32)", (col) => col.notNull())
      .addColumn("purposesJson", "text", (col) => col.notNull())
      .addColumn("grantedAt", "varchar(30)", (col) => col.notNull())
      .addColumn("expiresAt", "varchar(30)", (col) => col.notNull())
      .addColumn("revokedAt", "varchar(30)")
      .addColumn("revokeReason", "varchar(64)")
      .addColumn("createdAt", "varchar(30)", (col) => col.notNull())
      .execute();

    await schema
      .createIndex("idx_consents_patient")
      .on("consents")
      .columns(["tenantId", "patientId"])
      .execute();
  },
};
