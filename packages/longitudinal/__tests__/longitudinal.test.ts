/**
 * Unit tests for the deterministic longitudinal view: timeline assembly and what-changed diffing.
 */

import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  filterEvents,
  groupTimeline,
  compareEncounters,
  type EncounterSnapshot,
  type TimelineEventInput,
} from "../src/index";

const ev = (overrides: Partial<TimelineEventInput>): TimelineEventInput => ({
  eventType: "SYMPTOM_RECORDED",
  eventAt: "2026-03-04T09:00:00.000Z",
  headline: "Symptom recorded",
  source: "PATIENT_REPORTED",
  encounterId: "E1",
  patientId: "P1",
  ...overrides,
});

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

describe("buildTimeline", () => {
  it("orders ascending by eventAt", () => {
    const timeline = buildTimeline([
      ev({ eventAt: "2026-03-05" }),
      ev({ eventAt: "2026-03-04" }),
      ev({ eventAt: "2026-03-06" }),
    ]);
    expect(timeline.map((e) => e.eventAt)).toEqual([
      "2026-03-04",
      "2026-03-05",
      "2026-03-06",
    ]);
  });

  it("is stable on equal eventAt: ties keep their relative input order", () => {
    const inputs = [
      ev({ eventAt: "2026-03-04", headline: "a" }),
      ev({ eventAt: "2026-03-04", headline: "b" }),
      ev({ eventAt: "2026-03-04", headline: "c" }),
    ];
    expect(buildTimeline(inputs).map((e) => e.headline)).toEqual([
      "a",
      "b",
      "c",
    ]);
    // A stable sort preserves the relative order of equal keys — reversing the input must
    // therefore yield c,b,a (each key keeps its position relative to its equal peers).
    expect(buildTimeline([...inputs].reverse()).map((e) => e.headline)).toEqual(
      ["c", "b", "a"],
    );
    // And the same input is always reproducible.
    expect(buildTimeline([...inputs].reverse()).map((e) => e.headline)).toEqual(
      buildTimeline([...inputs].reverse()).map((e) => e.headline),
    );
  });

  it("is a pure function of its inputs", () => {
    const inputs = [
      ev({ eventAt: "2026-03-06" }),
      ev({ eventAt: "2026-03-04" }),
    ];
    const first = buildTimeline(inputs).map((e) => e.eventAt);
    const second = buildTimeline(inputs).map((e) => e.eventAt);
    expect(second).toEqual(first);
  });
});

describe("groupTimeline", () => {
  it("groups by groupKey with first/last eventAt and preserves key order", () => {
    const grouped = groupTimeline([
      ev({ groupKey: "ENC-2", eventAt: "2026-03-10", headline: "later" }),
      ev({ groupKey: "ENC-1", eventAt: "2026-03-04", headline: "first" }),
      ev({ groupKey: "ENC-1", eventAt: "2026-03-05", headline: "second" }),
      ev({ eventAt: "2026-03-06", headline: "ungrouped" }),
    ]);
    expect(grouped.events.map((e) => e.eventAt)).toEqual([
      "2026-03-04",
      "2026-03-05",
      "2026-03-06",
      "2026-03-10",
    ]);
    // ENC-1 appears first because its earliest event is earliest; key order is by first appearance.
    expect(grouped.grouped[0]?.groupKey).toBe("ENC-1");
    expect(grouped.grouped[0]?.firstEventAt).toBe("2026-03-04");
    expect(grouped.grouped[0]?.lastEventAt).toBe("2026-03-05");
    expect(grouped.grouped[0]?.events).toHaveLength(2);
    expect(grouped.grouped[1]?.groupKey).toBe("ENC-2");
  });

  it("places events without a groupKey in a trailing group", () => {
    const grouped = groupTimeline([ev({ eventAt: "2026-03-04" })]);
    expect(grouped.grouped).toHaveLength(1);
    expect(grouped.grouped[0]?.groupKey).toContain("ungrouped");
    expect(grouped.grouped[0]?.events).toHaveLength(1);
  });
});

