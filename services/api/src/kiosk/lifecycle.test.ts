import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { buildTestApp, TEST_NOW, type BuiltTestApp } from "../testing/test-app";
import { DEMO_KIOSK_DEVICE_TOKEN } from "../db/seed";
import { requireConsent } from "../consent/consent.service";

let fixture: BuiltTestApp;
afterEach(async () => {
  await fixture?.destroy();
});
async function open(now = TEST_NOW) {
  fixture = await buildTestApp({ now });
  const kiosk = await fixture.db
    .selectFrom("kiosks")
    .selectAll()
    .where("tenantId", "=", fixture.tenantId)
    .executeTakeFirstOrThrow();
  const headers = {
    "x-kiosk-id": kiosk.id,
    "x-kiosk-token": DEMO_KIOSK_DEVICE_TOKEN,
    "idempotency-key": randomUUID(),
  };
  const response = await fixture.app.inject({
    method: "POST",
    url: "/api/v1/kiosk/sessions",
    headers,
    payload: { locale: "en-IN" },
  });
  expect(response.statusCode).toBe(201);
  const session = response.json();
  const mutate = (
    url: string,
    payload: unknown,
    key = randomUUID(),
    method: "POST" | "PATCH" = "POST",
  ) =>
    fixture.app.inject({
      method,
      url,
      headers: {
        authorization: `Bearer ${session.token}`,
        "idempotency-key": key,
      },
      payload: payload as object,
    });
  return { session, headers, mutate };
}
async function guestAndConsent(granted = true) {
  const opened = await open();
  const identity = await opened.mutate("/api/v1/kiosk/identity/start", {
    sessionId: opened.session.sessionId,
    method: "GUEST",
  });
  expect(identity.statusCode).toBe(201);
  const patientId = identity.json().patientId;
  const response = await opened.mutate("/api/v1/kiosk/consent", {
    sessionId: opened.session.sessionId,
    patientId,
    consentVersion: "1.1.0",
    locale: "en-IN",
    method: "TOUCH_CONFIRMED",
    decisions: [
      {
        purpose: "treatment",
        granted,
        categories: granted ? ["IDENTITY", "SYMPTOMS"] : [],
      },
      { purpose: "research", granted: false, categories: [] },
      { purpose: "analytics", granted: false, categories: [] },
    ],
  });
  expect(response.statusCode).toBe(201);
  return { ...opened, patientId, consent: response.json() };
}

