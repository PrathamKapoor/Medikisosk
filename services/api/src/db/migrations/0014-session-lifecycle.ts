import type { Kysely } from "kysely";
import {
  CONSENT_LOCALES,
  CONSENT_VERSION,
  consentPurposes,
} from "../../consent/versions";
import type { Database } from "../schema";

export const MIGRATION_0014_SESSION_LIFECYCLE = {
  id: "0014_session_lifecycle",
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .alterTable("idempotency_keys")
      .addColumn("sessionId", "varchar(26)")
      .execute();
    await db.schema
      .createIndex("idx_replay_session")
      .on("idempotency_keys")
      .columns(["tenantId", "sessionId"])
      .execute();
    await db.schema
      .createIndex("idx_sessions_expiry")
      .on("sessions")
      .columns(["status", "expiresAt"])
      .execute();
    // Publish new wording; never rewrite the historical 1.0.0 documents.
    for (const locale of CONSENT_LOCALES) {
      await (db as Kysely<Database>)
        .insertInto("consent_versions")
        .values({
          version: CONSENT_VERSION,
          locale,
          purposesJson: JSON.stringify(consentPurposes(locale)),
          publishedAt: "2026-09-17T00:00:00.000Z",
          retiredAt: null,
        })
        .execute();
    }
  },
};
