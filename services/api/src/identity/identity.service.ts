import { createHmac, timingSafeEqual } from "node:crypto";
import { ulid } from "ulid";
import { errors } from "@medikiosk/shared-types";
import type { AppDatabase } from "../db/kysely";
import type { SessionRow } from "../db/schema";
import type { AppConfig } from "../config/env";
import { failure, type MutationResult } from "../kiosk/replay";

function otpDigest(id: string, otp: string, config: AppConfig) {
  return createHmac("sha256", config.MEDIKIOSK_HASH_PEPPER)
    .update(`${id}:${otp}`)
    .digest("hex");
}
async function createPatient(
  db: AppDatabase,
  session: SessionRow,
  now: Date,
  guest: boolean,
) {
  const id = ulid();
  const guestRef = guest ? `G-${ulid()}` : null;
  await db
    .insertInto("patients")
    .values({
      id,
      tenantId: session.tenantId,
      fullName: null,
      preferredName: null,
      dateOfBirth: null,
      dobAccuracy: "UNKNOWN",
      ageYears: null,
      sex: null,
      pregnant: null,
      phoneMasked: null,
      preferredLanguage: session.locale,
      district: null,
      state: null,
      pinCode: null,
      guestRef,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      deletedAt: null,
    })
    .execute();
  await db
    .updateTable("sessions")
    .set({ patientId: id, updatedAt: now.toISOString() })
    .where("id", "=", session.id)
    .where("tenantId", "=", session.tenantId)
    .execute();
  return { patientId: id, guestRef };
}
export async function startIdentity(
  db: AppDatabase,
  session: SessionRow,
  method: string,
  config: AppConfig,
  now: Date,
): Promise<MutationResult> {
  if (session.patientId)
    throw errors.conflict("This session already has an identity.");
  if (config.IDENTITY_PROVIDER !== "mock")
    return failure(
      "IDENTITY_PROVIDER_UNAVAILABLE",
      "External ABHA identity is not implemented.",
    );
  await db
    .deleteFrom("identity_challenges")
    .where("sessionId", "=", session.id)
    .where("tenantId", "=", session.tenantId)
    .execute();
  if (method === "GUEST") {
    const patient = await createPatient(db, session, now, true);
    return {
      status: 201,
      body: { ...patient, providerName: "mock", verified: false },
    };
  }
  const challengeId = ulid();
  const expiresAt = new Date(
    Math.min(now.getTime() + 5 * 60_000, Date.parse(session.expiresAt)),
  ).toISOString();
  await db
    .insertInto("identity_challenges")
    .values({
      id: challengeId,
      tenantId: session.tenantId,
      sessionId: session.id,
      method,
      providerName: "mock",
      otpHash: otpDigest(challengeId, "123456", config),
      attempts: 0,
      expiresAt,
      consumedAt: null,
      createdAt: now.toISOString(),
    })
    .execute();
  return {
    status: 201,
    body: { challengeId, otpLength: 6, expiresAt, providerName: "mock" },
  };
}
export async function verifyIdentity(
  db: AppDatabase,
  session: SessionRow,
  challengeId: string,
  otp: string,
  config: AppConfig,
  now: Date,
): Promise<MutationResult> {
  if (config.IDENTITY_PROVIDER !== "mock")
    return failure(
      "IDENTITY_PROVIDER_UNAVAILABLE",
      "External ABHA identity is not implemented.",
    );
  const challenge = await db
    .selectFrom("identity_challenges")
    .selectAll()
    .where("id", "=", challengeId)
    .where("sessionId", "=", session.id)
    .where("tenantId", "=", session.tenantId)
    .executeTakeFirst();
  if (!challenge) throw errors.notFound("Identity challenge");
  if (challenge.expiresAt <= now.toISOString())
    return failure(
      "IDENTITY_OTP_EXPIRED",
      "The synthetic challenge has expired.",
    );
  if (challenge.attempts >= 5)
    return failure(
      "IDENTITY_OTP_ATTEMPTS_EXCEEDED",
      "The synthetic challenge attempt limit was reached.",
    );
  if (challenge.consumedAt || session.patientId)
    throw errors.conflict("Identity has already been completed.");
  await db
    .updateTable("identity_challenges")
    .set({ attempts: challenge.attempts + 1 })
    .where("id", "=", challengeId)
    .where("tenantId", "=", session.tenantId)
    .execute();
  const expected = Buffer.from(challenge.otpHash ?? "", "hex");
  const supplied = Buffer.from(otpDigest(challengeId, otp, config), "hex");
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    // Return rather than throw: the enclosing replay transaction commits the attempt and error.
    return failure(
      challenge.attempts + 1 >= 5
        ? "IDENTITY_OTP_ATTEMPTS_EXCEEDED"
        : "IDENTITY_OTP_INVALID",
      "The synthetic demonstration code was not accepted.",
    );
  }
  const { patientId } = await createPatient(db, session, now, false);
  await db
    .updateTable("identity_challenges")
    .set({ consumedAt: now.toISOString(), otpHash: null })
    .where("id", "=", challengeId)
    .where("tenantId", "=", session.tenantId)
    .execute();
  return {
    status: 200,
    body: {
      patientId,
      verified: true,
      providerName: "mock",
      displayNameMasked: "Synthetic demo participant",
    },
  };
}
