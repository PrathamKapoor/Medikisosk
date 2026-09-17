/**
 * Migration 0013 — diagnoses, procedures, timeline, evaluation runs and configuration history.
 *
 * `tenant_config_history` records every change to tenant settings alongside who made it and why. A
 * hospital tuning its triage thresholds must be able to see what changed and when, because a threshold
 * changed silently is an incident waiting to happen.
 *
 * `evaluation_runs` pins the exact versions — software commit, providers, rule set, prompts — that
 * produced a result. Without those pins a benchmark number is unrepeatable and therefore meaningless.
 */

import type { Kysely } from 'kysely';

export const MIGRATION_0013_ADMIN = {
  id: '0013_admin',
  async up(db: Kysely<unknown>): Promise<void> {
    const schema = db.schema;

    await schema
      .createTable('diagnoses')
      .addColumn('id', 'varchar(26)', (col) => col.primaryKey())
      .addColumn('tenantId', 'varchar(26)', (col) => col.notNull().references('tenants.id'))
      .addColumn('patientId', 'varchar(26)', (col) => col.notNull().references('patients.id'))
      .addColumn('encounterId', 'varchar(26)', (col) => col.notNull().references('encounters.id'))
      .addColumn('conceptCode', 'varchar(64)')
      .addColumn('displayText', 'varchar(200)', (col) => col.notNull())
      .addColumn('icd10Code', 'varchar(16)')
      .addColumn('status', 'varchar(24)', (col) => col.notNull())
      .addColumn('recordedAt', 'varchar(30)', (col) => col.notNull())
      .addColumn('recordedBy', 'varchar(26)')
      .addColumn('originClass', 'varchar(24)', (col) => col.notNull())
      .addColumn('confidence', 'double precision', (col) => col.notNull())
      .addColumn('verificationState', 'varchar(16)', (col) => col.notNull())
      .addColumn('createdAt', 'varchar(30)', (col) => col.notNull())
      .execute();

    await schema
      .createTable('procedures')
      .addColumn('id', 'varchar(26)', (col) => col.primaryKey())
      .addColumn('tenantId', 'varchar(26)', (col) => col.notNull().references('tenants.id'))
      .addColumn('patientId', 'varchar(26)', (col) => col.notNull().references('patients.id'))
      .addColumn('encounterId', 'varchar(26)', (col) => col.notNull().references('encounters.id'))
      .addColumn('conceptCode', 'varchar(64)')
      .addColumn('displayText', 'varchar(200)', (col) => col.notNull())
      .addColumn('performedOn', 'varchar(10)')
      .addColumn('facility', 'varchar(200)')
      .addColumn('originClass', 'varchar(24)', (col) => col.notNull())
      .addColumn('confidence', 'double precision', (col) => col.notNull())
      .addColumn('verificationState', 'varchar(16)', (col) => col.notNull())
      .addColumn('createdAt', 'varchar(30)', (col) => col.notNull())
      .execute();

    await schema
      .createTable('timeline_events')
      .addColumn('id', 'varchar(26)', (col) => col.primaryKey())
      .addColumn('tenantId', 'varchar(26)', (col) => col.notNull().references('tenants.id'))
      .addColumn('patientId', 'varchar(26)', (col) => col.notNull().references('patients.id'))
      .addColumn('encounterId', 'varchar(26)', (col) => col.notNull().references('encounters.id'))
      .addColumn('eventType', 'varchar(32)', (col) => col.notNull())
      .addColumn('eventAt', 'varchar(30)', (col) => col.notNull())
      .addColumn('headline', 'varchar(300)', (col) => col.notNull())
      .addColumn('detailJson', 'text', (col) => col.notNull())
      .addColumn('evidenceIdsJson', 'text', (col) => col.notNull())
      .addColumn('createdAt', 'varchar(30)', (col) => col.notNull())
      .execute();

    await schema
      .createIndex('idx_timeline_patient')
      .on('timeline_events')
      .columns(['tenantId', 'patientId', 'eventAt'])
      .execute();

    await schema
      .createTable('evaluation_runs')
      .addColumn('id', 'varchar(26)', (col) => col.primaryKey())
      .addColumn('tenantId', 'varchar(26)', (col) => col.notNull().references('tenants.id'))
      .addColumn('datasetVersion', 'varchar(24)', (col) => col.notNull())
      .addColumn('softwareCommit', 'varchar(64)', (col) => col.notNull())
      .addColumn('providerVersionsJson', 'text', (col) => col.notNull())
      .addColumn('ruleSetVersion', 'varchar(24)', (col) => col.notNull())
      .addColumn('promptVersionsJson', 'text', (col) => col.notNull())
      .addColumn('status', 'varchar(24)', (col) => col.notNull())
      .addColumn('resultJson', 'text')
      .addColumn('requestedBy', 'varchar(26)')
      .addColumn('createdAt', 'varchar(30)', (col) => col.notNull())
      .addColumn('completedAt', 'varchar(30)')
      .execute();

    await schema
      .createTable('tenant_config_history')
      .addColumn('id', 'varchar(26)', (col) => col.primaryKey())
      .addColumn('tenantId', 'varchar(26)', (col) => col.notNull().references('tenants.id'))
      .addColumn('changedBy', 'varchar(26)', (col) => col.notNull())
      .addColumn('section', 'varchar(64)', (col) => col.notNull())
      .addColumn('beforeJson', 'text')
      .addColumn('afterJson', 'text', (col) => col.notNull())
      .addColumn('reason', 'text')
      .addColumn('createdAt', 'varchar(30)', (col) => col.notNull())
      .execute();

    await schema
      .createIndex('idx_config_history_tenant')
      .on('tenant_config_history')
      .columns(['tenantId', 'createdAt'])
      .execute();
  },
};