describe("filterEvents", () => {
  const timeline = buildTimeline([
    ev({
      eventType: "SYMPTOM_RECORDED",
      eventAt: "2026-03-04",
      source: "PATIENT_REPORTED",
    }),
    ev({
      eventType: "LAB_RECORDED",
      eventAt: "2026-03-05",
      source: "DOCUMENT_DERIVED",
      headline: "lab",
    }),
    ev({
      eventType: "VITAL_RECORDED",
      eventAt: "2026-03-06",
      source: "VITAL_DERIVED",
    }),
  ]);

  it("filters by type", () => {
    expect(
      filterEvents(timeline, { types: ["LAB_RECORDED"] }).map(
        (e) => e.eventType,
      ),
    ).toEqual(["LAB_RECORDED"]);
  });

  it("filters by source", () => {
    expect(
      filterEvents(timeline, {
        source: ["PATIENT_REPORTED", "VITAL_DERIVED"],
      }).map((e) => e.eventType),
    ).toEqual(["SYMPTOM_RECORDED", "VITAL_RECORDED"]);
  });

  it("filters by inclusive time window", () => {
    expect(
      filterEvents(timeline, { from: "2026-03-04", to: "2026-03-05" }).map(
        (e) => e.eventType,
      ),
    ).toEqual(["SYMPTOM_RECORDED", "LAB_RECORDED"]);
  });

  it("returns everything when no filters are supplied", () => {
    expect(filterEvents(timeline)).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// What changed
// ---------------------------------------------------------------------------

const snapshot = (
  overrides: Partial<EncounterSnapshot> = {},
): EncounterSnapshot => ({
  complaintCodes: [],
  symptoms: [],
  medications: [],
  allergies: [],
  labs: [],
  vitals: {},
  documentCount: 0,
  ...overrides,
});

describe("compareEncounters — symptoms", () => {
  it("flags new, resolved and severity-changed symptoms", () => {
    const changes = compareEncounters(
      snapshot({
        symptoms: [
          { conceptCode: "MK-SYM-024", severity: "MODERATE" },
          { conceptCode: "MK-SYM-030", severity: "MILD" },
        ],
      }),
      snapshot({
        symptoms: [
          { conceptCode: "MK-SYM-024", severity: "SEVERE" },
          { conceptCode: "MK-SYM-002" },
        ],
      }),
    );
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "NEW_SYMPTOM",
          direction: "NEW",
          label: "MK-SYM-002",
        }),
        expect.objectContaining({
          kind: "RESOLVED_SYMPTOM",
          direction: "RESOLVED",
          label: "MK-SYM-030",
        }),
      ]),
    );
    // Severity change is emitted only when the symptom is present in both snapshots.
    const severity = changes.find(
      (c) => c.kind === "SEVERITY_CHANGED" && c.label === "MK-SYM-024",
    );
    expect(severity).toEqual(
      expect.objectContaining({
        direction: "WORSENED",
        previous: "MODERATE",
        current: "SEVERE",
      }),
    );
  });

  it("maps severity increase to WORSENED and decrease to IMPROVED", () => {
    const worsened = compareEncounters(
      snapshot({ symptoms: [{ conceptCode: "S", severity: "MILD" }] }),
      snapshot({ symptoms: [{ conceptCode: "S", severity: "SEVERE" }] }),
    );
    expect(worsened.find((c) => c.kind === "SEVERITY_CHANGED")).toEqual(
      expect.objectContaining({ direction: "WORSENED", label: "S" }),
    );

    const improved = compareEncounters(
      snapshot({ symptoms: [{ conceptCode: "S", severity: "SEVERE" }] }),
      snapshot({ symptoms: [{ conceptCode: "S", severity: "MILD" }] }),
    );
    expect(improved.find((c) => c.kind === "SEVERITY_CHANGED")).toEqual(
      expect.objectContaining({ direction: "IMPROVED", label: "S" }),
    );
  });

  it("skips a symptom whose severity is unchanged", () => {
    const changes = compareEncounters(
      snapshot({ symptoms: [{ conceptCode: "S", severity: "MODERATE" }] }),
      snapshot({ symptoms: [{ conceptCode: "S", severity: "MODERATE" }] }),
    );
    expect(changes.filter((c) => c.kind === "SEVERITY_CHANGED")).toHaveLength(
      0,
    );
  });
});

