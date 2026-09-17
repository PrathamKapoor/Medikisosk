/**
 * Database row types, one per table.
 *
 * Kysely is table-typed, so every table the migrations create is declared here with the exact shape
 * the repository layer reads and writes. Columns shared by clinical rows — tenant scoping, audit
 * timestamps, soft deletion, verification — are documented once as a convention below and repeated
 * per table, because an omitted `tenantId` on one table would be a cross-tenant leak and repetition
 * here is cheaper than that failure.
 *
 * Conventions:
 *  - Every clinical table carries `tenantId`. There is no exception and no opt-out.
 *  - Timestamps are ISO-8601 UTC text. No engine-local `CURRENT_TIMESTAMP`, so SQLite and Postgres
 *    produce identical values.
 *  - `deletedAt` is soft deletion where patients could be affected; audit rows are never deleted.
 *  - JSON columns are TEXT with a Zod schema at the repository boundary.
 */

export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  brandingJson: string;
  localesJson: string;
  settingsJson: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface UserRow {
  id: string;
  tenantId: string;
  username: string;
  displayName: string;
  passwordHash: string;
  rolesJson: string;
  active: number;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KioskRow {
  id: string;
  tenantId: string;
  name: string;
  location: string | null;
  deviceTokenHash: string;
  status: string;
  softwareVersion: string;
  hardwareJson: string;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SessionRow {
  id: string;
  tenantId: string;
  kioskId: string;
  patientId: string | null;
  locale: string;
  status: string;
  expiresAt: string;
  endedAt: string | null;
  wipedAt: string | null;
  transientArtifactsDeleted: number;
  createdAt: string;
  updatedAt: string;
}

export interface PatientRow {
  id: string;
  tenantId: string;
  fullName: string | null;
  preferredName: string | null;
  dateOfBirth: string | null;
  dobAccuracy: string;
  ageYears: number | null;
  sex: string | null;
  pregnant: number | null;
  phoneMasked: string | null;
  preferredLanguage: string;
  district: string | null;
  state: string | null;
  pinCode: string | null;
  guestRef: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ExternalIdentifierRow {
  id: string;
  tenantId: string;
  patientId: string;
  /** `ABHA_NUMBER`, `ABHA_ADDRESS`, `GUEST_REF`, `HOSPITAL_MRN`. The raw value is never stored. */
  kind: string;
  /** HMAC or salted hash for matching. */
  valueHash: string;
  /** Masked form only, e.g. `XX-XXXX-XXXX-1234`. */
  valueMasked: string;
  verified: number;
  verifiedAt: string | null;
  createdAt: string;
}

export interface IdentityChallengeRow {
  id: string;
  tenantId: string;
  sessionId: string;
  method: string;
  providerName: string;
  /** Only a hash is stored, never the OTP. */
  otpHash: string | null;
  attempts: number;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

export interface ConsentVersionRow {
  version: string;
  locale: string;
  purposesJson: string;
  publishedAt: string;
  retiredAt: string | null;
}

export interface ConsentRow {
  id: string;
  tenantId: string;
  patientId: string;
  sessionId: string | null;
  consentVersion: string;
  locale: string;
  method: string;
  purposesJson: string;
  grantedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
  createdAt: string;
}

export interface EncounterRow {
  id: string;
  tenantId: string;
  patientId: string;
  sessionId: string | null;
  encounterType: string;
  status: string;
  chiefComplaintCodesJson: string;
  chiefComplaintVerbatim: string | null;
  locale: string;
  ayushMode: number;
  questionnaireVersion: string;
  pathwayVersion: string;
  activePathwaysJson: string;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}