describe("registered kiosk lifecycle", () => {
  it("replays an encrypted session response and rejects changed payloads", async () => {
    const { session, headers } = await open();
    const replay = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/kiosk/sessions",
      headers,
      payload: { locale: "en-IN" },
    });
    expect(replay.json()).toEqual(session);
    const changed = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/kiosk/sessions",
      headers,
      payload: { locale: "hi-IN" },
    });
    expect(changed.statusCode).toBe(409);
    const stored = await fixture.db
      .selectFrom("idempotency_keys")
      .select("responseJson")
      .execute();
    expect(stored.some((row) => row.responseJson.includes(session.token))).toBe(
      false,
    );
  });
  it("preserves patient and saved granular consent across locale change, then blocks revocation", async () => {
    const { session, mutate, patientId, consent } = await guestAndConsent();
    const scope = {
      tenantId: fixture.tenantId,
      patientId,
      sessionId: session.sessionId,
      purpose: "treatment",
      category: "SYMPTOMS",
      action: "CLINICAL_INTAKE",
      destination: "TREATING_HOSPITAL",
    };
    await expect(
      requireConsent(fixture.db, scope, TEST_NOW()),
    ).resolves.toBeUndefined();
    await expect(
      requireConsent(fixture.db, { ...scope, category: "VOICE" }, TEST_NOW()),
    ).rejects.toMatchObject({ code: "CONSENT_PURPOSE_NOT_PERMITTED" });
    const changed = await mutate(
      `/api/v1/kiosk/sessions/${session.sessionId}`,
      { locale: "hi-IN" },
      randomUUID(),
      "PATCH",
    );
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toMatchObject({
      patientId,
      locale: "hi-IN",
      consent: { id: consent.id, locale: "en-IN" },
    });
    const revoked = await mutate(`/api/v1/consent/${consent.id}/revoke`, {
      reason: "PATIENT_REQUEST",
    });
    expect(revoked.json()).toMatchObject({
      stopRequired: true,
      revokedAt: TEST_NOW().toISOString(),
    });
    await expect(
      requireConsent(fixture.db, scope, TEST_NOW()),
    ).rejects.toMatchObject({ code: "CONSENT_REVOKED" });
  });
  it("records decline as success without granting processing", async () => {
    const { session, patientId, consent } = await guestAndConsent(false);
    expect(consent.stopRequired).toBe(true);
    await expect(
      requireConsent(
        fixture.db,
        {
          tenantId: fixture.tenantId,
          patientId,
          sessionId: session.sessionId,
          purpose: "treatment",
          category: "IDENTITY",
          action: "CLINICAL_INTAKE",
          destination: "TREATING_HOSPITAL",
        },
        TEST_NOW(),
      ),
    ).rejects.toMatchObject({ code: "CONSENT_PURPOSE_NOT_PERMITTED" });
  });
  it("commits failed OTP attempts, replays each failure once, and bounds attempts", async () => {
    const { session, mutate } = await open();
    const started = await mutate("/api/v1/kiosk/identity/start", {
      sessionId: session.sessionId,
      method: "ABHA_QR",
    });
    const challengeId = started.json().challengeId;
    const key = randomUUID();
    for (let i = 0; i < 2; i++)
      expect(
        (
          await mutate(
            "/api/v1/kiosk/identity/verify",
            { challengeId, otp: "000000" },
            key,
          )
        ).statusCode,
      ).toBe(400);
    expect(
      (
        await fixture.db
          .selectFrom("identity_challenges")
          .select("attempts")
          .where("id", "=", challengeId)
          .executeTakeFirstOrThrow()
      ).attempts,
    ).toBe(1);
    for (let i = 0; i < 4; i++)
      await mutate("/api/v1/kiosk/identity/verify", {
        challengeId,
        otp: "000000",
      });
    expect(
      (
        await mutate("/api/v1/kiosk/identity/verify", {
          challengeId,
          otp: "123456",
        })
      ).statusCode,
    ).toBe(429);
  });
  it("verifies only synthetic identities and rejects arbitrary patient attachment", async () => {
    const { session, mutate } = await open();
    const started = await mutate("/api/v1/kiosk/identity/start", {
      sessionId: session.sessionId,
      method: "RETURNING",
    });
    const verified = await mutate("/api/v1/kiosk/identity/verify", {
      challengeId: started.json().challengeId,
      otp: "123456",
    });
    expect(verified.json()).toMatchObject({
      providerName: "mock",
      verified: true,
    });
    const response = await mutate("/api/v1/kiosk/consent", {
      sessionId: session.sessionId,
      patientId: "another-patient",
      consentVersion: "1.1.0",
      locale: "en-IN",
      method: "TOUCH_CONFIRMED",
      decisions: [],
    });
    expect(response.statusCode).toBe(404);
    expect(
      await fixture.db.selectFrom("external_identifiers").selectAll().execute(),
    ).toEqual([]);
  });
  it("wipes challenges and replay buffers but retains patients and audit", async () => {
    const { session, mutate } = await open();
    await mutate("/api/v1/kiosk/identity/start", {
      sessionId: session.sessionId,
      method: "ABHA_OTP",
    });
    const key = randomUUID();
    const response = await mutate(
      `/api/v1/kiosk/sessions/${session.sessionId}/wipe`,
      {},
      key,
    );
    expect(response.json()).toMatchObject({
      wiped: true,
      transientArtifactsDeleted: 0,
      identityChallengesDeleted: 1,
      clinicalRecordRetained: true,
    });
    expect(
      (
        await mutate(
          `/api/v1/kiosk/sessions/${session.sessionId}/wipe`,
          {},
          key,
        )
      ).json(),
    ).toEqual(response.json());
    expect(
      await fixture.db.selectFrom("identity_challenges").selectAll().execute(),
    ).toEqual([]);
    expect(
      (
        await fixture.app.inject({
          url: `/api/v1/kiosk/sessions/${session.sessionId}`,
          headers: { authorization: `Bearer ${session.token}` },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await fixture.db
          .selectFrom("audit_events")
          .selectAll()
          .where("action", "=", "SESSION_WIPED")
          .execute()
      ).length,
    ).toBe(1);
  });
  it("rejects expired sessions and clears their transient server state", async () => {
    let current = TEST_NOW();
    const { session, mutate } = await open(() => current);
    await mutate("/api/v1/kiosk/identity/start", {
      sessionId: session.sessionId,
      method: "ABHA_OTP",
    });
    current = new Date(current.getTime() + 46 * 60_000);
    const response = await fixture.app.inject({
      url: `/api/v1/kiosk/sessions/${session.sessionId}`,
      headers: { authorization: `Bearer ${session.token}` },
    });
    expect(response.statusCode).toBe(401);
  });
});
