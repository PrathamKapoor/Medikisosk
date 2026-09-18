/**
 * Unit tests for the evidence provenance graph and contradiction detectors.
 */

import { describe, expect, it } from "vitest";
import {
  buildEvidenceGraph,
  groupEvidenceByFact,
  renderTrace,
  detectMedicationContradictions,
  detectAllergyContradictions,
  detectLabDeltas,
} from "../src/index";

// ---------------------------------------------------------------------------
// Trace assembly
// ---------------------------------------------------------------------------

describe("renderTrace", () => {
  it("assembles source → fact → assessments in tiered order", () => {
    const trace = renderTrace({
      source: {
        kind: "QUESTIONNAIRE_RESPONSE",
        label: "q.chest_pain.safety_dyspnoea",
        evidenceId: "ev-1",
        timestamp: "2026-09-18T10:00:00.000Z",
        confidence: 0.71,
      },
      fact: {
        kind: "SYMPTOM",
        label: "MK-SYM-002",
        evidenceId: "ev-1",
      },
      assessments: [
        {
          kind: "TRIAGE_HIT",
          label: "CHEST_PAIN_HIGH_RISK_001",
          evidenceId: "ev-1",
        },
        { kind: "PHYSICIAN_NOTE", label: "Reviewed", evidenceId: "ev-9" },
      ],
    });
    expect(trace.map((n) => n.tier)).toEqual([
      "SOURCE",
      "FACT",
      "ASSESSMENT",
      "ASSESSMENT",
    ]);
    expect(trace[0]).toMatchObject({
      tier: "SOURCE",
      kind: "QUESTIONNAIRE_RESPONSE",
      evidenceId: "ev-1",
    });
    expect(trace[1]).toMatchObject({
      tier: "FACT",
      kind: "SYMPTOM",
      label: "MK-SYM-002",
    });
    expect(trace[2]).toMatchObject({
      tier: "ASSESSMENT",
      label: "CHEST_PAIN_HIGH_RISK_001",
    });
  });

  it("survives an empty assessments list", () => {
    const trace = renderTrace({
      source: { kind: "QUESTIONNAIRE_RESPONSE", label: "q.x" },
      fact: { kind: "SYMPTOM", label: "S" },
      assessments: [],
    });
    expect(trace.map((n) => n.tier)).toEqual(["SOURCE", "FACT"]);
  });
});

describe("buildEvidenceGraph", () => {
  it("builds nodes and source→fact, fact→assessment edges", () => {
    const trace = renderTrace({
      source: {
        kind: "QUESTIONNAIRE_RESPONSE",
        label: "q.x",
        evidenceId: "ev-1",
      },
      fact: { kind: "SYMPTOM", label: "S", evidenceId: "ev-1" },
      assessments: [
        { kind: "TRIAGE_HIT", label: "R1" },
        { kind: "TRIAGE_HIT", label: "R2" },
      ],
    });
    const graph = buildEvidenceGraph(trace);
    expect(graph.nodes).toHaveLength(4);
    expect(graph.nodes[0]?.id).toBe("evidence:ev-1");
    expect(graph.edges).toEqual([
      { from: "evidence:ev-1", to: "evidence:ev-1" },
      { from: "evidence:ev-1", to: "ASSESSMENT:2" },
      { from: "evidence:ev-1", to: "ASSESSMENT:3" },
    ]);
  });
});

