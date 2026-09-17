import { z } from "zod";
import { ulid } from "ulid";
import { errors, MediKioskError } from "@medikiosk/shared-types";
import type { AppDatabase } from "../db/kysely";
import type { ConsentRow, SessionRow } from "../db/schema";
import { sessionFor } from "../kiosk/session.repo";
import { CONSENT_VERSION, TRANSLATION_VERSION } from "./versions";

const purposeSchema = z.object({
  key: z.string(),
  required: z.boolean(),
  categories: z.array(z.string()),
  statementKey: z.string(),
  statement: z.string(),
  action: z.string(),
  destination: z.string(),
  translationVersion: z.string(),
});
export const decisionSchema = z
  .object({
    purpose: z.string(),
    granted: z.boolean(),
    categories: z.array(z.string()).max(10),
    action: z.string().optional(),
    destination: z.string().optional(),
  })
  .strict();
export const consentInputSchema = z
  .object({
    sessionId: z.string(),
    patientId: z.string(),
    consentVersion: z.string(),
    locale: z.string(),
    method: z.literal("TOUCH_CONFIRMED"),
    decisions: z.array(decisionSchema).max(3),
  })
  .strict();
export type Decision = z.infer<typeof decisionSchema>;
export async function readVersion(
  db: AppDatabase,
  locale: string,
  version = CONSENT_VERSION,
) {
  const row = await db
    .selectFrom("consent_versions")
    .selectAll()
    .where("version", "=", version)
    .where("locale", "=", locale)
    .where("retiredAt", "is", null)
    .executeTakeFirst();
  if (!row) throw errors.notFound("Consent version");
  const purposes = z.array(purposeSchema).parse(JSON.parse(row.purposesJson));
  return {
    consentVersion: row.version,
    locale: row.locale,
    translationVersion: TRANSLATION_VERSION,
    purposes,
  };
}
export function consentRecord(row: ConsentRow, now: Date) {
  const decisions = z.array(decisionSchema).parse(JSON.parse(row.purposesJson));
  return {
    id: row.id,
    sessionId: row.sessionId,
    patientId: row.patientId,
    consentVersion: row.consentVersion,
    locale: row.locale,
    method: row.method,
    translationVersion: TRANSLATION_VERSION,
    decisions,
    grantedAt: row.grantedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    stopRequired:
      Boolean(row.revokedAt) ||
      row.expiresAt <= now.toISOString() ||
      !decisions.some(
        (d) =>
          d.purpose === "treatment" &&
          d.granted &&
          d.categories.includes("IDENTITY") &&
          d.categories.includes("SYMPTOMS"),
      ),
  };
}
export async function sessionConsent(
  db: AppDatabase,
  session: SessionRow,
  now: Date,
) {
  if (!session.patientId) return undefined;
  const row = await db
    .selectFrom("consents")
    .selectAll()
    .where("tenantId", "=", session.tenantId)
    .where("sessionId", "=", session.id)
    .where("patientId", "=", session.patientId)
    .orderBy("createdAt", "desc")
    .orderBy("id", "desc")
    .executeTakeFirst();
  return row ? consentRecord(row, now) : undefined;
}
export async function acceptConsent(
  db: AppDatabase,
  session: SessionRow,
  input: z.infer<typeof consentInputSchema>,
  now: Date,
) {
  if (!session.patientId || session.patientId !== input.patientId)
    throw errors.notFound("Patient");
  if (session.locale !== input.locale)
    throw errors.validation(
      "Consent language must match the current session language.",
    );
  if (await sessionConsent(db, session, now))
    throw errors.conflict(
      "Consent has already been recorded for this session.",
    );
  const version = await readVersion(db, input.locale, input.consentVersion);
  if (
    input.decisions.length !== version.purposes.length ||
    new Set(input.decisions.map((d) => d.purpose)).size !==
      input.decisions.length
  )
    throw errors.validation("Choose a decision for each purpose.");
  const decisions = version.purposes.map((purpose) => {
    const decision = input.decisions.find((d) => d.purpose === purpose.key);
    if (
      !decision ||
      new Set(decision.categories).size !== decision.categories.length ||
      decision.categories.some((c) => !purpose.categories.includes(c)) ||
      (!decision.granted && decision.categories.length > 0) ||
      (decision.action && decision.action !== purpose.action) ||
      (decision.destination && decision.destination !== purpose.destination)
    )
      throw errors.validation(
        "Consent decision does not match the published scope.",
      );
    return {
      ...decision,
      action: purpose.action,
      destination: purpose.destination,
    };
  });
  const row: ConsentRow = {
    id: ulid(),
    tenantId: session.tenantId,
    patientId: session.patientId,
    sessionId: session.id,
    consentVersion: version.consentVersion,
    locale: input.locale,
    method: input.method,
    purposesJson: JSON.stringify(decisions),
    grantedAt: now.toISOString(),
    expiresAt: session.expiresAt,
    revokedAt: null,
    revokeReason: null,
    createdAt: now.toISOString(),
  };
  await db.insertInto("consents").values(row).execute();
  await db
    .updateTable("sessions")
    .set({ updatedAt: now.toISOString() })
    .where("id", "=", session.id)
    .where("tenantId", "=", session.tenantId)
    .execute();
  return consentRecord(row, now);
}
export interface ConsentScope {
  tenantId: string;
  patientId: string;
  sessionId: string;
  purpose: string;
  category: string;
  action: string;
  destination: string;
}
/** Call inside the same transaction as the protected operation; revocation locks the session too. */
export async function requireConsent(
  db: AppDatabase,
  scope: ConsentScope,
  now = new Date(),
): Promise<void> {
  await db
    .updateTable("sessions")
    .set((eb) => ({ updatedAt: eb.ref("updatedAt") }))
    .where("id", "=", scope.sessionId)
    .where("tenantId", "=", scope.tenantId)
    .execute();
  const session = await db
    .selectFrom("sessions")
    .selectAll()
    .where("id", "=", scope.sessionId)
    .where("tenantId", "=", scope.tenantId)
    .executeTakeFirst();
  if (!session || session.patientId !== scope.patientId)
    throw errors.notFound("Session");
  await sessionFor(
    db,
    {
      kind: "KIOSK",
      sub: session.id,
      sessionId: session.id,
      kioskId: session.kioskId,
      tenantId: scope.tenantId,
    },
    now,
  );
  const consent = await sessionConsent(db, session, now);
  if (!consent) throw errors.consentMissing(scope.purpose);
  if (consent.revokedAt) throw errors.consentRevoked(scope.purpose);
  if (consent.expiresAt <= now.toISOString())
    throw new MediKioskError("CONSENT_EXPIRED", "Consent has expired.");
  if (
    !consent.decisions.some(
      (d) =>
        d.purpose === scope.purpose &&
        d.granted &&
        d.categories.includes(scope.category) &&
        d.action === scope.action &&
        d.destination === scope.destination,
    )
  )
    throw new MediKioskError(
      "CONSENT_PURPOSE_NOT_PERMITTED",
      "Consent does not permit this processing scope.",
    );
}
