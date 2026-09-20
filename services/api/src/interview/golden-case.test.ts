/**
 * Golden end-to-end interview journey (docs/PHASE-3-PLAN.md §9).
 *
 * Drives the full contract: kiosk session → guest identity → consent → encounter → every
 * interview response → completion → submit, then asserts the derived clinical record (immutable
 * raw responses, evidence pointers, symptom SOCRATES slots carrying evidence ids, triage RED via
 * CHEST_PAIN_HIGH_RISK_001, queue EMERGENCY, SUBMITTED/COMPLETED, audit trail) and replay
 * idempotency on submit.
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

async function openSession() {
  fixture = await buildTestApp({ now: TEST_NOW });
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
  const session = response.json() as Record<string, string>;
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
  return { session, mutate };
}

async function guestAndConsent(granted = true): Promise<{
  session: Record<string, string>;
  patientId: string;
  mutate: Mutate;
}> {
  const opened = await openSession();
  const identity = await opened.mutate("/api/v1/kiosk/identity/start", {
    sessionId: opened.session.sessionId,
    method: "GUEST",
  });
  expect(identity.status).toBe(201);
  const patientId = (identity.json() as { patientId: string }).patientId;
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
  expect(response.status).toBe(201);
  return { session: opened.session, patientId, mutate: opened.mutate };
}

/** Answers for the chest-pain golden journey; anything unlisted is answered UNKNOWN (terminal). */
const ANSWERS: Record<string, string> = {
  "q.chest_pain.safety_dyspnoea": "haan saans phool rahi hai",
  "q.chest_pain.safety_sweating": "nahi",
  "q.chest_pain.safety_syncope": "nahi",
  "q.chest_pain.safety_cardiac_history": "nahi",
  "q.chest_pain.site": "q.chest_pain.site.opt.left",
  "q.chest_pain.onset": "2 hours",
  "q.chest_pain.character": "q.chest_pain.character.opt.pressure",
  "q.chest_pain.radiation": "q.chest_pain.radiation.opt.left_arm",
  "q.chest_pain.associated": "q.chest_pain.associated.opt.sweating",
  "q.chest_pain.timing": "q.chest_pain.timing.opt.exertional",
  "q.chest_pain.severity": "q.chest_pain.severity.opt.severe",
  "q.chest_pain.exertion": "haan",
  "q.chest_pain.relief": "q.chest_pain.relief.opt.rest",
  "q.history.medications": "metformin",
  "q.history.allergies": "nahi",
  "q.history.smoking": "q.history.smoking.opt.never",
  "q.history.tobacco_chewing": "q.history.tobacco_chewing.opt.never",
  "q.history.ros": "q.history.ros.opt.none",
};

