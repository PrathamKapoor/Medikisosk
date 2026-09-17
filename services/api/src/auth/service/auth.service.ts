/**
 * Staff authentication service.
 *
 * Owns credential verification and token issuance. Two properties matter here beyond "does the
 * password match":
 *
 * 1. **Unknown user and wrong password are indistinguishable to the caller.** Both produce the same
 *    error code and message, and the unknown-user path still performs a bcrypt comparison against a
 *    dummy hash so the two paths take comparable time. Without that, an attacker can enumerate valid
 *    staff usernames by timing the login endpoint.
 * 2. **The audit trail records the attempt either way.** A failed login against a real account is the
 *    signal that matters operationally, so it is recorded with the username and never the password.
 */

import {
  errors,
  err,
  ok,
  type MediKioskError,
  type Result,
} from "@medikiosk/shared-types";
import {
  hasPermission,
  hashPassword,
  permissionsForRoles,
  signStaffToken,
  verifyPassword,
  STAFF_TOKEN_TTL_MINUTES,
  type Permission,
} from "@medikiosk/auth";
import type { AppConfig } from "../../config/env";
import type { AppDatabase } from "../../db/kysely";
import type { AppLogger } from "../../platform/logger";
import { appendAuditEvent } from "../../platform/audit";
import { findTenantBySlug, parseBranding } from "../repository/tenant.repo";
import {
  findUserByUsername,
  parseRoles,
  touchLastLogin,
} from "../repository/user.repo";
import type {
  AuthenticatedPrincipal,
  LoginOutcome,
  LoginRequest,
  RequestAuditContext,
} from "../types";

export interface AuthServiceDeps {
  readonly db: AppDatabase;
  readonly logger: AppLogger;
  readonly config: AppConfig;
  /** Injected so tests can freeze time and results are reproducible. */
  readonly now: () => Date;
}

export class AuthService {
  constructor(private readonly deps: AuthServiceDeps) {}

  /**
   * Authenticate a staff member and issue a session token.
   *
   * Check order is deliberate: the tenant is resolved first, because a wrong hospital slug is a
   * configuration mistake rather than a credential guess and should not consume a bcrypt comparison.
   */
  async login(
    request: LoginRequest,
    context: RequestAuditContext,
  ): Promise<Result<LoginOutcome, MediKioskError>> {
    const { db, logger, config, now } = this.deps;

    const tenant = await findTenantBySlug(db, request.tenantSlug);
    if (!tenant) {
      await appendAuditEvent(
        db,
        logger,
        { requestId: context.requestId },
        {
          tenantId: "unknown",
          actorKind: "SYSTEM",
          action: "USER_LOGIN_FAILED",
          result: "DENIED",
          detail: { reason: "UNKNOWN_TENANT" },
        },
      );
      return err(errors.forbidden("Unknown or inactive hospital identifier."));
    }

    const auditContext = { requestId: context.requestId, tenantId: tenant.id };
    const user = await findUserByUsername(db, tenant.id, request.username);

    if (!user) {
      // Burn comparable time, then reject with the same shape as a wrong password.
      await verifyPassword(
        request.password,
        config.MEDIKIOSK_HASH_PEPPER,
        await this.dummyHash(),
      );
      await appendAuditEvent(db, logger, auditContext, {
        tenantId: tenant.id,
        actorKind: "SYSTEM",
        action: "USER_LOGIN_FAILED",
        result: "FAILURE",
        detail: { reason: "UNKNOWN_USER", username: request.username },
      });
      return err(errors.unauthenticated("Invalid username or password."));
    }

    const passwordOk = await verifyPassword(
      request.password,
      config.MEDIKIOSK_HASH_PEPPER,
      user.passwordHash,
    );
    if (!passwordOk) {
      await appendAuditEvent(db, logger, auditContext, {
        tenantId: tenant.id,
        actorId: user.id,
        actorKind: "STAFF",
        action: "USER_LOGIN_FAILED",
        resourceType: "user",
        resourceId: user.id,
        result: "FAILURE",
        detail: { reason: "WRONG_PASSWORD", username: request.username },
      });
      // Byte-identical message to the unknown-user path. See the class comment.
      return err(errors.unauthenticated("Invalid username or password."));
    }

    if (user.active !== 1) {
      await appendAuditEvent(db, logger, auditContext, {
        tenantId: tenant.id,
        actorId: user.id,
        actorKind: "STAFF",
        action: "USER_LOGIN_FAILED",
        resourceType: "user",
        resourceId: user.id,
        result: "DENIED",
        detail: { reason: "ACCOUNT_INACTIVE" },
      });
      return err(
        errors.forbidden(
          "This account is not active. Contact your administrator.",
        ),
      );
    }

    const roles = parseRoles(user.rolesJson);
    if (roles.length === 0) {
      // A user with no parseable role can do nothing; issuing a token would imply otherwise.
      return err(
        errors.forbidden(
          "This account has no assigned role. Contact your administrator.",
        ),
      );
    }

    const issuedAt = now();
    const token = await signStaffToken(
      {
        sub: user.id,
        tenantId: tenant.id,
        username: user.username,
        displayName: user.displayName,
        roles,
      },
      config.MEDIKIOSK_JWT_SECRET,
      { ttlMinutes: STAFF_TOKEN_TTL_MINUTES, now: issuedAt },
    );
    const expiresAt = new Date(
      issuedAt.getTime() + STAFF_TOKEN_TTL_MINUTES * 60_000,
    ).toISOString();

    await appendAuditEvent(db, logger, auditContext, {
      tenantId: tenant.id,
      actorId: user.id,
      actorKind: "STAFF",
      action: "USER_LOGIN_SUCCEEDED",
      resourceType: "user",
      resourceId: user.id,
      result: "SUCCESS",
      detail: { roles: roles.join(",") },
    });

    // Best-effort: a failure to timestamp the login must not fail the login itself.
    // See user.repo.ts — the function contract requires callers to absorb its errors.
    try {
      await touchLastLogin(db, user.id, issuedAt.toISOString());
    } catch {
      logger.error(auditContext, "Failed to record last login timestamp", {
        reason: "LAST_LOGIN_WRITE_FAILED",
      });
    }

    return ok({
      token,
      expiresAt,
      principal: {
        userId: user.id,
        tenantId: tenant.id,
        username: user.username,
        displayName: user.displayName,
        roles,
      },
      permissions: permissionsForRoles(roles),
      tenant: {
        id: tenant.id,
        name: tenant.name,
        branding: parseBranding(tenant.brandingJson),
      },
    });
  }

