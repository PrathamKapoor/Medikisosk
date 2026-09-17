/**
 * Permissions and roles.
 *
 * Authorisation checks a PERMISSION, never a role name, at the point of use. Roles are how humans are
 * described; permissions are what code actually requires. A hospital that gives its triage nurses the
 * ability to escalate (but not de-escalate, and never to edit a summary) is expressed by composing
 * permissions, and the code never needs to change.
 *
 * SUPER_ADMIN is deliberately the most limited role in practice: it manages configuration and reads
 * aggregate metrics, but has no clinical read permission at all. A platform operator has no business
 * reading patient records, and the absence of that permission is enforced here rather than trusted to
 * discipline.
 */

export const ROLES = ['PHYSICIAN', 'NURSE', 'TRIAGE', 'ADMIN', 'KIOSK', 'SUPER_ADMIN'] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  PHYSICIAN: 'Physician',
  NURSE: 'Nurse',
  TRIAGE: 'Triage desk',
  ADMIN: 'Administrator',
  KIOSK: 'Kiosk device',
  SUPER_ADMIN: 'Platform administrator',
};

export const PERMISSIONS = [
  // Patients and encounters
  'patient.read',
  'patient.search',
  'encounter.create',
  'encounter.read',
  'encounter.submit',
  // Interview
  'interview.read',
  'interview.respond',
  // Documents
  'document.upload',
  'document.read',
  'document.verify',
  // Vitals and devices
  'vitals.read',
  'vitals.record',
  'device.read',
  // Triage and queue
  'triage.read',
  'triage.update',
  'triage.override',
  // Clinical read model and review
  'evidence.read',
  'contradiction.resolve',
  'summary.read',
  'summary.edit',
  'summary.verify',
  // AYUSH
  'ayush.read',
  'ayush.write',
  // Interoperability
  'fhir.generate',
  'fhir.transmit',
  'sync.read',
  'sync.retry',
  'abdm.read',
  // Administration
  'tenant.manage',
  'kiosk.read',
  'kiosk.manage',
  'analytics.read',
  'audit.read',
  // Evaluation / research
  'evaluation.run',
  'evaluation.read',
  // Kiosk-only session operations
  'kiosk.session.create',
  'kiosk.consent.capture',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Permissions per role.
 *
 * Written as an explicit table rather than derived, so that "what can a triage nurse do?" is a single
 * readable list and a reviewer can answer it without reading code.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  PHYSICIAN: [
    'patient.read',
    'patient.search',
    'encounter.create',
    'encounter.read',
    'encounter.submit',
    'interview.read',
    'interview.respond',
    'document.upload',
    'document.read',
    'document.verify',
    'vitals.read',
    'vitals.record',
    'device.read',
    'triage.read',
    'triage.update',
    'triage.override',
    'evidence.read',
    'contradiction.resolve',
    'summary.read',
    'summary.edit',
    'summary.verify',
    'ayush.read',
    'ayush.write',
    'fhir.generate',
    'fhir.transmit',
    'sync.read',
    'abdm.read',
    'kiosk.read',
    'analytics.read',
    'audit.read',
    'evaluation.run',
    'evaluation.read',
  ],
  NURSE: [
    'patient.read',
    'patient.search',
    'encounter.create',
    'encounter.read',
    'encounter.submit',
    'interview.read',
    'interview.respond',
    'document.upload',
    'document.read',
    'document.verify',
    'vitals.read',
    'vitals.record',
    'device.read',
    'triage.read',
    'triage.update',
    'evidence.read',
    'summary.read',
    'ayush.read',
  ],
  TRIAGE: [
    'patient.read',
    'patient.search',
    'encounter.read',
    'triage.read',
    'triage.update',
    'triage.override',
    'evidence.read',
    'summary.read',
    'vitals.read',
  ],
  ADMIN: [
    'tenant.manage',
    'kiosk.read',
    'kiosk.manage',
    'analytics.read',
    'audit.read',
    'sync.read',
    'sync.retry',
    'abdm.read',
    'device.read',
    'evaluation.read',
  ],
  KIOSK: [
    'kiosk.session.create',
    'kiosk.consent.capture',
    'encounter.create',
    'encounter.read',
    'interview.read',
    'interview.respond',
    'document.upload',
    'vitals.record',
    'patient.search',
  ],
  /**
   * Configuration and aggregates only. No `patient.read`, no `summary.read`, no `evidence.read`:
   * a platform operator must not be able to browse clinical records.
   */
  SUPER_ADMIN: [
    'tenant.manage',
    'kiosk.read',
    'kiosk.manage',
    'analytics.read',
    'audit.read',
    'sync.read',
    'sync.retry',
    'abdm.read',
    'device.read',
    'evaluation.run',
    'evaluation.read',
  ],
};

export function permissionsForRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function permissionsForRoles(roles: readonly Role[]): readonly Permission[] {
  const unique = new Set<Permission>();
  for (const role of roles) {
    for (const permission of permissionsForRole(role)) unique.add(permission);
  }
  return [...unique];
}

export function hasPermission(
  roles: readonly Role[],
  required: Permission | readonly Permission[],
): boolean {
  const held = new Set(permissionsForRoles(roles));
  if (typeof required === 'string') return held.has(required);
  // Every listed permission must be held. Callers wanting "any of" pass the permissions
  // individually, because an "any of" check is a different, and rarer, decision.
  return required.every((permission) => held.has(permission));
}

export function hasAnyPermission(
  roles: readonly Role[],
  required: readonly Permission[],
): boolean {
  const held = new Set(permissionsForRoles(roles));
  return required.some((permission) => held.has(permission));
}