/**
 * Administration tests: live-derived overview metrics, the kiosk fleet table with
 * device-authenticated heartbeat, the audit log, system health, and the FHIR demo export.
 */

import { afterEach, describe, expect, it } from "vitest";
import { DEMO_KIOSK_DEVICE_TOKEN } from "../db/seed";
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

describe("administration", () => {
  it("derives overview metrics from live data", async () => {
    opened = await openConsoleFixture();
    await submitFixture(opened);
    const admin = await staffLogin(opened.fixture, "admin.patil");
    const overview = await staffCall(opened.fixture, admin)(
      "GET",
      "/api/v1/admin/overview",
    );
    expect(overview.status).toBe(200);
    const body = overview.json() as {
      encountersToday: number;
      submittedToday: number;
      waiting: number;
      averageIntakeMinutes: number | null;
      languageDistribution: Record<string, number>;
      complaintDistribution: Record<string, number>;
      demoDataIncluded: boolean;
    };
    expect(body.encountersToday).toBeGreaterThanOrEqual(1);
    expect(body.submittedToday).toBeGreaterThanOrEqual(1);
    expect(body.waiting).toBeGreaterThanOrEqual(1);
    expect(body.averageIntakeMinutes).not.toBeNull();
    expect(body.languageDistribution["en-IN"]).toBeGreaterThanOrEqual(1);
    expect(body.demoDataIncluded).toBe(true);
  });

  it("lists the kiosk fleet and records device heartbeats", async () => {
    opened = await openConsoleFixture();
    const admin = await staffLogin(opened.fixture, "admin.patil");
    const call = staffCall(opened.fixture, admin);

    const fleet = await call("GET", "/api/v1/admin/kiosks");
    expect(fleet.status).toBe(200);
    const kiosks = (
      fleet.json() as { kiosks: { id: string; name: string; status: string }[] }
    ).kiosks;
    expect(kiosks.length).toBeGreaterThanOrEqual(3);
    const statuses = new Map(kiosks.map((k) => [k.name, k.status]));
    // Session activity just happened, so the Block A kiosk reads Online; the demo fleet
    // shows every state.
    expect(statuses.get("OPD Block A Kiosk 2")).toBe("Online");
    expect(statuses.get("OPD Block B Kiosk 1")).toBe("Offline");
    expect(statuses.get("Emergency Kiosk 1")).toBe("Maintenance");

    const kioskId = kiosks.find((k) => k.name === "OPD Block A Kiosk 2")!.id;
    const heartbeat = await opened.fixture.app.inject({
      method: "POST",
      url: `/api/v1/admin/kiosks/${kioskId}/heartbeat`,
      headers: {
        "x-kiosk-id": kioskId,
        "x-kiosk-token": DEMO_KIOSK_DEVICE_TOKEN,
      },
    });
    expect(heartbeat.statusCode).toBe(200);
    const badHeartbeat = await opened.fixture.app.inject({
      method: "POST",
      url: `/api/v1/admin/kiosks/${kioskId}/heartbeat`,
      headers: { "x-kiosk-id": kioskId, "x-kiosk-token": "wrong-token" },
    });
    expect(badHeartbeat.statusCode).toBe(401);
  });

  it("serves the audit trail and system health", async () => {
    opened = await openConsoleFixture();
    await submitFixture(opened);
    const admin = await staffLogin(opened.fixture, "admin.patil");
    const call = staffCall(opened.fixture, admin);

    const audit = await call("GET", "/api/v1/admin/audit?limit=10");
    expect(audit.status).toBe(200);
    const events = (audit.json() as { events: { action: string }[] }).events;
    expect(events.length).toBeGreaterThan(0);
    expect(events.length).toBeLessThanOrEqual(10);

    const filtered = await call(
      "GET",
      "/api/v1/admin/audit?action=ENCOUNTER_SUBMITTED",
    );
    expect(filtered.status).toBe(200);
    expect(
      (filtered.json() as { events: { action: string }[] }).events.every(
        (e) => e.action === "ENCOUNTER_SUBMITTED",
      ),
    ).toBe(true);

    const health = await call("GET", "/api/v1/system/health");
    expect(health.status).toBe(200);
    const body = health.json() as {
      status: string;
      checks: {
        database: string;
        documentProcessor: { status: string };
      };
    };
    expect(body.checks.database).toBe("ok");
    expect(body.checks.documentProcessor.status).toContain("MOCKED");
  });

  it("exports a valid FHIR bundle labelled as a demo representation", async () => {
    opened = await openConsoleFixture();
    await submitFixture(opened);
    const doctor = await staffLogin(opened.fixture, "dr.rao");
    const exported = await staffCall(opened.fixture, doctor)(
      "GET",
      `/api/v1/encounters/${opened.encounterId}/fhir`,
    );
    expect(exported.status).toBe(200);
    const body = exported.json() as {
      demoExport: boolean;
      bundle: {
        resourceType: string;
        entry: { resource: { resourceType: string } }[];
      };
    };
    expect(body.demoExport).toBe(true);
    expect(body.bundle.resourceType).toBe("Bundle");
    const types = body.bundle.entry.map((e) => e.resource.resourceType);
    expect(types[0]).toBe("Patient");
    expect(types[1]).toBe("Encounter");
    const persisted = await opened.fixture.db
      .selectFrom("fhir_resources")
      .selectAll()
      .where("encounterId", "=", opened.encounterId)
      .executeTakeFirst();
    expect(persisted?.resourceType).toBe("Bundle");

    // The seeded history exports too.
    const seeded = await staffCall(opened.fixture, doctor)(
      "GET",
      `/api/v1/encounters/${DEMO_FIXTURES.currentEncounterId}/fhir`,
    );
    expect(seeded.status).toBe(200);
  });

  it("keeps clinical data away from the admin role and strangers away from admin", async () => {
    opened = await openConsoleFixture();
    const admin = await staffLogin(opened.fixture, "admin.patil");
    const adminCall = staffCall(opened.fixture, admin);
    const summary = await adminCall(
      "GET",
      `/api/v1/encounters/${opened.encounterId}/summary`,
    );
    expect(summary.status).toBe(403);
    const kioskOverview = await opened.mutate(
      "/api/v1/admin/overview",
      undefined,
      "kiosk-overview-key",
      "GET",
    );
    expect(kioskOverview.status).toBe(401);
  });
});
