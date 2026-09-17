/**
 * Migration 0005 — allergies and laboratory results.
 *
 * `allergy_status` is deliberately a separate table from `allergy_records`. An empty allergen list is
 * ambiguous — it could mean "no known allergies" or "nobody asked" — and those are different clinical
 * facts. Storing the status separately makes the distinction structural rather than a convention a
 * future code path can quietly break.
 */

import type { Kysely } from 'kysely';

export const MIGRATION_0005_ALLERGY_LABS = {
  id: '0005_allergy_labs',
  async up(db: Kysely<unknown>): Promise<void> {
    const schema = db.schema;

    await schema
      .createTable('allergy_records')
      .addColumn('id', 'varchar(26)', (col) => col.primaryKey())
      .addColumn('tenantId', 'varchar(26)', (col) => col.notNull().references('tenants.id'))
      .addColumn('patientId', 'varchar(26)', (col) => col.notNull().references('patients.id'))
      .addColumn('encounterId', 'varchar(26)', (col) => col.notNull().references('encounters.id'))
      .addColumn('conceptCode', 'varchar(64)')
      .addColumn('freeTextName', 'varchar(200)')
      .addColumn('category', 'varchar(16)')
      .addColumn('reactionText', 'text')
      .addColumn('severity', 'varchar(16)', (col) => col.notNull().defaultTo('UNKNOWN'))
      .addColumn('onsetDate', 'varchar(10)')
      .addColumn('originClass', 'varchar(24)', (col) => col.notNull())
      .addColumn('confidence', 'double precision', (col) => col.notNull())
      .addColumn('verificationState', 'varchar(16)', (col) => col.notNull())
      .addColumn('verifiedAt', 'varchar(30)')
      .addColumn('verifiedBy', 'varchar(26)')
      .addColumn('createdAt', 'varchar(30)', (col) => col.notNull())
      .execute();

    await schema
      .createIndex('idx_allergies_patient')
      .on('allergy_records')
      .columns(['tenantId', 'patientId'])
      .execute();

    await schema
      .createTable('allergy_status')
      .addColumn('tenantId', 'varchar(26)', (col) => col.notNull().references('tenants.id'))
      .addColumn('patientId', 'varchar(26)', (col) => col.notNull().references('patients.id'))
      .addColumn('status', 'varchar(32)', (col) => col.notNull())
      .addColumn('recordedAt', 'varchar(30)', (col) => col.notNull())
      .addColumn('recordedBy', 'varchar(26)')
      .addPrimaryKeyConstraint('pk_allergy_status', ['tenantId', 'patientId'])
      .execute();

    await schema
      .createTable('lab_results')
      .addColumn('id', 'varchar(26)', (col) => col.primaryKey())
      .addColumn('tenantId', 'varchar(26)', (col) => col.notNull().references('tenants.id'))
      .addColumn('patientId', 'varchar(26)', (col) => col.notNull().references('patients.id'))
      .addColumn('encounterId', 'varchar(26)', (col) => col.notNull().references('encounters.id'))
      .addColumn('testCode', 'varchar(64)', (col) => col.notNull())
      .addColumn('value', 'double precision', (col) => col.notNull())
      .addColumn('unit', 'varchar(24)', (col) => col.notNull())
      .addColumn('referenceLow', 'double precision')
      .addColumn('referenceHigh', 'double precision')
      // Whether the range came from the report, the facility, or a MediKiosk default. A flag whose
      // provenance is unknown is a flag a clinician cannot calibrate their trust against.
      .addColumn('referenceSource', 'varchar(24)', (col) => col.notNull())
      .addColumn('flag', 'varchar(16)', (col) => col.notNull())
      .addColumn('implausible', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('collectedAt', 'varchar(30)', (col) => col.notNull())
      .addColumn('reportedAt', 'varchar(30)', (col) => col.notNull())
      .addColumn('documentId', 'varchar(26)')
      .addColumn('sourceComment', 'text')
      .addColumn('originClass', 'varchar(24)', (col) => col.notNull())
      .addColumn('confidence', 'double precision', (col) => col.notNull())
      .addColumn('verificationState', 'varchar(16)', (col) => col.notNull())
      .addColumn('verifiedAt', 'varchar(30)')
      .addColumn('verifiedBy', 'varchar(26)')
      .addColumn('createdAt', 'varchar(30)', (col) => col.notNull())
      .execute();

    // Trends read every result for one test over time, so the index matches that access pattern.
    await schema
      .createIndex('idx_labs_patient_test')
      .on('lab_results')
      .columns(['tenantId', 'patientId', 'testCode', 'collectedAt'])
      .execute();
  },
};