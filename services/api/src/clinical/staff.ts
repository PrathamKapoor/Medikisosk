/**
 * Staff authentication helper for the clinical and admin consoles.
 *
 * Every console endpoint resolves the staff principal from the bearer token, loads the user row
 * (tenant-scoped, active) and checks a PERMISSION — never a role name — at the point of use. A
 * kiosk session token presented here fails closed with UNAUTHENTICATED, and a staff member
 * without the permission fails with FORBIDDEN.
 */

import { hasPermission, type Permission } from "@medikiosk/auth";
import { errors } from "@medikiosk/shared-types";
import type { FastifyRequest } from "fastify";
import type { AppDatabase } from "../db/kysely";
import type { AppConfig } from "../config/env";
import { authenticateStaff } from "../auth/middleware/authenticate";
import { parseRoles } from "../auth/repository/user.repo";

export interface StaffPrincipal {
  readonly userId: string;
  readonly displayName: string;
  readonly tenantId: string;
}

export async function requireStaff(
  db: AppDatabase,
  config: AppConfig,
  request: FastifyRequest,
  now: Date,
  permission: Permission | readonly Permission[],
): Promise<StaffPrincipal> {
  const staff = await authenticateStaff(request, config, now);
  const user = await db
    .selectFrom("users")
    .selectAll()
    .where("id", "=", staff.userId)
    .where("tenantId", "=", staff.tenantId)
    .where("active", "=", 1)
    .executeTakeFirst();
  if (!user) throw errors.unauthenticated();
  if (!hasPermission(parseRoles(user.rolesJson), permission))
    throw errors.forbidden();
  return {
    userId: user.id,
    displayName: user.displayName,
    tenantId: staff.tenantId,
  };
}
