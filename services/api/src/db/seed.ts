/**
 * Demo and development seed data.
 *
 * Idempotent by design: every row is inserted only when its natural key is absent, so seeding twice
 * is safe and seeding over a live demo database does not duplicate tenants, users or kiosks. All seed
 * data is synthetic — no real patient has ever been near this dataset, and the one consent version
 * shipped here is the development wording, not a hospital's reviewed text.
 */

import { createHash } from 'node:crypto';
import { ulid } from 'ulid';
import { verifyPassword, hashPassword } from '@medikiosk/auth';
import type { AppDatabase } from './kysely';

export const DEMO_TENANT_SLUG = 'demo-hospital';
export const DEMO_TENANT_NAME = 'Demo District Hospital';

export interface SeedReport {
  readonly tenantId: string;
  readonly users: readonly { username: string; created: boolean }[];
  readonly kiosks: readonly { name: string; created: boolean }[];
  readonly consentVersions: readonly { version: string; locale: string; created: boolean }[];
  readonly demoPatients: number;
  readonly demoEncounters: number;
}

const STAFF = [
  { username: 'dr.rao', displayName: 'Dr. Rao', password: 'demo-pass-1234', roles: ['PHYSICIAN'] },
  { username: 'nurse.mehta', displayName: 'Nurse Mehta', password: 'demo-pass-1234', roles: ['NURSE'] },
  { username: 'triage.desk', displayName: 'Triage Desk', password: 'demo-pass-1234', roles: ['TRIAGE'] },
  { username: 'admin.patil', displayName: 'Admin Patil', password: 'demo-pass-1234', roles: ['ADMIN'] },
] as const;

/** The demo kiosk's device token. Development-only; a real deployment issues one per device. */
export const DEMO_KIOSK_DEVICE_TOKEN = 'dev-kiosk-token-opd-a-2-replace-me';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export async function seedBase(db: AppDatabase, pepper: string): Promise<Omit<SeedReport, 'demoPatients' | 'demoEncounters'>> {
  const now = new Date().toISOString();

  let tenant = await db
    .selectFrom('tenants')
    .selectAll()
    .where('slug', '=', DEMO_TENANT_SLUG)
    .executeTakeFirst();

  if (!tenant) {
    tenant = await db
      .insertInto('tenants')
      .values({
        id: ulid(),
        slug: DEMO_TENANT_SLUG,
        name: DEMO_TENANT_NAME,
        brandingJson: JSON.stringify({ primaryColor: '#0F766E', logoText: 'MediKiosk' }),
        localesJson: JSON.stringify(['en-IN', 'hi-IN', 'mr-IN']),
        settingsJson: JSON.stringify({ queueCapacity: 200, oathSignoffRequired: true }),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  const users: { username: string; created: boolean }[] = [];
  for (const staff of STAFF) {
    const existing = await db
      .selectFrom('users')
      .selectAll()
      .where('tenantId', '=', tenant.id)
      .where('username', '=', staff.username)
      .executeTakeFirst();

    if (existing) {
      users.push({ username: staff.username, created: false });
      continue;
    }

    const { hash } = await hashPassword(staff.password, pepper);
    await db
      .insertInto('users')
      .values({
        id: ulid(),
        tenantId: tenant.id,
        username: staff.username,
        displayName: staff.displayName,
        passwordHash: hash,
        rolesJson: JSON.stringify(staff.roles),
        active: 1,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    users.push({ username: staff.username, created: true });
  }

  const kiosks: { name: string; created: boolean }[] = [];
  const existingKiosk = await db
    .selectFrom('kiosks')
    .selectAll()
    .where('tenantId', '=', tenant.id)
    .where('name', '=', 'OPD Block A Kiosk 2')
    .executeTakeFirst();

  if (existingKiosk) {
    kiosks.push({ name: existingKiosk.name, created: false });
  } else {
    const created = await db
      .insertInto('kiosks')
      .values({
        id: ulid(),
        tenantId: tenant.id,
        name: 'OPD Block A Kiosk 2',
        location: 'OPD Block A, ground floor',
        deviceTokenHash: sha256Hex(DEMO_KIOSK_DEVICE_TOKEN),
        status: 'ACTIVE',
        softwareVersion: '0.1.0',
        hardwareJson: JSON.stringify({ microphone: 'OK', camera: 'OK', scanner: 'OK', printer: 'OK' }),
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    kiosks.push({ name: created.name, created: true });
  }

  const consentVersions: { version: string; locale: string; created: boolean }[] = [];
  const treatmentPurposes = [
    { key: 'treatment', required: true, categories: ['IDENTITY', 'SYMPTOMS', 'DOCUMENTS', 'VOICE', 'VITALS'] },
    { key: 'research', required: false, categories: [] },
    { key: 'analytics', required: false, categories: ['SESSION_METRICS'] },
  ];
  for (const locale of ['en-IN', 'hi-IN', 'mr-IN']) {
    const existing = await db
      .selectFrom('consent_versions')
      .selectAll()
      .where('version', '=', '1.0.0')
      .where('locale', '=', locale)
      .executeTakeFirst();

    if (existing) {
      consentVersions.push({ version: '1.0.0', locale, created: false });
      continue;
    }
    await db
      .insertInto('consent_versions')
      .values({
        version: '1.0.0',
        locale,
        purposesJson: JSON.stringify(treatmentPurposes),
        publishedAt: now,
        retiredAt: null,
      })
      .execute();
    consentVersions.push({ version: '1.0.0', locale, created: true });
  }

  void verifyPassword;
  return { tenantId: tenant.id, users, kiosks, consentVersions };
}