describe("golden interview journey", () => {
  it("walks chest pain to completion, submits RED/EMERGENCY, and persists the evidence spine", async () => {
    const { session, patientId, mutate } = await guestAndConsent();

    const create = await mutate("/api/v1/encounters", {
      patientId,
      sessionId: session.sessionId,
      encounterType: "OPD",
      chiefComplaintCodes: ["MK-SYM-001"],
      chiefComplaintVerbatim: "seene mein dard kal se",
      locale: "en-IN",
    });
    expect(create.status).toBe(201);
    const created = create.json() as {
      encounterId: string;
      status: string;
      activePathways: string[];
      interviewSessionId: string;
    };
    expect(created).toMatchObject({
      status: "IN_PROGRESS",
      interviewSessionId: expect.any(String),
    });
    expect(created.activePathways).toContain("PATH-CHEST-PAIN");
    const encounterId = created.encounterId;

    const nextUrl = `/api/v1/encounters/${encounterId}/interview/next`;
    const first = (
      await mutate(nextUrl, undefined, undefined, "GET")
    ).json() as {
      question: { key: string; category: string };
    };
    expect(first.question.key).toBe("q.chest_pain.safety_dyspnoea");
    expect(first.question.category).toBe("SAFETY_CRITICAL");

    const order: string[] = [];
    let safetyDyspnoeaResponse:
      | { state: string; advisories: unknown[]; nextQuestionKey: string }
      | undefined;
    let guard = 0;
    for (;;) {
      const info = (
        await mutate(nextUrl, undefined, undefined, "GET")
      ).json() as {
        question: { key: string } | null;
      };
      if (info.question === null) break;
      const key = info.question.key;
      order.push(key);
      const answer = ANSWERS[key];
      const payload =
        answer === undefined
          ? { questionKey: key, state: "UNKNOWN", modality: "TOUCH" }
          : {
              questionKey: key,
              state: "ANSWERED",
              rawAnswer: answer,
              modality: "TOUCH",
            };
      const response = await mutate(
        `/api/v1/encounters/${encounterId}/interview/response`,
        payload,
      );
      expect(response.status).toBe(201);
      const body = response.json() as {
        state: string;
        advisories: unknown[];
        nextQuestionKey: string | null;
      };
      if (key === "q.chest_pain.safety_dyspnoea") {
        safetyDyspnoeaResponse = {
          state: body.state,
          advisories: body.advisories,
          nextQuestionKey: body.nextQuestionKey ?? "",
        };
      }
      if (++guard > 40) throw new Error("interview did not terminate");
    }

    // Deterministic ordering: safety-critical chest pain first; the exertional branch appears
    // only after dyspnoea was answered YES.
    expect(order[0]).toBe("q.chest_pain.safety_dyspnoea");
    expect(order.indexOf("q.chest_pain.safety_dyspnoea")).toBeLessThan(
      order.indexOf("q.chest_pain.safety_sweating"),
    );
    expect(order).toContain("q.chest_pain.exertion");
    expect(order.indexOf("q.chest_pain.exertion")).toBeGreaterThan(
      order.indexOf("q.chest_pain.safety_dyspnoea"),
    );

    // Dyspnoea YES: ANSWERED, escalation advisory, next = sweating.
    expect(safetyDyspnoeaResponse).toMatchObject({
      state: "ANSWERED",
      nextQuestionKey: "q.chest_pain.safety_sweating",
    });
    const advisoryKeys = (safetyDyspnoeaResponse?.advisories ?? []).map(
      (a) => (a as { key: string }).key,
    );
    expect(advisoryKeys).toContain("ESC-CHEST-PAIN-001");

    // The review gate: submission is refused until the patient confirms the assembled record.
    const prematureKey = randomUUID();
    const premature = await mutate(
      `/api/v1/encounters/${encounterId}/submit`,
      {},
      prematureKey,
    );
    expect(premature.status).toBe(409);
    expect(
      (premature.json() as { error?: { code?: string } }).error?.code,
    ).toBe("PATIENT_CONFIRMATION_REQUIRED");

    const confirm = await mutate(
      `/api/v1/encounters/${encounterId}/confirm`,
      {},
      randomUUID(),
    );
    expect(confirm.status).toBe(200);

    // Submit.
    const submitKey = randomUUID();
    const submit = await mutate(
      `/api/v1/encounters/${encounterId}/submit`,
      {},
      submitKey,
    );
    expect(submit.status).toBe(200);
    const submitted = submit.json() as {
      status: string;
      triageLevel: string;
      priority: string;
      queueEntryId: string;
      tokenNumber: string | null;
    };
    expect(submitted).toMatchObject({
      status: "READY_FOR_REVIEW",
      triageLevel: "RED",
      priority: "EMERGENCY",
    });
    expect(submitted.queueEntryId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(submitted.tokenNumber).toMatch(/^A-\d{3}$/);

    // ----- DB assertions -----
    const db = fixture.db;
    const responses = await db
      .selectFrom("questionnaire_responses")
      .selectAll()
      .where("encounterId", "=", encounterId)
      .orderBy("askCount", "asc")
      .execute();
    const dyspnoeaRow = responses.find(
      (r) => r.questionKey === "q.chest_pain.safety_dyspnoea",
    );
    expect(dyspnoeaRow?.rawAnswer).toBe("haan saans phool rahi hai");
    expect(dyspnoeaRow?.normalisedJson).toBeTruthy();
    expect(dyspnoeaRow?.negated).toBe(0);
    // Immutable raw: the raw text is preserved verbatim.
    for (const row of responses) {
      if (row.rawAnswer !== null) expect(typeof row.rawAnswer).toBe("string");
      expect(row.askCount).toBeGreaterThanOrEqual(1);
    }

    // Evidence rows point at response ids (one evidence row per answered response).
    const evidence = await db
      .selectFrom("evidence")
      .selectAll()
      .where("encounterId", "=", encounterId)
      .execute();
    const responseIds = new Set(responses.map((r) => r.id));
    expect(evidence.length).toBe(responses.length);
    for (const ev of evidence) {
      expect(ev.type).toBe("QUESTIONNAIRE_RESPONSE");
      expect(ev.source).toBe("questionnaire_response");
      expect(ev.originClass).toBe("PATIENT_REPORTED");
      expect(ev.verificationState).toBe("UNVERIFIED");
      expect(ev.sourceRef).toBeTruthy();
      expect(responseIds.has(ev.sourceRef as string)).toBe(true);
    }
    const evidenceIds = evidence.map((e) => e.id);

    // Symptom rows exist with SOCRATES slots carrying evidence ids.
    const symptoms = await db
      .selectFrom("symptoms")
      .selectAll()
      .where("encounterId", "=", encounterId)
      .execute();
    const chestPain = symptoms.find((s) => s.conceptCode === "MK-SYM-001");
    expect(chestPain).toBeTruthy();
    const socrates = JSON.parse(chestPain!.socratesJson) as Record<
      string,
      { evidenceIds?: string[] }
    >;
    expect(Object.keys(socrates).length).toBeGreaterThan(0);
    const slotEvidence = Object.values(socrates).flatMap(
      (s) => s.evidenceIds ?? [],
    );
    expect(slotEvidence.length).toBeGreaterThan(0);
    for (const id of slotEvidence) expect(evidenceIds).toContain(id);
    expect(symptoms.some((s) => s.conceptCode === "MK-SYM-002")).toBe(true);

    // Triage assessment with the high-risk chest-pain hit.
    const assessment = await db
      .selectFrom("triage_assessments")
      .selectAll()
      .where("encounterId", "=", encounterId)
      .execute();
    expect(assessment.length).toBeGreaterThan(0);
    const latest = assessment[assessment.length - 1]!;
    expect(latest.level).toBe("RED");
    expect(latest.priority).toBe("EMERGENCY");
    expect(latest.hitsJson).toContain("CHEST_PAIN_HIGH_RISK_001");

    // Encounter submitted, interview session completed.
    const encounter = await db
      .selectFrom("encounters")
      .selectAll()
      .where("id", "=", encounterId)
      .executeTakeFirstOrThrow();
    expect(encounter.status).toBe("SUBMITTED");
    expect(encounter.submittedAt).toBeTruthy();
    const interviewSession = await db
      .selectFrom("interview_sessions")
      .selectAll()
      .where("encounterId", "=", encounterId)
      .executeTakeFirstOrThrow();
    expect(interviewSession.status).toBe("COMPLETED");
    expect(interviewSession.completedAt).toBeTruthy();

    // Queue entry EMERGENCY.
    const queue = await db
      .selectFrom("queue_entries")
      .selectAll()
      .where("encounterId", "=", encounterId)
      .executeTakeFirstOrThrow();
    expect(queue.priority).toBe("EMERGENCY");
    expect(queue.status).toBe("WAITING");

    // Audit trail.
    const actions = (
      await db
        .selectFrom("audit_events")
        .select("action")
        .where("encounterId", "=", encounterId)
        .execute()
    ).map((a) => a.action);
    for (const action of [
      "ENCOUNTER_CREATED",
      "INTERVIEW_STARTED",
      "FACT_EXTRACTED",
      "ENCOUNTER_SUBMITTED",
      "TRIAGE_TRIGGERED",
    ])
      expect(actions).toContain(action);

    // Replay submit with the SAME key returns the same body; a different key is rejected 409.
    const replay = await mutate(
      `/api/v1/encounters/${encounterId}/submit`,
      {},
      submitKey,
    );
    expect(replay.status).toBe(200);
    expect(replay.json()).toEqual(submitted);
    const otherKey = await mutate(
      `/api/v1/encounters/${encounterId}/submit`,
      {},
      randomUUID(),
    );
    expect(otherKey.status).toBe(409);
    expect((otherKey.json() as { error: { code: string } }).error.code).toBe(
      "ENCOUNTER_ALREADY_SUBMITTED",
    );

    // interview/next after submit is rejected.
    const afterSubmit = await mutate(nextUrl, undefined, undefined, "GET");
    expect(afterSubmit.status).toBe(409);
  });
});
