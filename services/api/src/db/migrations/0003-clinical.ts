/**
 * Migration 0003 — encounters and interview responses.
 *
 * Records what was asked and what was answered, separately from what was concluded. That separation is
 * what lets the evidence trace answer "what did the patient actually say?" without reconstructing it
 * from derived facts.
 */

import type { Kysely } from 'kysely';

export const MIGRATION_0003_CLINICAL = {
  id: '0003_clinical',
  async up(db: Kysely<unknown>): Promise<void> {
    const schema = db.schema;

    await schema
      .createTable('encounters')
      .addColumn('id', 'varchar(26)', (col) => col.primaryKey())
      .addColumn('tenantId', 'varchar(26)', (col) => col.notNull().references('tenants.id'))
      .addColumn('patientId', 'varchar(26)', (col) => col.notNull().references('patients.id'))
      .addColumn('sessionId', 'varchar(26)')
      .addColumn('encounterType', 'varchar(24)', (col) => col.notNull().defaultTo('OPD'))
      .addColumn('status', 'varchar(24)', (col) => col.notNull().defaultTo('IN_PROGRESS'))
      .addColumn('chiefComplaintCodesJson', 'text', (col) => col.notNull())
      .addColumn('chiefComplaintVerbatim', 'text')
      .addColumn('locale', 'varchar(16)', (col) => col.notNull())
      .addColumn('ayushMode', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('questionnaireVersion', 'varchar(24)', (col) => col.notNull())
      .addColumn('pathwayVersion', 'varchar(24)', (col) => col.notNull())
      .addColumn('activePathwaysJson', 'text', (col) => col.notNull())
      .addColumn('submittedAt', 'varchar(30)')
      .addColumn('createdAt', 'varchar(30)', (col) => col.notNull())
      .addColumn('updatedAt', 'varchar(30)', (col) => col.notNull())
      .addColumn('deletedAt', 'varchar(30)')
      .execute();

    await schema
      .createIndex('idx_encounters_patient')
      .on('encounters')
      .columns(['tenantId', 'patientId', 'createdAt'])
      .execute();

    await schema
      .createTable('questionnaire_responses')
      .addColumn('id', 'varchar(26)', (col) => col.primaryKey())
      .addColumn('tenantId', 'varchar(26)', (col) => col.notNull().references('tenants.id'))
      .addColumn('encounterId', 'varchar(26)', (col) => col.notNull().references('encounters.id'))
      .addColumn('questionKey', 'varchar(120)', (col) => col.notNull())
      .addColumn('pathwayKey', 'varchar(64)', (col) => col.notNull())
      .addColumn('kind', 'varchar(24)', (col) => col.notNull())
      .addColumn('category', 'varchar(32)', (col) => col.notNull())
      .addColumn('state', 'varchar(24)', (col) => col.notNull())
      .addColumn('modality', 'varchar(24)', (col) => col.notNull())
      .addColumn('rawAnswer', 'text')
      .addColumn('normalisedJson', 'text')
      .addColumn('confidence', 'double precision')
      .addColumn('language', 'varchar(16)')
      .addColumn('codeMixed', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('negated', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('uncertain', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('askCount', 'integer', (col) => col.notNull().defaultTo(1))
      .addColumn('answeredAt', 'varchar(30)')
      .addColumn('createdAt', 'varchar(30)', (col) => col.notNull())
      .execute();

    await schema
      .createIndex('idx_responses_encounter')
      .on('questionnaire_responses')
      .columns(['tenantId', 'encounterId'])
      .execute();
  },
};