import { describe, expect, it } from "vitest";
import {
  mapEncounterBundle,
  validateBundle,
  assertValidBundle,
  type ExportCase,
  type FhirBundle,
} from "../src/index";

const BASE: ExportCase = {
  generatedAt: "2026-09-17T12:00:00.000Z",
  patient: {
    id: "01JPATIENT0000000000000001",
    fullName: "Synthetic Patient",
    dateOfBirth: "1959-03-14",
    sex: "MALE",
    preferredLanguage: "hi-IN",
    phoneMasked: "XXXXXX3210",
  },
  encounter: {
    id: "01JENCOUNTER0000000000000001",
    status: "finished",
    startedAt: "2026-09-17T10:00:00.000Z",
    endedAt: "2026-09-17T10:30:00.000Z",
    chiefComplaintCodes: ["MK-SYM-001"],
    chiefComplaintVerbatim: "seene mein dard",
    classDisplay: "ambulatory",
  },
  vitals: [
    {
      id: "vit-1",
      code: "MK-VIT-004",
      display: "Oxygen saturation",
      value: 93,
      unit: "%",
      effectiveAt: "2026-09-17T10:05:00.000Z",
    },
  ],
  labs: [
    {
      id: "lab-1",
      code: "MK-LAB-001",
      display: "Haemoglobin",
      value: 9.2,
      unit: "g/dL",
      effectiveAt: "2026-09-17T10:05:00.000Z",
    },
  ],
  conditions: [
    {
      id: "cond-1",
      code: "MK-COND-001",
      display: "Hypertension",
      clinicalStatus: "active",
      recordedAt: "2026-09-17T10:00:00.000Z",
    },
  ],
  symptoms: [
    {
      id: "sym-1",
      code: "MK-SYM-001",
      display: "Chest pain",
      clinicalStatus: "active",
      recordedAt: "2026-09-17T10:00:00.000Z",
    },
  ],
  medications: [
    {
      id: "med-1",
      code: "MK-MED-001",
      display: "Metformin 500 mg",
      dosageText: "1 tablet twice daily",
      status: "active",
      effectiveStart: "2026-03-04",
    },
  ],
  allergies: [
    {
      id: "alg-1",
      code: "MK-ALG-001",
      display: "Penicillin",
      reactionText: "rash",
      severity: "MODERATE",
    },
  ],
  documents: [
    {
      id: "doc-1",
      documentType: "PRESCRIPTION",
      mimeType: "text/plain",
      created: "2026-09-17T10:00:00.000Z",
      status: "current",
    },
  ],
};

describe("FHIR encounter bundle mapping", () => {
  it("maps a complete case into a valid collection bundle with fixed resource order", () => {
    const bundle = mapEncounterBundle(BASE);
    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.type).toBe("collection");
    expect(bundle.timestamp).toBe(BASE.generatedAt);
    const types = bundle.entry.map((entry) => entry.resource.resourceType);
    expect(types[0]).toBe("Patient");
    expect(types[1]).toBe("Encounter");
    expect(types).toContain("Observation");
    expect(types).toContain("Condition");
    expect(types).toContain("MedicationStatement");
    expect(types).toContain("AllergyIntolerance");
    expect(types).toContain("DocumentReference");
    expect(validateBundle(bundle)).toEqual([]);
    expect(() => assertValidBundle(bundle)).not.toThrow();
  });

  it("is deterministic: identical input produces identical output", () => {
    expect(mapEncounterBundle(BASE)).toEqual(mapEncounterBundle(BASE));
  });

  it("tags the bundle as a demo export representation", () => {
    const bundle = mapEncounterBundle(BASE);
    const meta = bundle.meta as { tag: { code: string }[] };
    expect(meta.tag[0]!.code).toBe("demo-export");
    const patient = bundle.entry[0]!.resource as Record<string, unknown>;
    const patientMeta = patient.meta as { tag: { code: string }[] };
    expect(patientMeta.tag[0]!.code).toBe("demo-export");
  });

  it("wires every reference inside the bundle", () => {
    const bundle = mapEncounterBundle(BASE);
    const ids = new Set(
      bundle.entry.map(
        (entry) => `${entry.resource.resourceType}/${entry.resource.id}`,
      ),
    );
    for (const entry of bundle.entry) {
      for (const field of ["subject", "patient", "encounter"]) {
        const value = (entry.resource as Record<string, unknown>)[field] as
          { reference?: string } | undefined;
        if (value?.reference) expect(ids.has(value.reference)).toBe(true);
      }
    }
  });

  it("maps sex and language; a guest patient without a name still validates", () => {
    const guest: ExportCase = {
      ...BASE,
      patient: {
        ...BASE.patient,
        fullName: null,
        sex: null,
        phoneMasked: null,
      },
    };
    const bundle = mapEncounterBundle(guest);
    const patient = bundle.entry[0]!.resource as Record<string, unknown>;
    expect(patient.gender).toBe("unknown");
    expect(patient.name).toBeUndefined();
    expect(validateBundle(bundle)).toEqual([]);
  });

  it("validator reports unresolved references and missing integration resources", () => {
    const bundle = mapEncounterBundle(BASE);
    const broken: FhirBundle = {
      ...bundle,
      entry: bundle.entry.slice(0, 3).map((entry, index) =>
        index === 1
          ? {
              fullUrl: entry.fullUrl,
              resource: {
                resourceType: entry.resource.resourceType,
                id: entry.resource.id,
                subject: { reference: "Patient/missing" },
              },
            }
          : entry,
      ),
    };
    const issues = validateBundle(broken);
    expect(
      issues.some((issue) => issue.problem.includes("does not resolve")),
    ).toBe(true);
  });
});
