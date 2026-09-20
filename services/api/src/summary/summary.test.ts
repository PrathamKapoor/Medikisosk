/**
 * Clinical summary tests: the pure builder (fixed section order, provenance tags, honest empty
 * states, never a diagnosis) and generate-on-read persistence through the API.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  buildSummarySections,
  SUMMARY_SECTION_KEYS,
  type SummaryInput,
} from "./summary.builder";
import {
  openConsoleFixture,
  staffCall,
  staffLogin,
  submitFixture,
  type ConsoleFixture,
} from "../testing/console-fixtures";

const BASE: SummaryInput = {
  patient: {
    fullName: "Synthetic Patient",
    ageYears: 67,
    sex: "MALE",
    preferredLanguage: "hi-IN",
  },
  encounter: {
    id: "enc-1",
    chiefComplaintCodes: ["MK-SYM-001"],
    chiefComplaintCodesLabelled: [
      { code: "MK-SYM-001", display: "Chest pain" },
    ],
    chiefComplaintVerbatim: "seene mein dard",
    locale: "hi-IN",
    createdAt: "2026-09-17T10:00:00.000Z",
    submittedAt: "2026-09-17T10:30:00.000Z",
    patientConfirmedAt: "2026-09-17T10:25:00.000Z",
  },
  symptoms: [
    {
      label: "Chest pain",
      detail: 'severity SEVERE · "seene mein dard"',
      originClass: "PATIENT_REPORTED",
      verificationState: "UNVERIFIED",
    },
  ],
  conditions: [
    {
      label: "Hypertension",
      originClass: "PATIENT_REPORTED",
      verificationState: "UNVERIFIED",
    },
  ],
  medications: [
    {
      label: "Metformin 500 mg",
      detail: "BD · from document",
      originClass: "DOCUMENT_DERIVED",
      verificationState: "VERIFIED",
    },
  ],
  allergies: [],
  vitals: [
    {
      label: "Oxygen saturation",
      detail: "93 %",
      originClass: "PATIENT_REPORTED",
      verificationState: "UNVERIFIED",
    },
  ],
  labs: [
    {
      label: "Haemoglobin",
      detail: "9.2 g/dL (LOW)",
      originClass: "DOCUMENT_DERIVED",
      verificationState: "UNVERIFIED",
    },
  ],
  documents: [
    {
      documentType: "LAB_REPORT",
      status: "PATIENT_CONFIRMED",
      entities: [
        {
          kind: "LAB_RESULT",
          rawText: "Haemoglobin: 9.2 g/dL",
          verificationState: "UNVERIFIED",
        },
      ],
    },
  ],
  triage: {
    level: "RED",
    priority: "EMERGENCY",
    requiresHumanReview: true,
    explanation: "Chest pain with breathlessness.",
    hits: [
      {
        identifier: "CHEST_PAIN_HIGH_RISK_001",
        description: "Chest pain with shortness of breath",
        clinicalRationale: "Highest-acuity presentation.",
        severity: "RED",
      },
    ],
  },
  previousEncounters: [
    {
      id: "enc-0",
      createdAt: "2026-03-04T09:00:00.000Z",
      status: "COMPLETED",
      complaints: ["MK-SYM-024"],
      disposition: "FOLLOW_UP_OPD",
    },
  ],
  changes: [
    {
      kind: "NEW_SYMPTOM",
      direction: "NEW",
      label: "MK-SYM-001",
      evidenceIds: [],
    },
  ],
  notes: [
    {
      authorName: "Dr. Rao",
      note: "Review urgently.",
      createdAt: "2026-09-17T11:00:00.000Z",
    },
  ],
  diagnoses: [],
};

describe("deterministic summary builder", () => {
  it("renders the twelve sections in fixed order with provenance tags", () => {
    const sections = buildSummarySections(BASE);
    expect(sections.map((s) => s.sectionKey)).toEqual([
      ...SUMMARY_SECTION_KEYS,
    ]);
    const byKey = new Map(sections.map((s) => [s.sectionKey, s.text]));
    expect(byKey.get("CHIEF_COMPLAINT")).toContain("seene mein dard");
    expect(byKey.get("CHIEF_COMPLAINT")).toContain("PATIENT-REPORTED");
    expect(byKey.get("MEDICATIONS")).toContain("DOCUMENT_DERIVED");
    expect(byKey.get("ALLERGIES")).toContain("Not provided.");
    expect(byKey.get("SAFETY_SIGNALS")).toContain("not diagnoses");
    expect(byKey.get("SAFETY_SIGNALS")).toContain("CHEST_PAIN_HIGH_RISK_001");
    expect(byKey.get("LONGITUDINAL")).toContain("NEW_SYMPTOM");
    expect(byKey.get("CLINICIAN")).toContain("DOCTOR-AUTHORED");
  });

  it("is deterministic and states missing data honestly", () => {
    expect(buildSummarySections(BASE)).toEqual(buildSummarySections(BASE));
    const empty: SummaryInput = {
      ...BASE,
      symptoms: [],
      conditions: [],
      medications: [],
      vitals: [],
      labs: [],
      documents: [],
      triage: null,
      previousEncounters: [],
      changes: [],
      notes: [],
    };
    const byKey = new Map(
      buildSummarySections(empty).map((s) => [s.sectionKey, s.text]),
    );
    expect(byKey.get("SAFETY_SIGNALS")).toContain("No safety assessment");
    expect(byKey.get("LONGITUDINAL")).toContain("No previous encounters");
    expect(byKey.get("DOCUMENTS")).toContain("No documents");
  });
});

let opened: ConsoleFixture | undefined;
afterEach(async () => {
  await opened?.fixture.destroy();
  opened = undefined;
});

describe("summary endpoint", () => {
  it("generates the draft on first read and serves the stored version after", async () => {
    opened = await openConsoleFixture();
    await submitFixture(opened);
    const doctor = await staffLogin(opened.fixture, "dr.rao");
    const call = staffCall(opened.fixture, doctor);

    const first = await call(
      "GET",
      `/api/v1/encounters/${opened.encounterId}/summary`,
    );
    expect(first.status).toBe(200);
    const firstBody = first.json() as {
      summaryId: string;
      sections: { sectionKey: string; kind: string }[];
      verified: boolean;
    };
    expect(firstBody.sections.map((s) => s.sectionKey)).toEqual([
      ...SUMMARY_SECTION_KEYS,
    ]);
    expect(firstBody.verified).toBe(false);

    const second = await call(
      "GET",
      `/api/v1/encounters/${opened.encounterId}/summary`,
    );
    expect(second.status).toBe(200);
    expect((second.json() as { summaryId: string }).summaryId).toBe(
      firstBody.summaryId,
    );
    const audit = await opened.fixture.db
      .selectFrom("audit_events")
      .select("action")
      .where("tenantId", "=", opened.fixture.tenantId)
      .where("action", "=", "SUMMARY_GENERATED")
      .executeTakeFirst();
    expect(audit?.action).toBe("SUMMARY_GENERATED");
  });
});
