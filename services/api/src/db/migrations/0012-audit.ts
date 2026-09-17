/**
 * Migration 0012 — audit, analytics and idempotency.
 *
 * `audit_events` is append-only by policy: there is no update and no delete path in the repository
 * layer, because an audit trail that can be edited is not an audit trail. Audit rows carry codes, keys
 * and counts — never free text, names, identifiers or clinical statements — so the trail that an
 * operator reads to investigate an incident cannot itself leak PHI.
 *
 * `idempotency_keys` make every mutating endpoint safe to retry. A replayed request returns the stored
 * response; a key reused with different content is rejected. Records are retained 24 hours, then swept.
 */

import type { Kysely } from "kysely";

export const MIGRATION_0012_AUDIT = {
  id: "0012_audit",
  async up(db: Kysely<unknown>): Promise<void> {
    const schema = db.schema;

    await schema
      .createTable("audit_events")
      .addColumn("id", "varchar(26)", (col) => col.primaryKey())
      .addColumn("tenantId", "varchar(26)", (col) =>
        col.notNull().references("tenants.id"),
      )
      .addColumn("actorId", "varchar(26)")
      .addColumn("actorKind", "varchar(16)", (col) => col.notNull())
      .addColumn("action", "varchar(40)", (col) => col.notNull())
      .addColumn("resourceType", "varchar(40)")
      .addColumn("resourceId", "varchar(26)")
      .addColumn("encounterId", "varchar(26)")
      .addColumn("requestId", "varchar(64)")
      .addColumn("result", "varchar(16)", (col) => col.notNull())
      .addColumn("detailJson", "text")
      .addColumn("createdAt", "varchar(30)", (col) => col.notNull())
      .execute();

    // Incident review reads "everything this actor did in this window", so the index matches.
    await schema
      .createIndex("idx_audit_actor_time")
      .on("audit_events")
      .columns(["tenantId", "actorId", "createdAt"])
      .execute();
    await schema
      .createIndex("idx_audit_action_time")
      .on("audit_events")
      .columns(["tenantId", "action", "createdAt"])
      .execute();

    await schema
      .createTable("analytics_events")
      .addColumn("id", "varchar(26)", (col) => col.primaryKey())
      .addColumn("tenantId", "varchar(26)", (col) =>
        col.notNull().references("tenants.id"),
      )
      .addColumn("kind", "varchar(40)", (col) => col.notNull())
      .addColumn("encounterId", "varchar(26)")
      .addColumn("sessionId", "varchar(26)")
      .addColumn("valueJson", "text", (col) => col.notNull())
      .addColumn("createdAt", "varchar(30)", (col) => col.notNull())
      .execute();

    await schema
      .createIndex("idx_analytics_kind_time")
      .on("analytics_events")
      .columns(["tenantId", "kind", "createdAt"])
      .execute();

    await schema
      .createTable("idempotency_keys")
      .addColumn("key", "varchar(64)", (col) => col.primaryKey())
      .addColumn("tenantId", "varchar(26)", (col) =>
        col.notNull().references("tenants.id"),
      )
      .addColumn("route", "varchar(120)", (col) => col.notNull())
      .addColumn("requestHash", "varchar(128)", (col) => col.notNull())
      .addColumn("statusCode", "integer", (col) => col.notNull())
      .addColumn("responseJson", "text", (col) => col.notNull())
      .addColumn("createdAt", "varchar(30)", (col) => col.notNull())
      .addColumn("expiresAt", "varchar(30)", (col) => col.notNull())
      .execute();
  },
};
