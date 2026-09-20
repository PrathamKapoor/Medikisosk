/**
 * Clinical console tests: queue ordering and transitions, patient search/record/timeline/compare,
 * the full case view, notes, diagnoses, disposition and encounter completion — plus the
 * authorization matrix (kiosk sessions rejected, role permissions enforced).
 */

import { afterEach, describe, expect, it } from "vitest";
import { DEMO_FIXTURES } from "../db/seed-demo-patient";
import {
  openConsoleFixture,
  staffCall,
  staffLogin,
  submitFixture,
  type ConsoleFixture,
} from "../testing/console-fixtures";

let opened: ConsoleFixture | undefined;
afterEach(async () => {
  await opened?.fixture.destroy();
  opened = undefined;
});

describe("clinical console", () => {
  it("lists the queue EMERGENCY-first and moves entries through call/start", async () => {
    opened = await openConsoleFixture();
    const submitted = await submitFixture(opened);
    expect(submitted.tokenNumber).toMatch(/^A-\d{3}$/);

    const doctor = await staffLogin(opened.fixture, "dr.rao");
    const call = staffCall(opened.fixture, doctor);
    const queue = await call("GET", "/api/v1/queue");
    expect(queue.status).toBe(200);
    const entries = (queue.json() as { entries: unknown[] }).entries;
    expect(entries.length).toBeGreaterThanOrEqual(1);
    const mine = entries.find(
      (e) =>
        (e as { encounter: { id: string } }).encounter.id ===
        opened!.encounterId,
    ) as {
      id: string;
      tokenNumber: string;
      priority: string;
      status: string;
      patient: { fullName: string };
      waitingMinutes: number;
    };
    expect(mine).toBeTruthy();
    expect(mine.tokenNumber).toBe(submitted.tokenNumber);
    expect(mine.patient.fullName).toBeTruthy();
    expect(mine.waitingMinutes).toBeGreaterThanOrEqual(0);

    const called = await call("POST", `/api/v1/queue/${mine.id}/call`);
    expect(called.status).toBe(200);
    expect((called.json() as { status: string }).status).toBe("CALLED");
    const started = await call("POST", `/api/v1/queue/${mine.id}/start`);
    expect(started.status).toBe(200);
    // An illegal backward transition is refused.
    const backward = await call("POST", `/api/v1/queue/${mine.id}/call`);
    expect(backward.status).toBe(409);
  });

  it("searches patients, reads the record and compares encounters", async () => {
    opened = await openConsoleFixture("MK-SYM-001", "seene mein dard");
    await submitFixture(opened);
    const doctor = await staffLogin(opened.fixture, "dr.rao");
    const call = staffCall(opened.fixture, doctor);

    // The seeded longitudinal patient is always present: search finds him by name.
    const search = await call("GET", "/api/v1/patients?query=Ramesh");
    expect(search.status).toBe(200);
    const patients = (search.json() as { patients: { id: string }[] }).patients;
    expect(patients.map((p) => p.id)).toContain(DEMO_FIXTURES.patientId);

    const record = await call("GET", `/api/v1/patients/${opened.patientId}`);
    expect(record.status).toBe(200);
    const body = record.json() as {
      encounters: { id: string }[];
      allergyStatus: unknown;
    };
    expect(body.encounters.map((e) => e.id)).toContain(opened.encounterId);

    const timeline = await call(
      "GET",
      `/api/v1/patients/${opened.patientId}/timeline`,
    );
    expect(timeline.status).toBe(200);
    const events = (timeline.json() as { events: { eventType: string }[] })
      .events;
    expect(events.map((e) => e.eventType)).toContain("ENCOUNTER_SUBMITTED");

    // Comparing an encounter with itself yields only COMPLAINT_REPEATED markers.
    const compare = await call(
      "GET",
      `/api/v1/patients/${opened.patientId}/compare?previous=${opened.encounterId}&current=${opened.encounterId}`,
    );
    expect(compare.status).toBe(200);
    const selfChanges = (compare.json() as { changes: { kind: string }[] })
      .changes;
    expect(selfChanges.length).toBeGreaterThan(0);
    expect(
      selfChanges.every((change) => change.kind === "COMPLAINT_REPEATED"),
    ).toBe(true);
  });

  it("reads the seeded two-visit story: history, changes and timeline", async () => {
    opened = await openConsoleFixture();
    const doctor = await staffLogin(opened.fixture, "dr.rao");
    const call = staffCall(opened.fixture, doctor);

    const record = await call(
      "GET",
      `/api/v1/patients/${DEMO_FIXTURES.patientId}`,
    );
    expect(record.status).toBe(200);
    const encounters = (
      record.json() as { encounters: { id: string; status: string }[] }
    ).encounters;
    expect(encounters.map((e) => e.id)).toEqual(
      expect.arrayContaining([
        DEMO_FIXTURES.previousEncounterId,
        DEMO_FIXTURES.currentEncounterId,
      ]),
    );

    const compare = await call(
      "GET",
      `/api/v1/patients/${DEMO_FIXTURES.patientId}/compare?previous=${DEMO_FIXTURES.previousEncounterId}&current=${DEMO_FIXTURES.currentEncounterId}`,
    );
    expect(compare.status).toBe(200);
    const changes = (
      compare.json() as { changes: { kind: string; label: string }[] }
    ).changes;
    const kinds = changes.map((c) => c.kind);
    expect(kinds).toContain("NEW_SYMPTOM");
    expect(kinds).toContain("RESOLVED_SYMPTOM");
    expect(kinds).toContain("LAB_CHANGED");
    const haemoglobin = changes.find((c) => c.label === "MK-LAB-001");
    expect(haemoglobin).toMatchObject({
      previous: 11.2,
      current: 9.2,
    });

    const timeline = await call(
      "GET",
      `/api/v1/patients/${DEMO_FIXTURES.patientId}/timeline`,
    );
    expect(timeline.status).toBe(200);
    const types = (
      timeline.json() as { events: { eventType: string }[] }
    ).events.map((e) => e.eventType);
    expect(types).toContain("ENCOUNTER_COMPLETED");

    // The seeded current intake opens in the case view with its previous visit attached.
    const kase = await call(
      "GET",
      `/api/v1/encounters/${DEMO_FIXTURES.currentEncounterId}/case`,
    );
    expect(kase.status).toBe(200);
    const longitudinal = (
      kase.json() as {
        longitudinal: {
          previousEncounters: { id: string }[];
          changesSincePrevious: unknown[];
        };
      }
    ).longitudinal;
    expect(longitudinal.previousEncounters.map((e) => e.id)).toContain(
      DEMO_FIXTURES.previousEncounterId,
    );
    expect(longitudinal.changesSincePrevious.length).toBeGreaterThan(0);
  });

  it("renders the full case view with separated provenance blocks and a summary", async () => {
    opened = await openConsoleFixture("MK-SYM-001", "seene mein dard");
    await submitFixture(opened);
    const doctor = await staffLogin(opened.fixture, "dr.rao");
    const call = staffCall(opened.fixture, doctor);

    const response = await call(
      "GET",
      `/api/v1/encounters/${opened.encounterId}/case`,
    );
    expect(response.status).toBe(200);
    const kase = response.json() as {
      patient: { fullName: string };
      complaints: { verbatim: string };
      patientReported: { symptoms: unknown[]; vitals: { value: number }[] };
      systemGenerated: {
        triage: { level: string } | null;
        evidence: unknown[];
      };
      longitudinal: {
        previousEncounters: unknown[];
        changesSincePrevious: unknown[];
      };
      doctorAuthored: { notes: unknown[]; diagnoses: unknown[] };
      queue: { tokenNumber: string } | null;
      summary: { sections: { sectionKey: string }[] };
    };
    expect(kase.patient.fullName).toBeTruthy();
    expect(kase.complaints.verbatim).toBe("seene mein dard");
    expect(kase.patientReported.vitals.length).toBe(2);
    expect(kase.systemGenerated.triage).toBeTruthy();
    expect(kase.systemGenerated.evidence.length).toBeGreaterThan(0);
    expect(kase.queue?.tokenNumber).toMatch(/^A-\d{3}$/);
    expect(kase.summary.sections.map((s) => s.sectionKey)).toContain(
      "SAFETY_SIGNALS",
    );
    // A fresh guest has no previous visits: the strip is honestly empty.
    expect(kase.longitudinal.previousEncounters).toEqual([]);
  });

  it("records notes, diagnoses and disposition, then completes the encounter", async () => {
    opened = await openConsoleFixture();
    await submitFixture(opened);
    const doctor = await staffLogin(opened.fixture, "dr.rao");
    const call = staffCall(opened.fixture, doctor);

    const note = await call(
      "POST",
      `/api/v1/encounters/${opened.encounterId}/notes`,
      { note: "Patient counselled on fever care and hydration." },
    );
    expect(note.status).toBe(200);

    const diagnosis = await call(
      "POST",
      `/api/v1/encounters/${opened.encounterId}/diagnoses`,
      { displayText: "Viral fever", status: "PROVISIONAL" },
    );
    expect(diagnosis.status).toBe(200);

    const disposition = await call(
      "POST",
      `/api/v1/encounters/${opened.encounterId}/disposition`,
      { disposition: "DISCHARGE_HOME" },
    );
    expect(disposition.status).toBe(200);

    const completed = await call(
      "POST",
      `/api/v1/encounters/${opened.encounterId}/complete`,
    );
    expect(completed.status).toBe(200);
    expect((completed.json() as { status: string }).status).toBe("COMPLETED");

    // Completion lands the encounter in history and clears the active queue.
    const record = await call("GET", `/api/v1/patients/${opened.patientId}`);
    const statuses = (
      record.json() as { encounters: { status: string }[] }
    ).encounters.map((e) => e.status);
    expect(statuses).toContain("COMPLETED");
    const queue = await call("GET", "/api/v1/queue");
    const mine = (
      queue.json() as { entries: { encounter: { id: string } }[] }
    ).entries.filter((e) => e.encounter.id === opened!.encounterId);
    expect(mine).toEqual([]);

    // A second completion is refused; the case view shows the authored blocks.
    const again = await call(
      "POST",
      `/api/v1/encounters/${opened.encounterId}/complete`,
    );
    expect(again.status).toBe(409);
    const kase = await call(
      "GET",
      `/api/v1/encounters/${opened.encounterId}/case`,
    );
    const authored = (
      kase.json() as {
        doctorAuthored: { notes: unknown[]; diagnoses: unknown[] };
      }
    ).doctorAuthored;
    expect(authored.notes.length).toBe(1);
    expect(authored.diagnoses.length).toBe(1);
  });

  it("enforces the authorization matrix", async () => {
    opened = await openConsoleFixture();
    // A kiosk session token is not staff: console endpoints reject it.
    const kioskQueue = await opened.mutate(
      "/api/v1/queue",
      undefined,
      "kiosk-queue-key",
      "GET",
    );
    expect(kioskQueue.status).toBe(401);

    // ADMIN reads aggregates and audit but cannot open clinical cases.
    const admin = await staffLogin(opened.fixture, "admin.patil");
    const adminCall = staffCall(opened.fixture, admin);
    const overview = await adminCall("GET", "/api/v1/admin/overview");
    expect(overview.status).toBe(200);
    const adminCase = await adminCall(
      "GET",
      `/api/v1/encounters/${opened.encounterId}/case`,
    );
    expect(adminCase.status).toBe(403);

    // TRIAGE can move the queue but ADMIN (no triage.update, no clinical read) is
    // locked out of disposition and cases, while PHYSICIAN can record both.
    await submitFixture(opened);
    const adminDisposition = await adminCall(
      "POST",
      `/api/v1/encounters/${opened.encounterId}/disposition`,
      { disposition: "FOLLOW_UP_OPD" },
    );
    expect(adminDisposition.status).toBe(403);
    const doctor = await staffLogin(opened.fixture, "dr.rao");
    const doctorDisposition = await staffCall(opened.fixture, doctor)(
      "POST",
      `/api/v1/encounters/${opened.encounterId}/disposition`,
      { disposition: "FOLLOW_UP_OPD" },
    );
    expect(doctorDisposition.status).toBe(200);
  });
});
