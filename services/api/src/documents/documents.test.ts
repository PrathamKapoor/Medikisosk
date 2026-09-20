/**
 * Document pipeline tests: demo fixtures, multipart upload validation, deterministic
 * mock-OCR extraction, patient confirmation → fact rows, and clinician verify/reject/edit.
 *
 * The honesty contract under test: unregistered bytes extract to zero entities with an explicit
 * UNRECOGNISED issue (never fabricated text), and executables are refused.
 */

import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildTestApp, TEST_NOW, type BuiltTestApp } from "../testing/test-app";
import { DEMO_KIOSK_DEVICE_TOKEN } from "../db/seed";

let fixture: BuiltTestApp;
afterEach(async () => {
  if (fixture) {
    // Uploaded bytes are content-addressed test artefacts; remove whatever this run wrote.
    try {
      const documents = await fixture.db
        .selectFrom("documents")
        .select("storagePath")
        .execute();
      for (const document of documents) {
        await unlink(
          join(fixture.config.MEDIKIOSK_UPLOAD_DIR, document.storagePath),
        ).catch(() => undefined);
      }
    } catch {
      // Best effort: a missing upload dir must not fail the suite.
    }
    await fixture.destroy();
  }
});

type Mutate = (
  url: string,
  payload?: unknown,
  key?: string,
  method?: "POST" | "PATCH" | "GET",
) => Promise<{ status: number; json: () => unknown }>;

async function kioskSession(): Promise<{
  session: Record<string, string>;
  mutate: Mutate;
  patientId: string;
  encounterId: string;
}> {
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
  const opened = await fixture.app.inject({
    method: "POST",
    url: "/api/v1/kiosk/sessions",
    headers,
    payload: { locale: "en-IN" },
  });
  expect(opened.statusCode).toBe(201);
  const session = opened.json() as Record<string, string>;
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
  expect(consent.status).toBe(201);
  const encounter = await mutate("/api/v1/encounters", {
    patientId,
    sessionId: session.sessionId,
    encounterType: "OPD",
    chiefComplaintCodes: ["MK-SYM-020"],
    chiefComplaintVerbatim: "bukhar hai",
    locale: "en-IN",
  });
  expect(encounter.status).toBe(201);
  const encounterId = (encounter.json() as { encounterId: string }).encounterId;
  return { session, mutate, patientId, encounterId };
}

async function staffToken(): Promise<string> {
  const response = await fixture.app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      tenantSlug: "demo-hospital",
      username: "dr.rao",
      password: "demo-pass-1234",
    },
  });
  expect(response.statusCode).toBe(200);
  return (response.json() as { token: string }).token;
}

const BOUNDARY = "medikiosk-test-boundary";

