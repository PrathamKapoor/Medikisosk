/**
 * Unit tests for the deterministic triage engine (`evaluateTriage`).
 *
 * The safety engine is the single triage authority (ADR-009). These tests pin
 * the exact rule outcomes the demo story and clinical safety rely on:
 *
 *   - chest pain + dyspnoea -> RED  (CHEST_PAIN_HIGH_RISK_001)
 *   - chest pain alone      -> GREEN  (no rule fires on one symptom)
 *   - SpO2 < 92             -> RED  (HYPOXIA_001)
 *   - SpO2 93               -> AMBER (HYPOXIA_002)
 *   - systolic < 90         -> RED  (HYPOTENSION_001)
 *   - unresolved safety Q   -> GREEN, but requiresHumanReview (DATA_INCOMPLETE)
 *
 * Determinism is asserted explicitly: identical inputs must yield identical outputs.
 */
import { describe, it, expect, assert } from "vitest";
import { evaluateTriage } from "../assess";
import type { RuleEvaluationInput } from "../types";

/** Minimal helper: every field defaulted so tests focus on the case under test. */
function input(
  overrides: Partial<RuleEvaluationInput> = {},
): RuleEvaluationInput {
  return {
    symptomCodes: [],
    symptomFacts: [],
    vitalFacts: [],
    labFacts: [],
    conditionCodes: [],
    medicationCodes: [],
    allergyCodes: [],
    safetyCriticalUnresolvedQuestionKeys: [],
    answeredYesQuestionKeys: [],
    documentCount: 0,
    ...overrides,
  };
}

describe("evaluateTriage — determinism", () => {
  it("produces identical results for identical input", () => {
    const a = evaluateTriage(
      input({ symptomCodes: ["MK-SYM-001", "MK-SYM-002"] }),
    );
    const b = evaluateTriage(
      input({ symptomCodes: ["MK-SYM-001", "MK-SYM-002"] }),
    );
    expect(a).toEqual(b);
  });
});

describe("evaluateTriage — no findings", () => {
  it("an empty encounter is GREEN and does not require human review", () => {
    const result = evaluateTriage(input());
    expect(result.level).toBe("GREEN");
    expect(result.priority).toBe("ROUTINE");
    expect(result.requiresHumanReview).toBe(false);
    expect(result.hits).toHaveLength(0);
  });
});

describe("evaluateTriage — chest pain", () => {
  it("chest pain + dyspnoea is RED (CHEST_PAIN_HIGH_RISK_001)", () => {
    const result = evaluateTriage(
      input({
        symptomCodes: ["MK-SYM-001", "MK-SYM-002"],
        symptomFacts: [
          { code: "MK-SYM-001", negated: false },
          { code: "MK-SYM-002", negated: false },
        ],
      }),
    );
    expect(result.level).toBe("RED");
    expect(result.priority).toBe("EMERGENCY");
    expect(result.requiresHumanReview).toBe(true);
    const hit = result.hits.find(
      (h) => h.ruleIdentifier === "CHEST_PAIN_HIGH_RISK_001",
    );
    assert(hit, "expected CHEST_PAIN_HIGH_RISK_001 to fire");
    expect(hit.severity).toBe("RED");
    expect(hit.evidenceRefs).toEqual(
      expect.arrayContaining(["MK-SYM-001", "MK-SYM-002"]),
    );
    expect(hit.advisoryOnly).toBe(false);
  });

  it("chest pain alone is GREEN — one symptom triggers no rule", () => {
    const result = evaluateTriage(
      input({
        symptomCodes: ["MK-SYM-001"],
        symptomFacts: [{ code: "MK-SYM-001", negated: false }],
      }),
    );
    expect(result.level).toBe("GREEN");
    expect(result.hits.filter((h) => !h.advisoryOnly)).toHaveLength(0);
  });

  it("a denied symptom (negated) does not trigger a rule", () => {
    // Dyspnoea is denied: appears only in symptomFacts with negated=true, NOT in
    // symptomCodes. collectEvidenceFacts excludes negated facts, so the rule
    // cannot find the MK-SYM-002 evidence it requires.
    const result = evaluateTriage(
      input({
        symptomCodes: ["MK-SYM-001"],
        symptomFacts: [
          { code: "MK-SYM-001", negated: false },
          { code: "MK-SYM-002", negated: true },
        ],
      }),
    );
    expect(result.level).toBe("GREEN");
  });
});

describe("evaluateTriage — vital thresholds", () => {
  it("SpO2 below 92 is RED (HYPOXIA_001)", () => {
    const result = evaluateTriage(
      input({ vitalFacts: [{ code: "MK-VIT-004", value: 90 }] }),
    );
    expect(result.level).toBe("RED");
    expect(
      result.hits.find((h) => h.ruleIdentifier === "HYPOXIA_001"),
    ).toBeDefined();
  });

  it("SpO2 93 is AMBER (HYPOXIA_002), not RED", () => {
    const result = evaluateTriage(
      input({ vitalFacts: [{ code: "MK-VIT-004", value: 93 }] }),
    );
    expect(result.level).toBe("AMBER");
    expect(
      result.hits.find((h) => h.ruleIdentifier === "HYPOXIA_002"),
    ).toBeDefined();
    expect(
      result.hits.find((h) => h.ruleIdentifier === "HYPOXIA_001"),
    ).toBeUndefined();
  });

  it("systolic below 90 is RED (HYPOTENSION_001)", () => {
    const result = evaluateTriage(
      input({
        vitalFacts: [
          { code: "MK-VIT-001", componentCode: "SYSTOLIC", value: 85 },
        ],
      }),
    );
    expect(result.level).toBe("RED");
    expect(
      result.hits.find((h) => h.ruleIdentifier === "HYPOTENSION_001"),
    ).toBeDefined();
  });

  it("implausible vitals do not escalate triage", () => {
    const result = evaluateTriage(
      input({
        vitalFacts: [{ code: "MK-VIT-004", value: 40, implausible: true }],
      }),
    );
    expect(
      result.hits.find((h) => h.ruleIdentifier === "HYPOXIA_001"),
    ).toBeUndefined();
  });
});

describe("evaluateTriage — data-incomplete advisory", () => {
  it("unresolved safety-critical questions are GREEN but require human review", () => {
    const result = evaluateTriage(
      input({
        safetyCriticalUnresolvedQuestionKeys: ["q.chest_pain.safety_dyspnoea"],
      }),
    );
    expect(result.level).toBe("GREEN");
    expect(result.requiresHumanReview).toBe(true);
    expect(
      result.hits.find(
        (h) => h.ruleIdentifier === "DATA_INCOMPLETE_SAFETY_001",
      ),
    ).toBeDefined();
  });
});
