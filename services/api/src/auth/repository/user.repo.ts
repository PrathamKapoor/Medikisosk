/**
 * Staff user repository.
 *
 * Data access for staff accounts. Every read is tenant-scoped and the tenant id is supplied by the
 * service layer, which derives it from the authenticated principal or from an explicit tenant lookup
 * during login. A route never passes a tenant id that came from the request body.
 *
 * Imports are extensionless because this package compiles under `moduleResolution: Node`, matching
 * every other module in `services/api`.
 */

import { z } from "zod";
import { ulid } from "ulid";
import { ROLES, hashPassword, type Role } from "@medikiosk/auth";
import type { AppDatabase } from "../../db/kysely";
import type { UserRow } from "../../db/schema";

export const createUserSchema = z.object({
  tenantId: z.string().min(1),
  username: z.string().min(3).max(64),
  displayName: z.string().min(1).max(200),
  /** Plain text, hashed before storage and never logged. */
  password: z.string().min(8).max(200),
  roles: z.array(z.enum(ROLES)).min(1),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

/** Roles stored as a JSON array of strings; validated on read so a bad row cannot inject a role. */
export function parseRoles(rolesJson: string): readonly Role[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rolesJson) as unknown;
  } catch {
    // A malformed roles column must fail closed: an unparseable role list grants nothing.
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const valid = new Set<string>(ROLES);
  return parsed.filter(
    (entry): entry is Role => typeof entry === "string" && valid.has(entry),
  );
}

/**
 * Find a staff user by username within a tenant.
 *
 * Usernames are unique per tenant, not globally, because two hospitals may each employ a "dr.rao".
 */
export async function findUserByUsername(
  db: AppDatabase,
  tenantId: string,
  username: string,
): Promise<UserRow | undefined> {
  return db
    .selectFrom("users")
    .selectAll()
    .where("tenantId", "=", tenantId)
    .where("username", "=", username)
    .executeTakeFirst();
}

/** Find a staff user by primary key, tenant-scoped. */
export async function findUserById(
  db: AppDatabase,
  tenantId: string,
  userId: string,
): Promise<UserRow | undefined> {
  return db
    .selectFrom("users")
    .selectAll()
    .where("tenantId", "=", tenantId)
    .where("id", "=", userId)
    .executeTakeFirst();
}

/**
 * Create a staff user.
 *
 * The pepper is a required argument rather than read from `process.env` inside this function: reading
 * the environment here would make the repository untestable and would scatter secret access across
 * the codebase.
 */
export async function insertUser(
  db: AppDatabase,
  input: CreateUserInput,
  pepper: string,
): Promise<UserRow> {
  const now = new Date().toISOString();
  const { hash } = await hashPassword(input.password, pepper);

  return db
    .insertInto("users")
    .values({
      id: ulid(),
      tenantId: input.tenantId,
      username: input.username,
      displayName: input.displayName,
      passwordHash: hash,
      rolesJson: JSON.stringify(input.roles),
      active: 1,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

/** Record a successful login. Failure to record it must not fail the login itself. */
export async function touchLastLogin(
  db: AppDatabase,
  userId: string,
  at: string,
): Promise<void> {
  await db
    .updateTable("users")
    .set({ lastLoginAt: at, updatedAt: at })
    .where("id", "=", userId)
    .execute();
}