describe("compareEncounters — medications", () => {
  it("flags added, stopped and continued medications", () => {
    const changes = compareEncounters(
      snapshot({
        medications: [
          { conceptCode: "MK-MED-001", status: "CURRENT" },
          { conceptCode: "MK-MED-005", status: "CURRENT" },
        ],
      }),
      snapshot({
        medications: [
          { conceptCode: "MK-MED-001", status: "CURRENT" },
          { conceptCode: "MK-MED-017", status: "CURRENT" },
        ],
      }),
    );
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "MEDICATION_CONTINUED",
          direction: "UNCHANGED",
          label: "MK-MED-001",
        }),
        expect.objectContaining({
          kind: "MEDICATION_ADDED",
          direction: "NEW",
          label: "MK-MED-017",
        }),
        expect.objectContaining({
          kind: "MEDICATION_STOPPED",
          direction: "RESOLVED",
          label: "MK-MED-005",
        }),
      ]),
    );
  });
});

describe("compareEncounters — allergies", () => {
  it("flags added and resolved allergies", () => {
    const changes = compareEncounters(
      snapshot({ allergies: ["MK-ALG-001"] }),
      snapshot({ allergies: ["MK-ALG-002"] }),
    );
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "ALLERGY_ADDED",
          direction: "NEW",
          label: "MK-ALG-002",
        }),
        expect.objectContaining({
          kind: "ALLERGY_RESOLVED",
          direction: "RESOLVED",
          label: "MK-ALG-001",
        }),
      ]),
    );
  });
});

describe("compareEncounters — labs", () => {
  it("flags added and changed labs, directing abnormal current flags to WORSENED", () => {
    const changes = compareEncounters(
      snapshot({
        labs: [{ testCode: "MK-LAB-001", value: 11.2, flag: "LOW" }],
      }),
      snapshot({
        labs: [
          { testCode: "MK-LAB-001", value: 9.2, flag: "LOW" },
          { testCode: "MK-LAB-002", value: 140, flag: "HIGH" },
        ],
      }),
    );
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "LAB_ADDED",
          direction: "NEW",
          label: "MK-LAB-002",
        }),
        expect.objectContaining({
          kind: "LAB_CHANGED",
          direction: "WORSENED",
          label: "MK-LAB-001",
          previous: 11.2,
          current: 9.2,
        }),
      ]),
    );
  });

  it("directs a flag returning to normal as IMPROVED", () => {
    const changes = compareEncounters(
      snapshot({ labs: [{ testCode: "MK-LAB-001", value: 9.0, flag: "LOW" }] }),
      snapshot({
        labs: [{ testCode: "MK-LAB-001", value: 13.0, flag: "NORMAL" }],
      }),
    );
    expect(changes.find((c) => c.label === "MK-LAB-001")).toEqual(
      expect.objectContaining({ direction: "IMPROVED" }),
    );
  });

  it("skips an unchanged lab", () => {
    const changes = compareEncounters(
      snapshot({
        labs: [{ testCode: "MK-LAB-001", value: 13.0, flag: "NORMAL" }],
      }),
      snapshot({
        labs: [{ testCode: "MK-LAB-001", value: 13.0, flag: "NORMAL" }],
      }),
    );
    expect(changes.filter((c) => c.kind === "LAB_CHANGED")).toHaveLength(0);
  });
});

describe("compareEncounters — vitals", () => {
  it("flags new and changed vitals with higher-is-worse direction", () => {
    const changes = compareEncounters(
      snapshot({ vitals: { "MK-VIT-004": 95 } }), // SpO2: lower is worse
      snapshot({ vitals: { "MK-VIT-004": 90, "MK-VIT-002": 78 } }),
    );
    expect(changes).toEqual(
      expect.arrayContaining([
        // SpO2 dropped → worse.
        expect.objectContaining({
          kind: "VITAL_CHANGED",
          direction: "WORSENED",
          label: "MK-VIT-004",
        }),
        // New vital.
        expect.objectContaining({
          kind: "VITAL_CHANGED",
          direction: "NEW",
          label: "MK-VIT-002",
        }),
      ]),
    );
  });

  it("uses UNCHANGED direction for vital codes not in the canonical table (direction undetermined)", () => {
    const changes = compareEncounters(
      snapshot({ vitals: { "MK-VIT-099": 10 } }),
      snapshot({ vitals: { "MK-VIT-099": 20 } }),
    );
    expect(changes.find((c) => c.label === "MK-VIT-099")).toEqual(
      expect.objectContaining({ direction: "UNCHANGED" }),
    );
  });
});

