/**
 * Migration 0010 — summaries, contradictions and the AYUSH assessment.
 *
 * `summary_sections.originalAiText` retains the model's original wording while `text` holds what the
 * clinician accepted or edited. Both are kept because the difference between them is the measurement
 * the product is judged on: how much a physician had to change, and in which sections. Overwriting the
 * original would destroy that evidence permanently.
 */

import type { Kysely } from 'kysely';

export const MIGRATION_0010_SUMMARY = {
  id: '0010_summary',
  async up(db: Kysely<unknown>): Promise<void> {
    const schema = db.schema;

    await schema
      .createTable('summaries')
      .addColumn('id', 'varchar(26)', (col) => col.primaryKey())
      .addColumn('tenantId', 'varchar(26)', (col) => col.notNull().references('tenants.id'))
      .addColumn('encounterId', 'varchar(26)', (col) => col.notNull().references('encounters.id'))
      .addColumn('providerJson', 'text', (col) => col.notNull())
      // Reported rather than hidden: how many sections the synthesiser could not ground in evidence.
      .addColumn('ungroundedClaimCount', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('verified', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('verifiedBy', 'varchar(26)')
      .addColumn('verifiedAt', 'varchar(30)')
      .addColumn('attestation', 'text')
      .addColumn('createdAt', 'varchar(30)', (col) => col.notNull())
      .execute();

    await schema
      .createIndex('idx_summaries_encounter')
      .on('summaries')
      .columns(['tenantId', 'encounterId'])
      .execute();

    await schema
      .createTable('summary_sections')
      .addColumn('id', 'varchar(26)', (col) => col.primaryKey())
      .addColumn('summaryId', 'varchar(26)', (col) => col.notNull().references('summaries.id'))
      .addColumn('sectionKey', 'varchar(48)', (col) => col.notNull())
      .addColumn('text', 'text', (col) => col.notNull())
      .addColumn('kind', 'varchar(24)', (col) => col.notNull())
      .addColumn('evidenceIdsJson', 'text', (col) => col.notNull())
      .addColumn('verificationState', 'varchar(16)', (col) => col.notNull())
      .addColumn('originalAiText', 'text')
      .addColumn('editedBy', 'varchar(26)')
      .addColumn('editedAt', 'varchar(30)')
      .execute();

    await schema
      .createIndex('idx_summary_sections')
      .on('summary_sections')
      .columns(['summaryId', 'sectionKey'])
      .execute();

    await schema
      .createTable('contradictions')
      .addColumn('id', 'varchar(26)', (col) => col.primaryKey())
      .addColumn('tenantId', 'varchar(26)', (col) => col.notNull().references('tenants.id'))
      .addColumn('encounterId', 'varchar(26)', (col) => col.notNull().references('encounters.id'))
      .addColumn('kind', 'varchar(40)', (col) => col.notNull())
      .addColumn('severity', 'varchar(16)', (col) => col.notNull())
      .addColumn('statementAJson', 'text', (col) => col.notNull())
      .addColumn('statementBJson', 'text', (col) => col.notNull())
      .addColumn('suggestion', 'text')
      .addColumn('resolutionState', 'varchar(16)', (col) => col.notNull().defaultTo('OPEN'))
      .addColumn('resolution', 'varchar(24)')
      .addColumn('resolutionNote', 'text')
      .addColumn('resolvedBy', 'varchar(26)')
      .addColumn('resolvedAt', 'varchar(30)')
      .addColumn('createdAt', 'varchar(30)', (col) => col.notNull())
      .execute();

    await schema
      .createIndex('idx_contradictions_encounter')
      .on('contradictions')
      .columns(['tenantId', 'encounterId', 'resolutionState'])
      .execute();

    await schema
      .createTable('ayush_assessments')
      .addColumn('tenantId', 'varchar(26)', (col) => col.notNull().references('tenants.id'))
      .addColumn('encounterId', 'varchar(26)', (col) => col.notNull().references('encounters.id'))
      .addColumn('itemsJson', 'text', (col) => col.notNull())
      .addColumn('createdAt', 'varchar(30)', (col) => col.notNull())
      .addColumn('updatedAt', 'varchar(30)', (col) => col.notNull())
      .addPrimaryKeyConstraint('pk_ayush', ['tenantId', 'encounterId'])
      .execute();
  },
};