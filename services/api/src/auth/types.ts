/**
 * Authentication domain types.
 *
 * Kept separate from the service so routes, middleware and tests can share the vocabulary without
 * importing the implementation.
 */

import type { Permission, Role } from "@medikiosk/auth";
import type { TenantBranding } from "./repository/tenant.repo";

export interface LoginRequest {
  readonly tenantSlug: string;
  readonly username: string;
  readonly password: string;
}

/**
 * The authenticated caller.
 *
 * Nothing clinical appears here. A principal is an authorisation fact, not a patient: the patient is
 * always a separate identifier resolved per request against the tenant.
 */
export interface AuthenticatedPrincipal {
  readonly userId: string;
  readonly tenantId: string;
  readonly username: string;
  readonly displayName: string;
  readonly roles: readonly Role[];
}

export interface LoginOutcome {
  readonly token: string;
  readonly expiresAt: string;
  readonly principal: AuthenticatedPrincipal;
  readonly permissions: readonly Permission[];
  readonly tenant: {
    readonly id: string;
    readonly name: string;
    readonly branding: TenantBranding;
  };
}

/** Request-scoped context carried into audit rows. Never contains credentials. */
export interface RequestAuditContext {
  readonly requestId?: string;
}