describe("compareEncounters — complaints and evidence", () => {
  it("flags a repeated complaint as UNCHANGED", () => {
    const changes = compareEncounters(
      snapshot({ complaintCodes: ["MK-SYM-001"] }),
      snapshot({ complaintCodes: ["MK-SYM-001"] }),
    );
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "COMPLAINT_REPEATED",
          direction: "UNCHANGED",
          label: "MK-SYM-001",
        }),
      ]),
    );
  });

  it("attaches evidence ids via the injected mapping", () => {
    const changes = compareEncounters(
      snapshot({
        symptoms: [{ conceptCode: "MK-SYM-024", severity: "MILD" }],
        medications: [{ conceptCode: "MK-MED-001", status: "CURRENT" }],
      }),
      snapshot({
        symptoms: [{ conceptCode: "MK-SYM-024", severity: "SEVERE" }],
        medications: [{ conceptCode: "MK-MED-001", status: "CURRENT" }],
      }),
      (kind, code) => [`ev::${kind}::${code}`],
    );
    const severity = changes.find((c) => c.kind === "SEVERITY_CHANGED");
    expect(severity?.evidenceIds).toEqual(["ev::SEVERITY_CHANGED::MK-SYM-024"]);
    const med = changes.find((c) => c.kind === "MEDICATION_CONTINUED");
    expect(med?.evidenceIds).toEqual(["ev::MEDICATION_CONTINUED::MK-MED-001"]);
  });
});

// ---------------------------------------------------------------------------
// Demo fixture semantics (docs plan Pass 2 acceptance)
// ---------------------------------------------------------------------------

describe("demo fixture semantics", () => {
  const previous = snapshot({
    complaintCodes: ["MK-SYM-024"],
    symptoms: [{ conceptCode: "MK-SYM-024", severity: "MODERATE" }],
    medications: [
      { conceptCode: "MK-MED-001", status: "CURRENT", startedOn: "2026-03-04" },
    ],
    labs: [{ testCode: "MK-LAB-001", value: 11.2, flag: "LOW" }],
  });
  const current = snapshot({
    complaintCodes: ["MK-SYM-001"],
    symptoms: [
      { conceptCode: "MK-SYM-001", severity: "SEVERE" },
      { conceptCode: "MK-SYM-002" },
    ],
    medications: [], // patient reported none → no medication rows
    labs: [{ testCode: "MK-LAB-001", value: 9.2, flag: "LOW" }],
    vitals: { "MK-VIT-004": 93 },
  });

  it("metformin is CONTINUED when the current snapshot still reports it", () => {
    const withMed = snapshot({
      ...current,
      medications: [{ conceptCode: "MK-MED-001", status: "CURRENT" }],
    });
    const changes = compareEncounters(previous, withMed);
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "MEDICATION_CONTINUED",
          direction: "UNCHANGED",
          label: "MK-MED-001",
        }),
      ]),
    );
  });

  it("Hb worsening 11.2 -> 9.2 (both LOW) is WORSENED", () => {
    const changes = compareEncounters(
      previous,
      snapshot({ ...current, medications: [] }),
    );
    const hb = changes.filter((c) => c.label === "MK-LAB-001");
    expect(hb).toHaveLength(1);
    expect(hb[0]).toMatchObject({
      kind: "LAB_CHANGED",
      direction: "WORSENED",
      previous: 11.2,
      current: 9.2,
    });
  });

  it("dyspnoea is NEW and chest pain REPEATED", () => {
    // Chest pain (MK-SYM-001) is the repeated complaint: it was a complaint before and today.
    const previousWithChestPain = snapshot({
      ...previous,
      complaintCodes: ["MK-SYM-001"],
    });
    const changes = compareEncounters(
      previousWithChestPain,
      snapshot({ ...current, complaintCodes: ["MK-SYM-001", "MK-SYM-002"] }),
    );
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "COMPLAINT_REPEATED",
          direction: "UNCHANGED",
          label: "MK-SYM-001",
        }),
        expect.objectContaining({
          kind: "NEW_SYMPTOM",
          direction: "NEW",
          label: "MK-SYM-002",
        }),
      ]),
    );
  });

  it("severity change maps correctly", () => {
    const changes = compareEncounters(
      snapshot({ symptoms: [{ conceptCode: "S", severity: "MODERATE" }] }),
      snapshot({ symptoms: [{ conceptCode: "S", severity: "SEVERE" }] }),
    );
    expect(changes.find((c) => c.kind === "SEVERITY_CHANGED")).toMatchObject({
      direction: "WORSENED",
      previous: "MODERATE",
      current: "SEVERE",
    });
  });
});
