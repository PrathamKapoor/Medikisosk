import { createHash, timingSafeEqual } from "node:crypto";
import { errors, MediKioskError } from "@medikiosk/shared-types";
import type { AppDatabase } from "../db/kysely";
import type { KioskTokenClaims } from "@medikiosk/auth";
import { parseEnabledLocales } from "../auth/repository/tenant.repo";

export async function activeDevice(
  db: AppDatabase,
  kioskId: string,
  token?: string,
  tenantId?: string,
) {
  const kiosk = await db
    .selectFrom("kiosks")
    .selectAll()
    .where("id", "=", kioskId)
    .executeTakeFirst();
  if (
    !kiosk ||
    kiosk.deletedAt ||
    kiosk.status !== "ACTIVE" ||
    (tenantId && tenantId !== kiosk.tenantId)
  )
    throw errors.unauthenticated();
  if (token !== undefined) {
    const supplied = createHash("sha256").update(token).digest();
    const expected = Buffer.from(kiosk.deviceTokenHash, "hex");
    if (
      expected.length !== supplied.length ||
      !timingSafeEqual(expected, supplied)
    )
      throw errors.unauthenticated();
  }
  const tenant = await db
    .selectFrom("tenants")
    .selectAll()
    .where("id", "=", kiosk.tenantId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!tenant) throw errors.unauthenticated();
  return { kiosk, tenant };
}
export async function sessionFor(
  db: AppDatabase,
  principal: KioskTokenClaims,
  now: Date,
  allowEnded = false,
  lock = false,
) {
  await activeDevice(db, principal.kioskId, undefined, principal.tenantId);
  if (lock)
    await db
      .updateTable("sessions")
      .set({ updatedAt: now.toISOString() })
      .where("id", "=", principal.sessionId)
      .where("tenantId", "=", principal.tenantId)
      .where("kioskId", "=", principal.kioskId)
      .execute();
  const session = await db
    .selectFrom("sessions")
    .selectAll()
    .where("id", "=", principal.sessionId)
    .where("tenantId", "=", principal.tenantId)
    .where("kioskId", "=", principal.kioskId)
    .executeTakeFirst();
  if (!session) throw errors.notFound("Session");
  if (
    (!allowEnded && session.status !== "ACTIVE") ||
    session.expiresAt <= now.toISOString()
  )
    throw new MediKioskError("SESSION_EXPIRED", "This session has ended.");
  return session;
}
export async function assertLocale(
  db: AppDatabase,
  tenantId: string,
  locale: string,
) {
  const tenant = await db
    .selectFrom("tenants")
    .select("localesJson")
    .where("id", "=", tenantId)
    .where("deletedAt", "is", null)
    .executeTakeFirstOrThrow();
  const version = await db
    .selectFrom("consent_versions")
    .select("version")
    .where("locale", "=", locale)
    .where("version", "=", "1.1.0")
    .where("retiredAt", "is", null)
    .executeTakeFirst();
  if (!parseEnabledLocales(tenant.localesJson).includes(locale) || !version)
    throw errors.validation(
      "This language is not available for this hospital.",
    );
}
export async function clearTransient(
  db: AppDatabase,
  tenantId: string,
  sessionId: string,
  preserveWipeReplay = false,
) {
  const removed = await db
    .deleteFrom("identity_challenges")
    .where("tenantId", "=", tenantId)
    .where("sessionId", "=", sessionId)
    .executeTakeFirst();
  let replay = db
    .deleteFrom("idempotency_keys")
    .where("tenantId", "=", tenantId)
    .where("sessionId", "=", sessionId);
  if (preserveWipeReplay) replay = replay.where("route", "!=", "session.wipe");
  await replay.execute();
  return Number(removed.numDeletedRows);
}