  /**
   * Record an explicit logout.
   *
   * Token invalidation is by expiry, not by a server-side denylist, because a stateless token keeps
   * the kiosk resilient to an API restart mid-shift. This method therefore exists for the audit
   * trail: an operator investigating an incident needs to see when a session was deliberately ended.
   */
  async logout(
    principal: AuthenticatedPrincipal,
    context: RequestAuditContext,
  ): Promise<void> {
    await appendAuditEvent(
      this.deps.db,
      this.deps.logger,
      { requestId: context.requestId, tenantId: principal.tenantId },
      {
        tenantId: principal.tenantId,
        actorId: principal.userId,
        actorKind: "STAFF",
        action: "USER_LOGOUT",
        resourceType: "user",
        resourceId: principal.userId,
        result: "SUCCESS",
      },
    );
  }

  /**
   * True when the principal holds the permission.
   *
   * Kept on the service so routes never compose role logic themselves; a route that reasons about
   * roles directly is how an authorisation rule drifts between two endpoints.
   */
  can(principal: AuthenticatedPrincipal, permission: Permission): boolean {
    return hasPermission(principal.roles, permission);
  }

  /** Every permission the principal holds, for the `/auth/me` response. */
  permissionsFor(principal: AuthenticatedPrincipal): readonly Permission[] {
    return permissionsForRoles(principal.roles);
  }

  private dummyHashCache?: Promise<string>;

  /**
   * A bcrypt hash of a random throwaway value, computed once per process and then reused.
   *
   * Its only purpose is to make the unknown-user path perform the same expensive comparison as the
   * wrong-password path, so login timing does not disclose which staff usernames exist. It is cached
   * because paying a full bcrypt cost on every failed lookup would itself become a denial-of-service
   * vector.
   */
  private async dummyHash(): Promise<string> {
    if (!this.dummyHashCache) {
      const random = `timing-equalisation-${Math.random().toString(36).slice(2)}-padding-value`;
      this.dummyHashCache = hashPassword(
        random,
        this.deps.config.MEDIKIOSK_HASH_PEPPER,
      ).then((result) => result.hash);
    }
    return this.dummyHashCache;
  }
}
