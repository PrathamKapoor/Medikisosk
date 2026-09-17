/**
 * Migration 0001 — tenants, staff users, kiosks, patients and sessions.
 *
 * Column types are the intersection both engines support (see `db/migrate.ts`). Identifiers are
 * 26-character ULIDs stored as `varchar(26)`; timestamps are ISO-8601 UTC text stored as
 * `varchar(30)`, so ordering and comparison behave identically on SQLite and Postgres and no
 * engine-local time function is involved.
 *
 * Every clinical table carries `tenantId` and is indexed on it. Cross-tenant isolation is enforced in
 * the repository layer; these indexes make that enforcement cheap rather than merely correct.
 */

import type { Kysely } from 'kysely';

export const MIGRATION_0001_IDENTITY = {
  id: '0001_identity',
  async up(db: Kysely<unknown>): Promise<void> {
    const schema = db.schema;

    await schema
      .createTable('tenants')
      .addColumn('id', 'varchar(26)', (col) => col.primaryKey())
      .addColumn('slug', 'varchar(64)', (col) => col.notNull().unique())
      .addColumn('name', 'varchar(200)', (col) => col.notNull())
      .addColumn('brandingJson', 'text', (col) => col.notNull())
      .addColumn('localesJson', 'text', (col) => col.notNull())
      .addColumn('settingsJson', 'text', (col) => col.notNull())
      .addColumn('createdAt', 'varchar(30)', (col) => col.notNull())
      .addColumn('updatedAt', 'varchar(30)', (col) => col.notNull())
      .addColumn('deletedAt', 'varchar(30)')
      .execute();

    await schema
      .createTable('users')
      .addColumn('id', 'varchar(26)', (col) => col.primaryKey())
      .addColumn('tenantId', 'varchar(26)', (col) => col.notNull().references('tenants.id'))
      .addColumn('username', 'varchar(64)', (col) => col.notNull())
      .addColumn('displayName', 'varchar(200)', (col) => col.notNull())
      .addColumn('passwordHash', 'varchar(200)', (col) => col.notNull())
      .addColumn('rolesJson', 'text', (col) => col.notNull())
      .addColumn('active', 'integer', (col) => col.notNull().defaultTo(1))
      .addColumn('lastLoginAt', 'varchar(30)')
      .addColumn('createdAt', 'varchar(30)', (col) => col.notNull())
      .addColumn('updatedAt', 'varchar(30)', (col) => col.notNull())
      .execute();

    // Usernames are unique per tenant, not globally: two hospitals may each employ a "dr.rao".
    await schema
      .createIndex('idx_users_tenant_username')
      .on('users')
      .columns(['tenantId', 'username'])
      .unique()
      .execute();

    await schema
      .createTable('kiosks')
      .addColumn('id', 'varchar(26)', (col) => col.primaryKey())
      .addColumn('tenantId', 'varchar(26)', (col) => col.notNull().references('tenants.id'))
      .addColumn('name', 'varchar(200)', (col) => col.notNull())
      .addColumn('location', 'varchar(200)')
      .addColumn('deviceTokenHash', 'varchar(200)', (col) => col.notNull())
      .addColumn('status', 'varchar(24)', (col) => col.notNull().defaultTo('ACTIVE'))
      .addColumn('softwareVersion', 'varchar(48)', (col) => col.notNull().defaultTo('0.1.0'))
      .addColumn('hardwareJson', 'text', (col) => col.notNull())
      .addColumn('lastSeenAt', 'varchar(30)')
      .addColumn('createdAt', 'varchar(30)', (col) => col.notNull())
      .addColumn('updatedAt', 'varchar(30)', (col) => col.notNull())
      .addColumn('deletedAt', 'varchar(30)')
      .execute();

    await schema.createIndex('idx_kiosks_tenant').on('kiosks').columns(['tenantId']).execute();

    await schema
      .createTable('patients')
      .addColumn('id', 'varchar(26)', (col) => col.primaryKey())
      .addColumn('tenantId', 'varchar(26)', (col) => col.notNull().references('tenants.id'))
      .addColumn('fullName', 'varchar(200)')
      .addColumn('preferredName', 'varchar(200)')
      .addColumn('dateOfBirth', 'varchar(10)')
      .addColumn('dobAccuracy', 'varchar(24)', (col) => col.notNull().defaultTo('UNKNOWN'))
      .addColumn('ageYears', 'integer')
      .addColumn('sex', 'varchar(16)')
      .addColumn('pregnant', 'integer')
      .addColumn('phoneMasked', 'varchar(64)')
      .addColumn('preferredLanguage', 'varchar(16)', (col) => col.notNull().defaultTo('en-IN'))
      .addColumn('district', 'varchar(120)')
      .addColumn('state', 'varchar(120)')
      .addColumn('pinCode', 'varchar(16)')
      .addColumn('guestRef', 'varchar(64)')
      .addColumn('createdAt', 'varchar(30)', (col) => col.notNull())
      .addColumn('updatedAt', 'varchar(30)', (col) => col.notNull())
      .addColumn('deletedAt', 'varchar(30)')
      .execute();

    await schema.createIndex('idx_patients_tenant').on('patients').columns(['tenantId']).execute();
    await schema
      .createIndex('idx_patients_guest')
      .on('patients')
      .columns(['tenantId', 'guestRef'])
      .execute();

    await schema
      .createTable('sessions')
      .addColumn('id', 'varchar(26)', (col) => col.primaryKey())
      .addColumn('tenantId', 'varchar(26)', (col) => col.notNull().references('tenants.id'))
      .addColumn('kioskId', 'varchar(26)', (col) => col.notNull().references('kiosks.id'))
      .addColumn('patientId', 'varchar(26)')
      .addColumn('locale', 'varchar(16)', (col) => col.notNull())
      .addColumn('status', 'varchar(24)', (col) => col.notNull().defaultTo('OPEN'))
      .addColumn('expiresAt', 'varchar(30)', (col) => col.notNull())
      .addColumn('endedAt', 'varchar(30)')
      .addColumn('wipedAt', 'varchar(30)')
      .addColumn('transientArtifactsDeleted', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('createdAt', 'varchar(30)', (col) => col.notNull())
      .addColumn('updatedAt', 'varchar(30)', (col) => col.notNull())
      .execute();

    await schema
      .createIndex('idx_sessions_tenant_kiosk')
      .on('sessions')
      .columns(['tenantId', 'kioskId'])
      .execute();
  },
};