describe("groupEvidenceByFact", () => {
  it("groups evidence rows by the ids their facts reference", () => {
    const grouped = groupEvidenceByFact(
      [{ evidenceId: "ev-1" }, { evidenceId: "ev-2" }, { evidenceId: "ev-3" }],
      {
        "MK-SYM-001": ["ev-1", "ev-2"],
        "MK-SYM-002": ["ev-3", "ev-missing"],
      },
    );
    expect(grouped["MK-SYM-001"]!.map((e) => e.evidenceId)).toEqual([
      "ev-1",
      "ev-2",
    ]);
    expect(grouped["MK-SYM-002"]!.map((e) => e.evidenceId)).toEqual(["ev-3"]);
    expect(grouped["MK-SYM-002"]).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Medication contradictions
// ---------------------------------------------------------------------------

describe("detectMedicationContradictions", () => {
  it("flags CRITICAL when the patient reports no medications but the record holds an active drug", () => {
    const candidates = detectMedicationContradictions(
      [],
      [{ code: "MK-MED-001", name: "Metformin", status: "CURRENT" }],
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!).toMatchObject({
      kind: "MEDICATION",
      severity: "CRITICAL",
    });
  });

  it("flags WARNING when the patient currently reports a documented-discontinued drug", () => {
    const candidates = detectMedicationContradictions(
      [{ code: "MK-MED-001", status: "CURRENT" }],
      [{ code: "MK-MED-001", name: "Metformin", status: "DISCONTINUED" }],
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!).toMatchObject({ severity: "WARNING" });
  });

  it("flags INFO overlap when both sources hold the same active drug", () => {
    const candidates = detectMedicationContradictions(
      [{ code: "MK-MED-001", status: "CURRENT" }],
      [{ code: "MK-MED-001", status: "CURRENT" }],
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!).toMatchObject({
      kind: "MEDICATION",
      severity: "INFO",
    });
  });

  it("emits no candidates when statements agree", () => {
    expect(detectMedicationContradictions([], [])).toHaveLength(0);
  });

  it("never decides which source is correct (always produces both statements)", () => {
    const [candidate] = detectMedicationContradictions(
      [],
      [{ code: "MK-MED-001", status: "CURRENT" }],
    );
    expect(candidate?.statementA.kind).toBe("PATIENT_REPORTED");
    expect(candidate?.statementB.kind).toBe("DOCUMENT_DERIVED");
  });
});

// ---------------------------------------------------------------------------
// Allergy contradictions
// ---------------------------------------------------------------------------

describe("detectAllergyContradictions", () => {
  it("flags WARNING when the patient reports none but the record holds an allergy", () => {
    const candidates = detectAllergyContradictions(true, [
      { name: "Penicillin", severity: "SEVERE" },
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!).toMatchObject({
      kind: "ALLERGY",
      severity: "WARNING",
    });
  });

  it("flags nothing when the patient does not report none", () => {
    expect(
      detectAllergyContradictions(false, [{ name: "Penicillin" }]),
    ).toHaveLength(0);
  });

  it("flags nothing when both agree there are no allergies", () => {
    expect(detectAllergyContradictions(true, [])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Lab deltas
// ---------------------------------------------------------------------------

describe("detectLabDeltas", () => {
  it("flags a material delta and preserves both values", () => {
    const candidates = detectLabDeltas(
      [{ testCode: "MK-LAB-001", value: 11.2, flag: "LOW" }],
      [{ testCode: "MK-LAB-001", value: 9.2, flag: "LOW" }],
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      kind: "LAB",
      statementA: { value: 11.2 },
      statementB: { value: 9.2 },
    });
  });

  it("flags CRITICAL when the current flag crosses into the critical range", () => {
    const candidates = detectLabDeltas(
      [{ testCode: "MK-LAB-001", value: 10, flag: "LOW" }],
      [{ testCode: "MK-LAB-001", value: 6, flag: "CRITICAL_LOW" }],
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.severity).toBe("CRITICAL");
  });

  it("flags a flag change into abnormal as CRITICAL", () => {
    const candidates = detectLabDeltas(
      [{ testCode: "MK-LAB-001", value: 13, flag: "NORMAL" }],
      [{ testCode: "MK-LAB-001", value: 9, flag: "LOW" }],
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.severity).toBe("CRITICAL");
  });

  it("flags a recovery toward normal as WARNING", () => {
    const candidates = detectLabDeltas(
      [{ testCode: "MK-LAB-001", value: 9, flag: "LOW" }],
      [{ testCode: "MK-LAB-001", value: 13, flag: "NORMAL" }],
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.severity).toBe("WARNING");
  });

  it("respects the threshold", () => {
    expect(
      detectLabDeltas(
        [{ testCode: "MK-LAB-001", value: 10, flag: "NORMAL" }],
        [{ testCode: "MK-LAB-001", value: 10.1, flag: "NORMAL" }],
        1,
      ),
    ).toHaveLength(0);
  });

  it("emits nothing for identical labs", () => {
    expect(
      detectLabDeltas(
        [{ testCode: "MK-LAB-001", value: 10, flag: "NORMAL" }],
        [{ testCode: "MK-LAB-001", value: 10, flag: "NORMAL" }],
      ),
    ).toHaveLength(0);
  });
});
