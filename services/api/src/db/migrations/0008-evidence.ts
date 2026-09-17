/**
 * Migration 0008 — evidence and clinical claims.
 *
 * `evidence` is append-only and immutable: a correction is a new row that supersedes the old one via
 * `supersededBy`, never an update. That is what makes the evidence trace trustworthy — a physician
 * inspecting what a claim rested on must see what was actually captured at the time, not a value that
 * was quietly edited afterwards.
 *
 * `clinical_claims` references evidence by id. A claim with no supporting evidence is rejected at
 * construction in the domain layer; this table simply has nowhere to record one, so the rule cannot be
 * bypassed by writing directly to the database.
 */

import type { Kysely } from 'kysely';

export const MIGRATION_0008_EVIDENCE = {
  id: '0008_evidence',
  async up(db: Kysely<unknown>): Promise<void> {
    const schema = db.schema;

    await schema
      .createTable('evidence')
      .addColumn('id', 'varchar(26)', (col) => col.primaryKey())
      .addColumn('tenantId', 'varchar(26)', (col) => col.notNull().references('tenants.id'))
      .addColumn('encounterId', 'varchar(26)', (col) => col.notNull().references('encounters.id'))
      .addColumn('type', 'varchar(32)', (col) => col.notNull())
      .addColumn('originClass', 'varchar(24)', (col) => col.notNull())
      .addColumn('source', 'varchar(40)', (col) => col.notNull())
      .addColumn('sourceRef', 'varchar(120)')
      // Immutable. Corrections create a new row; they never overwrite this one.
      .addColumn('rawValue', 'text')
      .addColumn('normalisedJson', 'text')
      .addColumn('confidence', 'double precision', (col) => col.notNull())
      .addColumn('language', 'varchar(16)')
      .addColumn('capturedAt', 'varchar(30)', (col) => col.notNull())
      .addColumn('createdBy', 'varchar(26)')
      .addColumn('verificationState', 'varchar(16)', (col) => col.notNull())
      .addColumn('verifiedAt', 'varchar(30)')
      .addColumn('verifiedBy', 'varchar(26)')
      .addColumn('supersededBy', 'varchar(26)')
      .execute();

    await schema
      .createIndex('idx_evidence_encounter')
      .on('evidence')
      .columns(['tenantId', 'encounterId'])
      .execute();

    // The evidence trace looks rows up by the question key or document they came from.
    await schema
      .createIndex('idx_evidence_source_ref')
      .on('evidence')
      .columns(['tenantId', 'sourceRef'])
      .execute();

    await schema
      .createTable('clinical_claims')
      .addColumn('id', 'varchar(26)', (col) => col.primaryKey())
      .addColumn('tenantId', 'varchar(26)', (col) => col.notNull().references('tenants.id'))
      .addColumn('encounterId', 'varchar(26)', (col) => col.notNull().references('encounters.id'))
      .addColumn('kind', 'varchar(32)', (col) => col.notNull())
      .addColumn('statement', 'text', (col) => col.notNull())
      .addColumn('subjectRef', 'varchar(64)')
      .addColumn('evidenceIdsJson', 'text', (col) => col.notNull())
      .addColumn('originClass', 'varchar(24)', (col) => col.notNull())
      .addColumn('confidence', 'double precision', (col) => col.notNull())
      .addColumn('verificationState', 'varchar(16)', (col) => col.notNull())
      // Provider, model and prompt version that produced the claim, when machine-generated.
      .addColumn('generatedByJson', 'text')
      .addColumn('createdAt', 'varchar(30)', (col) => col.notNull())
      .execute();

    await schema
      .createIndex('idx_claims_encounter')
      .on('clinical_claims')
      .columns(['tenantId', 'encounterId'])
      .execute();
  },
};