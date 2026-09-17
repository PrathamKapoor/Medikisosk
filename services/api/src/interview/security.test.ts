/**
 * Interview runtime — security tests.
 *
 * Cross-session access, session expiry, consent revocation mid-interview, and the active-question
 * gate (QUESTION_NOT_ACTIVE / QUESTION_ALREADY_COMPLETED). All flow through the real HTTP app via
 * `buildTestApp` (in-memory SQLite + seeds + frozen clock).
 */

import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { buildTestApp, TEST_NOW, type BuiltTestApp } from "../testing/test-app";
import { DEMO_KIOSK_DEVICE_TOKEN } from "../db/seed";

let fixture: BuiltTestApp;
afterEach(async () => {
  await fixture?.destroy();
});

type Mutate = (
  url: string,
  payload?: unknown,
  key?: string,
  method?: "POST" | "PATCH" | "GET",
) => Promise<{ status: number; json: () => unknown }>;

interface Setup {
  session: { sessionId: string; token: string };
  patientId: string;
  mutate: Mutate;
  consentId: string;
  encounterId: string;
}

/** Open a session, guest identity, grant consent, and create a chest-pain encounter. */
async function setup(now: () => Date = TEST_NOW): Promise<Setup> {
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
  const opened = await fixture.app.inject({
    method: "POST",
    url: "/api/v1/kiosk/sessions",
    headers,
    payload: { locale: "en-IN" },
  });
  expect(opened.statusCode).toBe(201);
  const session = opened.json() as { sessionId: string; token: string };
  const mutate: Mutate = (url, payload, key = randomUUID(), method = "POST") =>
    fixture.app
      .inject({
        method,
        url,
        headers: {
          authorization: `Bearer ${session.token}`,
          "idempotency-key": key,
        },
        ...(method === "GET" ? {} : { payload: payload as object }),
      })
      .then((r) => ({ status: r.statusCode, json: () => r.json() }));

  const identity = await mutate("/api/v1/kiosk/identity/start", {
    sessionId: session.sessionId,
    method: "GUEST",
  });
  expect(identity.status).toBe(201);
  const patientId = (identity.json() as { patientId: string }).patientId;
  const consentResponse = await mutate("/api/v1/kiosk/consent", {
    sessionId: session.sessionId,
    patientId,
    consentVersion: "1.1.0",
    locale: "en-IN",
    method: "TOUCH_CONFIRMED",
    decisions: [
      {
        purpose: "treatment",
        granted: true,
        categories: ["IDENTITY", "SYMPTOMS"],
      },
      { purpose: "research", granted: false, categories: [] },
      { purpose: "analytics", granted: false, categories: [] },
    ],
  });
  expect(consentResponse.status).toBe(201);
  const consentId = (consentResponse.json() as { id: string }).id;

  const create = await mutate("/api/v1/encounters", {
    patientId,
    sessionId: session.sessionId,
    encounterType: "OPD",
    chiefComplaintCodes: ["MK-SYM-001"],
    locale: "en-IN",
  });
  expect(create.status).toBe(201);
  const encounterId = (create.json() as { encounterId: string }).encounterId;
  return { session, patientId, mutate, consentId, encounterId };
}

function errorCode(body: unknown): string {
  return (body as { error: { code: string } }).error.code;
}

describe("interview runtime security", () => {
  it("rejects cross-session read and respond with 404", async () => {
    const a = await setup();
    const b = await setup();
    // B reads A's encounter → not owned → 404.
    const read = await b.mutate(
      `/api/v1/encounters/${a.encounterId}`,
      undefined,
      undefined,
      "GET",
    );
    expect(read.status).toBe(404);
    // B responds to A's encounter → not owned → 404.
    const respond = await b.mutate(
      `/api/v1/encounters/${a.encounterId}/interview/response`,
      {
        questionKey: "q.chest_pain.safety_dyspnoea",
        state: "ANSWERED",
        rawAnswer: "haan",
        modality: "TOUCH",
      },
    );
    expect(respond.status).toBe(404);
  });

  it("returns SESSION_EXPIRED when the session has lapsed", async () => {
    let current = TEST_NOW();
    const a = await setup(() => current);
    await a.mutate(`/api/v1/encounters/${a.encounterId}/interview/response`, {
      questionKey: "q.chest_pain.safety_dyspnoea",
      state: "ANSWERED",
      rawAnswer: "haan saans phool rahi hai",
      modality: "TOUCH",
    });
    current = new Date(current.getTime() + 46 * 60_000);
    const next = await a.mutate(
      `/api/v1/encounters/${a.encounterId}/interview/next`,
      undefined,
      undefined,
      "GET",
    );
    expect(next.status).toBe(401);
    expect(errorCode(next.json())).toBe("SESSION_EXPIRED");
  });

  it("blocks response and submit with CONSENT_REVOKED after mid-interview revocation", async () => {
    const a = await setup();
    await a.mutate(`/api/v1/encounters/${a.encounterId}/interview/response`, {
      questionKey: "q.chest_pain.safety_dyspnoea",
      state: "ANSWERED",
      rawAnswer: "haan saans phool rahi hai",
      modality: "TOUCH",
    });
    const revoke = await a.mutate(`/api/v1/consent/${a.consentId}/revoke`, {
      reason: "PATIENT_REQUEST",
    });
    expect(revoke.status).toBe(200);
    const respond = await a.mutate(
      `/api/v1/encounters/${a.encounterId}/interview/response`,
      {
        questionKey: "q.chest_pain.safety_sweating",
        state: "ANSWERED",
        rawAnswer: "nahi",
        modality: "TOUCH",
      },
    );
    expect(respond.status).toBe(403);
    expect(errorCode(respond.json())).toBe("CONSENT_REVOKED");
    const submit = await a.mutate(
      `/api/v1/encounters/${a.encounterId}/submit`,
      {},
    );
    expect(submit.status).toBe(403);
    expect(errorCode(submit.json())).toBe("CONSENT_REVOKED");
  });

  it("rejects an unknown / inactive question with QUESTION_NOT_ACTIVE", async () => {
    const a = await setup();
    const respond = await a.mutate(
      `/api/v1/encounters/${a.encounterId}/interview/response`,
      {
        questionKey: "q.nonexistent.question",
        state: "ANSWERED",
        rawAnswer: "x",
        modality: "TOUCH",
      },
    );
    expect(respond.status).toBe(400);
    expect(errorCode(respond.json())).toBe("QUESTION_NOT_ACTIVE");
  });

  it("rejects re-answering a terminal question with QUESTION_ALREADY_COMPLETED", async () => {
    const a = await setup();
    const first = await a.mutate(
      `/api/v1/encounters/${a.encounterId}/interview/response`,
      {
        questionKey: "q.chest_pain.safety_dyspnoea",
        state: "ANSWERED",
        rawAnswer: "haan saans phool rahi hai",
        modality: "TOUCH",
      },
    );
    expect(first.status).toBe(201);
    const second = await a.mutate(
      `/api/v1/encounters/${a.encounterId}/interview/response`,
      {
        questionKey: "q.chest_pain.safety_dyspnoea",
        state: "ANSWERED",
        rawAnswer: "nahi",
        modality: "TOUCH",
      },
      randomUUID(),
    );
    expect(second.status).toBe(409);
    expect(errorCode(second.json())).toBe("QUESTION_ALREADY_COMPLETED");
  });
});
