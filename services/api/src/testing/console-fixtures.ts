/**
 * Shared fixtures for the clinical-console and admin API tests.
 *
 * Opens a kiosk session, registers a guest identity, grants treatment consent and opens an
 * encounter — then optionally fast-forwards it to SUBMITTED by answering every question UNKNOWN
 * (terminal), recording vitals, confirming the review and submitting. The fast path keeps
 * console tests focused on the console, while still exercising the real intake spine.
 */

import { randomUUID } from "node:crypto";
import { buildTestApp, TEST_NOW, type BuiltTestApp } from "./test-app";
import { DEMO_KIOSK_DEVICE_TOKEN } from "../db/seed";

export type ConsoleMutate = (
  url: string,
  payload?: unknown,
  key?: string,
  method?: "POST" | "PATCH" | "GET",
) => Promise<{ status: number; json: () => unknown }>;

export interface ConsoleFixture {
  readonly fixture: BuiltTestApp;
  readonly session: { sessionId: string; token: string };
  readonly patientId: string;
  readonly encounterId: string;
  readonly mutate: ConsoleMutate;
}

export async function openConsoleFixture(
  complaintCode = "MK-SYM-020",
  verbatim = "bukhar hai",
): Promise<ConsoleFixture> {
  const fixture = await buildTestApp({ now: TEST_NOW });
  const kiosk = await fixture.db
    .selectFrom("kiosks")
    .selectAll()
    .where("tenantId", "=", fixture.tenantId)
    .executeTakeFirstOrThrow();
  const opened = await fixture.app.inject({
    method: "POST",
    url: "/api/v1/kiosk/sessions",
    headers: {
      "x-kiosk-id": kiosk.id,
      "x-kiosk-token": DEMO_KIOSK_DEVICE_TOKEN,
      "idempotency-key": randomUUID(),
    },
    payload: { locale: "en-IN" },
  });
  if (opened.statusCode !== 201)
    throw new Error(`session open failed: ${opened.statusCode}`);
  const session = opened.json() as { sessionId: string; token: string };
  const mutate: ConsoleMutate = (
    url,
    payload,
    key = randomUUID(),
    method = "POST",
  ) =>
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
  if (identity.status !== 201)
    throw new Error(`identity failed: ${identity.status}`);
  const patientId = (identity.json() as { patientId: string }).patientId;
  const consent = await mutate("/api/v1/kiosk/consent", {
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
  if (consent.status !== 201)
    throw new Error(`consent failed: ${consent.status}`);
  const encounter = await mutate("/api/v1/encounters", {
    patientId,
    sessionId: session.sessionId,
    encounterType: "OPD",
    chiefComplaintCodes: [complaintCode],
    chiefComplaintVerbatim: verbatim,
    locale: "en-IN",
  });
  if (encounter.status !== 201)
    throw new Error(`encounter failed: ${encounter.status}`);
  const encounterId = (encounter.json() as { encounterId: string }).encounterId;
  return { fixture, session, patientId, encounterId, mutate };
}

/**
 * Fast-forward an encounter to SUBMITTED (unknown answers, demo vitals, review, confirm).
 * Returns the submit body (queueEntryId, tokenNumber, triageLevel, priority).
 */
export async function submitFixture(
  opened: ConsoleFixture,
): Promise<Record<string, string>> {
  const { fixture, mutate, encounterId } = opened;
  void fixture;
  for (let step = 0; step < 120; step++) {
    const next = await mutate(
      `/api/v1/encounters/${encounterId}/interview/next`,
      undefined,
      randomUUID(),
      "GET",
    );
    if (next.status !== 200) throw new Error(`next failed: ${next.status}`);
    const body = next.json() as { question: { key: string } | null };
    if (!body.question) break;
    const response = await mutate(
      `/api/v1/encounters/${encounterId}/interview/response`,
      {
        questionKey: body.question.key,
        state: "UNKNOWN",
        modality: "TOUCH",
      },
    );
    if (response.status !== 201)
      throw new Error(`respond failed: ${response.status}`);
  }
  const vitals = await mutate(`/api/v1/encounters/${encounterId}/vitals`, {
    vitals: [
      { code: "MK-VIT-002", value: 82, unit: "beats/min" },
      { code: "MK-VIT-004", value: 98, unit: "%" },
    ],
  });
  if (vitals.status !== 201) throw new Error(`vitals failed: ${vitals.status}`);
  const review = await mutate(
    `/api/v1/encounters/${encounterId}/review`,
    undefined,
    randomUUID(),
    "GET",
  );
  if (review.status !== 200) throw new Error(`review failed: ${review.status}`);
  const confirm = await mutate(`/api/v1/encounters/${encounterId}/confirm`, {});
  if (confirm.status !== 200)
    throw new Error(`confirm failed: ${confirm.status}`);
  const submit = await mutate(`/api/v1/encounters/${encounterId}/submit`, {});
  if (submit.status !== 200) throw new Error(`submit failed: ${submit.status}`);
  return submit.json() as Record<string, string>;
}

export async function staffLogin(
  fixture: BuiltTestApp,
  username: string,
): Promise<string> {
  const response = await fixture.app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      tenantSlug: "demo-hospital",
      username,
      password: "demo-pass-1234",
    },
  });
  if (response.statusCode !== 200)
    throw new Error(`staff login failed: ${response.statusCode}`);
  return (response.json() as { token: string }).token;
}

/** Authenticated staff inject helper (console requests carry no idempotency keys). */
export function staffCall(fixture: BuiltTestApp, token: string) {
  return (
    method: "GET" | "POST",
    url: string,
    payload?: unknown,
  ): Promise<{ status: number; json: () => unknown }> =>
    fixture.app
      .inject({
        method,
        url,
        headers: { authorization: `Bearer ${token}` },
        ...(method === "GET" ? {} : { payload: payload as object }),
      })
      .then((r) => ({ status: r.statusCode, json: () => r.json() }));
}