function multipartPayload(
  fields: Record<string, string>,
  file: { field: string; filename: string; mimeType: string; bytes: Buffer },
): Buffer {
  const parts: Buffer[] = [];
  const push = (value: string | Buffer) =>
    parts.push(typeof value === "string" ? Buffer.from(value, "utf8") : value);
  for (const [name, value] of Object.entries(fields)) {
    push(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    );
  }
  push(
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\nContent-Type: ${file.mimeType}\r\n\r\n`,
  );
  push(file.bytes);
  push(`\r\n--${BOUNDARY}--\r\n`);
  return Buffer.concat(parts);
}

async function uploadFile(
  token: string,
  encounterId: string,
  fields: Record<string, string>,
  file: { field: string; filename: string; mimeType: string; bytes: Buffer },
  key = randomUUID(),
): Promise<{ status: number; json: () => unknown }> {
  const response = await fixture.app.inject({
    method: "POST",
    url: `/api/v1/encounters/${encounterId}/documents`,
    headers: {
      authorization: `Bearer ${token}`,
      "idempotency-key": key,
      "content-type": `multipart/form-data; boundary=${BOUNDARY}`,
    },
    payload: multipartPayload(fields, file),
  });
  return { status: response.statusCode, json: () => response.json() };
}

describe("document pipeline", () => {
  it("lists the synthetic demo documents to an active kiosk session", async () => {
    const { mutate } = await kioskSession();
    const listed = await mutate(
      "/api/v1/demo-documents",
      undefined,
      randomUUID(),
      "GET",
    );
    expect(listed.status).toBe(200);
    const documents = listed.json() as { name: string; documentType: string }[];
    expect(documents.map((d) => d.name)).toContain("prescription-demo.txt");
    expect(documents.map((d) => d.name)).toContain("lab-report-sunita-demo.txt");
    expect(documents.length).toBe(6);
  });

  it("uploads a demo prescription, extracts medication entities, and confirms medication facts", async () => {
    const { session, mutate, encounterId } = await kioskSession();
    const demo = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/demo-documents/prescription-demo.txt",
      headers: { authorization: `Bearer ${session.token}` },
    });
    expect(demo.statusCode).toBe(200);
    const bytes = Buffer.from(demo.body, "utf8");

    const uploaded = await uploadFile(
      session.token,
      encounterId,
      { documentType: "PRESCRIPTION" },
      {
        field: "file",
        filename: "prescription-demo.txt",
        mimeType: "text/plain",
        bytes,
      },
    );
    expect(uploaded.status).toBe(201);
    const result = uploaded.json() as {
      documentId: string;
      status: string;
      demoExtraction: boolean;
      entities: {
        id: string;
        kind: string;
        rawText: string;
        confidence: number;
      }[];
    };
    expect(result.status).toBe("EXTRACTED");
    expect(result.demoExtraction).toBe(true);
    const kinds = result.entities.map((e) => e.kind);
    expect(kinds).toContain("MEDICATION");
    expect(kinds).toContain("PATIENT_NAME");
    const metformin = result.entities.find((e) => e.kind === "MEDICATION");
    expect(metformin?.rawText).toMatch(/Metformin 500 mg/i);

    // Re-uploading identical bytes returns the existing document (no duplicate row).
    const replay = await uploadFile(
      session.token,
      encounterId,
      { documentType: "PRESCRIPTION" },
      {
        field: "file",
        filename: "prescription-demo.txt",
        mimeType: "text/plain",
        bytes,
      },
    );
    expect(replay.status).toBe(200);
    const replayed = replay.json() as {
      documentId: string;
      alreadyExisted: boolean;
    };
    expect(replayed.documentId).toBe(result.documentId);
    expect(replayed.alreadyExisted).toBe(true);

    // Patient confirmation writes DOCUMENT_DERIVED fact rows, still UNVERIFIED.
    const confirmed = await mutate(
      `/api/v1/encounters/${encounterId}/documents/${result.documentId}/confirm`,
      {},
    );
    expect(confirmed.status).toBe(200);
    const confirming = confirmed.json() as {
      status: string;
      created: { medications: number };
    };
    expect(confirming.status).toBe("PATIENT_CONFIRMED");
    expect(confirming.created.medications).toBeGreaterThanOrEqual(1);
    const medication = await fixture.db
      .selectFrom("medications")
      .selectAll()
      .where("documentId", "=", result.documentId)
      .executeTakeFirstOrThrow();
    expect(medication.originClass).toBe("DOCUMENT_DERIVED");
    expect(medication.verificationState).toBe("UNVERIFIED");
    expect(medication.isPrescribed).toBe(1);

    // Clinician verification flips the entity and the fact row to VERIFIED.
    const token = await staffToken();
    const verified = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/documents/${result.documentId}/entities/${metformin!.id}/verify`,
      headers: { authorization: `Bearer ${token}` },
      payload: { action: "VERIFY" },
    });
    expect(verified.statusCode).toBe(200);
    expect(
      (verified.json() as { verificationState: string }).verificationState,
    ).toBe("VERIFIED");
    const fact = await fixture.db
      .selectFrom("medications")
      .selectAll()
      .where("id", "=", medication.id)
      .executeTakeFirstOrThrow();
    expect(fact.verificationState).toBe("VERIFIED");
    expect(fact.verifiedBy).toBeTruthy();
    const audit = await fixture.db
      .selectFrom("audit_events")
      .select("action")
      .where("tenantId", "=", fixture.tenantId)
      .where("action", "=", "FACT_VERIFIED")
      .executeTakeFirst();
    expect(audit?.action).toBe("FACT_VERIFIED");
  });

  it("extracts lab values from a demo report and recomputes flags on clinician edit", async () => {
    const { session, mutate, encounterId } = await kioskSession();
    const demo = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/demo-documents/lab-report-demo.txt",
      headers: { authorization: `Bearer ${session.token}` },
    });
    const bytes = Buffer.from(demo.body, "utf8");
    const uploaded = await uploadFile(
      session.token,
      encounterId,
      { documentType: "LAB_REPORT" },
      {
        field: "file",
        filename: "lab-report-demo.txt",
        mimeType: "text/plain",
        bytes,
      },
    );
    expect(uploaded.status).toBe(201);
    const result = uploaded.json() as {
      documentId: string;
      entities: { id: string; kind: string; testCode: string | null }[];
    };
    const haemoglobin = result.entities.find(
      (e) => e.kind === "LAB_RESULT" && e.testCode === "MK-LAB-001",
    );
    expect(haemoglobin).toBeTruthy();

    const confirmed = await mutate(
      `/api/v1/encounters/${encounterId}/documents/${result.documentId}/confirm`,
      {},
    );
    expect(confirmed.status).toBe(200);
    const lab = await fixture.db
      .selectFrom("lab_results")
      .selectAll()
      .where("documentId", "=", result.documentId)
      .where("testCode", "=", "MK-LAB-001")
      .executeTakeFirstOrThrow();
    expect(lab.value).toBe(9.2);
    expect(lab.flag).toBe("LOW");

    // Clinician corrects 9.2 → 13.5: a superseding entity + evidence, flag recomputed.
    const token = await staffToken();
    const edited = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/documents/${result.documentId}/entities/${haemoglobin!.id}/verify`,
      headers: { authorization: `Bearer ${token}` },
      payload: { action: "EDIT", correctedJson: { value: 13.5 } },
    });
    expect(edited.statusCode).toBe(200);
    const editResult = edited.json() as {
      entityId: string;
      supersedes: string;
      verificationState: string;
    };
    expect(editResult.supersedes).toBe(haemoglobin!.id);
    expect(editResult.verificationState).toBe("VERIFIED");
    const corrected = await fixture.db
      .selectFrom("lab_results")
      .selectAll()
      .where("documentId", "=", result.documentId)
      .where("testCode", "=", "MK-LAB-001")
      .executeTakeFirstOrThrow();
    expect(corrected.value).toBe(13.5);
    expect(corrected.flag).toBe("NORMAL");
    expect(corrected.verificationState).toBe("VERIFIED");
    const oldEntity = await fixture.db
      .selectFrom("document_entities")
      .selectAll()
      .where("id", "=", haemoglobin!.id)
      .executeTakeFirstOrThrow();
    expect(oldEntity.verificationState).toBe("CORRECTED");
  });

  it("extracts nothing from unrecognised bytes and says so (never fabricates)", async () => {
    const { session, encounterId } = await kioskSession();
    const uploaded = await uploadFile(
      session.token,
      encounterId,
      { documentType: "OTHER" },
      {
        field: "file",
        filename: "random-note.txt",
        mimeType: "text/plain",
        bytes: Buffer.from(
          "some random clinic note about parking fees",
          "utf8",
        ),
      },
    );
    expect(uploaded.status).toBe(201);
    const result = uploaded.json() as {
      entities: unknown[];
      ocrIssues: string[];
    };
    expect(result.entities).toEqual([]);
    expect(result.ocrIssues).toContain("UNRECOGNISED_SYNTHETIC_CONTENT");
  });

  it("refuses executable uploads regardless of claimed MIME type", async () => {
    const { session, encounterId } = await kioskSession();
    const uploaded = await uploadFile(
      session.token,
      encounterId,
      { documentType: "OTHER" },
      {
        field: "file",
        filename: "payload.exe",
        mimeType: "application/octet-stream",
        bytes: Buffer.from("MZ fake executable", "utf8"),
      },
    );
    expect(uploaded.status).toBe(415);
    const htmlUpload = await uploadFile(
      session.token,
      encounterId,
      { documentType: "OTHER" },
      {
        field: "file",
        filename: "note.html",
        mimeType: "text/html",
        bytes: Buffer.from("<script>alert(1)</script>", "utf8"),
      },
    );
    expect(htmlUpload.status).toBe(415);
  });

  it("rejects verification from kiosk sessions and allows the clinician console through", async () => {
    const { session, mutate, encounterId } = await kioskSession();
    const demo = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/demo-documents/prescription-demo.txt",
      headers: { authorization: `Bearer ${session.token}` },
    });
    const uploaded = await uploadFile(
      session.token,
      encounterId,
      { documentType: "PRESCRIPTION" },
      {
        field: "file",
        filename: "prescription-demo.txt",
        mimeType: "text/plain",
        bytes: Buffer.from(demo.body, "utf8"),
      },
    );
    const result = uploaded.json() as {
      documentId: string;
      entities: { id: string }[];
    };
    const kioskAttempt = await mutate(
      `/api/v1/documents/${result.documentId}/entities/${result.entities[0]!.id}/verify`,
      { action: "VERIFY" },
    );
    expect(kioskAttempt.status).toBe(401);

    const token = await staffToken();
    const doctor = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/documents/${result.documentId}/entities/${result.entities[0]!.id}/verify`,
      headers: { authorization: `Bearer ${token}` },
      payload: { action: "REJECT" },
    });
    expect(doctor.statusCode).toBe(200);
  });
});
