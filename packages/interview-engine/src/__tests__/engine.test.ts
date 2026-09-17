/**
 * Unit tests for the deterministic interview engine.
 *
 * These pin the exact behaviours docs/PHASE-3-PLAN.md §4.7 requires: determinism, branch gating,
 * YES_NO normalisation, declined != unknown != skipped, retry/askCount semantics, completion and
 * SOCRATES ratio, the max-questions budget, escalation advisories and trigger-context polarity.
 */

import { describe, it, expect } from "vitest";
import { evaluateTrigger } from "@medikiosk/clinical-schema";
import type {
  InterviewPathway,
  PathwayQuestion,
} from "@medikiosk/clinical-schema";
import { isTerminal } from "@medikiosk/shared-types";
import {
  buildTriggerContext,
  selectActivePathways,
  activePathwayKeys,
  selectNextQuestion,
  evaluateResponse,
  computeCompletion,
  INTERVIEW_RUNTIME_VERSION,
} from "../index";
import type { InterviewInput, ResponseRecord, ResponseRequest } from "../index";

const NOW = new Date("2026-09-18T10:00:00.000Z");

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function input(overrides: Partial<InterviewInput> = {}): InterviewInput {
  return {
    complaints: [],
    patient: {},
    responses: [],
    symptomFacts: [],
    conditionCodes: [],
    medicationCodes: [],
    allergyCategories: [],
    vitals: {},
    labFlaggedHigh: [],
    labFlaggedLow: [],
    documentCount: 0,
    ...overrides,
  };
}

/** A recorded answer row. */
function answered(
  questionKey: string,
  raw: string,
  overrides: Partial<ResponseRecord> = {},
): ResponseRecord {
  return {
    questionKey,
    pathwayKey: "PATH-CHEST-PAIN",
    kind: "YES_NO",
    category: "SAFETY_CRITICAL",
    state: "ANSWERED",
    rawAnswer: raw,
    normalisedJson: { conceptCodes: [], negated: false },
    confidence: 0.9,
    askCount: 1,
    answeredAt: NOW.toISOString(),
    ...overrides,
  };
}

function req(overrides: Partial<ResponseRequest> = {}): ResponseRequest {
  return {
    questionKey: "q.chest_pain.safety_dyspnoea",
    rawAnswer: "haan",
    modality: "VOICE",
    now: NOW,
    ...overrides,
  };
}

function makeQuestion(
  key: string,
  overrides: Partial<PathwayQuestion> = {},
): PathwayQuestion {
  return {
    key,
    kind: "YES_NO",
    category: "COMPLETENESS",
    required: true,
    options: [],
    socratesDimensions: [],
    positiveConceptCodes: [],
    captureVerbatim: true,
    rationale: "",
    maxAsks: 2,
    ...overrides,
  };
}

function makePathway(
  key: string,
  questions: readonly PathwayQuestion[],
  overrides: Partial<InterviewPathway> = {},
): InterviewPathway {
  return {
    key,
    version: "1.0.0",
    displayName: key,
    complaintCodes: [],
    entryWhen: { always: true },
    questions: [...questions],
    branches: [],
    completion: { socratesRequiredRatio: 1, maxQuestions: 40 },
    escalation: [],
    priorityRank: 1,
    ...overrides,
  };
}

const chestPainPathwayReal = () => {
  const pathways = selectActivePathways(input({ complaints: ["MK-SYM-001"] }));
  return pathways.find((p) => p.key === "PATH-CHEST-PAIN");
};
const generalPathwayReal = () => {
  const pathways = selectActivePathways(input({ complaints: ["MK-SYM-001"] }));
  return pathways.find((p) => p.key === "PATH-HISTORY-GENERAL");
};

// ---------------------------------------------------------------------------
// 1. Determinism
// ---------------------------------------------------------------------------

describe("determinism", () => {
  it("produces identical selector results for identical inputs", () => {
    const base = input({ complaints: ["MK-SYM-001"] });
    const pathways = selectActivePathways(base);
    const a = selectNextQuestion(base, pathways);
    const b = selectNextQuestion(base, selectActivePathways(base));
    expect(a).toEqual(b);
    expect(a.question?.key).toBe("q.chest_pain.safety_dyspnoea");
    expect(a.completion.status).toBe("INCOMPLETE");
  });

  it("produces identical response outcomes for identical inputs and requests", () => {
    const base = input({ complaints: ["MK-SYM-001"] });
    const pathways = selectActivePathways(base);
    const a = evaluateResponse(base, pathways, req());
    const b = evaluateResponse(
      input({ complaints: ["MK-SYM-001"] }),
      pathways,
      req(),
    );
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// 2. Branching
// ---------------------------------------------------------------------------

describe("branching (BR-CHEST-EXERTION)", () => {
  it("offers q.chest_pain.exertion only after dyspnoea is answered yes", () => {
    const chest = chestPainPathwayReal();
    expect(chest).toBeDefined();

    const withoutYes = input({ complaints: ["MK-SYM-001"] });
    const keysOff = activePathwayKeys(chest as InterviewPathway, (e) =>
      evaluateTrigger(e, buildTriggerContext(withoutYes)),
    );
    expect(keysOff).not.toContain("q.chest_pain.exertion");

    const withYes = input({
      complaints: ["MK-SYM-001"],
      responses: [
        answered("q.chest_pain.safety_dyspnoea", "haan", {
          state: "ANSWERED",
          kind: "YES_NO",
          normalisedJson: { conceptCodes: ["MK-SYM-002"], negated: false },
        }),
      ],
    });
    const keysOn = activePathwayKeys(chest as InterviewPathway, (e) =>
      evaluateTrigger(e, buildTriggerContext(withYes)),
    );
    expect(keysOn).toContain("q.chest_pain.exertion");
    expect(keysOn).toContain("q.chest_pain.relief");
  });
});

// ---------------------------------------------------------------------------
// 3. YES_NO normalisation
// ---------------------------------------------------------------------------

describe("YES_NO normalisation", () => {
  const evaluateYesNo = (raw: string) => {
    const base = input({ complaints: ["MK-SYM-001"] });
    return evaluateResponse(
      base,
      selectActivePathways(base),
      req({ rawAnswer: raw }),
    );
  };

  it.each(["haan", "han", "yes"])("resolves %s as positive", (raw) => {
    const outcome = evaluateYesNo(raw);
    expect(outcome.state).toBe("ANSWERED");
    expect((outcome.normalisedJson as { negated?: boolean }).negated).toBe(
      false,
    );
    expect(outcome.facts.map((f) => f.conceptCode)).toContain("MK-SYM-002");
    expect(outcome.facts[0]?.negated).toBe(false);
  });

  it.each(["nahi", "na", "nahin"])("resolves %s as negated", (raw) => {
    const outcome = evaluateYesNo(raw);
    expect(outcome.state).toBe("ANSWERED");
    expect((outcome.normalisedJson as { negated?: boolean }).negated).toBe(
      true,
    );
    // No positive-concept facts are fabricated from a denial.
    expect(outcome.facts).toEqual([]);
  });

  it("treats a contradictory answer as needing clarification", () => {
    const outcome = evaluateYesNo("haan nahi");
    expect(outcome.state).toBe("NEEDS_CLARIFICATION");
    expect(outcome.facts).toEqual([]);
  });

  it("treats an empty answer as needing clarification", () => {
    const outcome = evaluateYesNo("");
    expect(outcome.state).toBe("NEEDS_CLARIFICATION");
  });
});

// ---------------------------------------------------------------------------
// 4. Declined != Unknown != Skipped
// ---------------------------------------------------------------------------

describe("declined / unknown / skipped are distinct", () => {
  const only = makePathway("PATH-ONLY", [
    makeQuestion("q.only", { required: true }),
  ]);
  const pathways = [only];

  it("declined is terminal and closes a required question", () => {
    const base = input();
    const outcome = evaluateResponse(
      base,
      pathways,
      req({
        questionKey: "q.only",
        state: "DECLINED",
        rawAnswer: "skip please",
      }),
    );
    expect(outcome.state).toBe("DECLINED");
    expect(isTerminal(outcome.state)).toBe(true);
    expect(outcome.evidenceExpected).toBe(true);
    const completion = outcome.next.completion;
    expect(completion.outstandingRequired).not.toContain("q.only");
    expect(completion.status).toBe("COMPLETE");
  });

  it("unknown is terminal and closes a required question", () => {
    const base = input();
    const outcome = evaluateResponse(
      base,
      pathways,
      req({ questionKey: "q.only", state: "UNKNOWN", rawAnswer: "pata nahi" }),
    );
    expect(outcome.state).toBe("UNKNOWN");
    expect(isTerminal(outcome.state)).toBe(true);
    expect(outcome.next.completion.outstandingRequired).not.toContain("q.only");
    expect(outcome.next.completion.status).toBe("COMPLETE");
  });

  it("skipped is outstanding, never coerced, and re-askable", () => {
    const base = input();
    const outcome = evaluateResponse(
      base,
      pathways,
      req({ questionKey: "q.only", state: "SKIPPED" }),
    );
    expect(outcome.state).toBe("SKIPPED");
    expect(isTerminal(outcome.state)).toBe(false);
    expect(outcome.evidenceExpected).toBe(false);
    // A skipped required question stays outstanding AND is re-askable (not exhausted).
    const completion = outcome.next.completion;
    expect(completion.outstandingRequired).toContain("q.only");
    expect(completion.outstandingReason["q.only"]).toBe("SKIPPED");
    expect(completion.status).toBe("INCOMPLETE");
    expect(outcome.next.question?.key).toBe("q.only");
  });

  it("never coerces declined/unknown to a negative fact", () => {
    const base = input();
    const declined = evaluateResponse(
      base,
      pathways,
      req({ questionKey: "q.only", state: "DECLINED" }),
    );
    expect(declined.facts).toEqual([]);
    const unknown = evaluateResponse(
      base,
      pathways,
      req({ questionKey: "q.only", state: "UNKNOWN" }),
    );
    expect(unknown.facts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5. Retry semantics
// ---------------------------------------------------------------------------

describe("retry / askCount semantics", () => {
  const only = makePathway("PATH-RETRY", [
    makeQuestion("q.retry", { key: "q.retry", required: true, maxAsks: 2 }),
  ]);
  const pathways = [only];

  it("re-asks an open LOW_CONFIDENCE question until maxAsks, then stops with a reason", () => {
    const base = input();
    // First LOW_CONFIDENCE answer (neither a yes nor a no token).
    const first = evaluateResponse(
      base,
      pathways,
      req({ questionKey: "q.retry", rawAnswer: "dunya" }),
    );
    expect(first.state).toBe("LOW_CONFIDENCE");
    expect(first.next.question?.key).toBe("q.retry");
    expect(first.next.question?.askCount).toBe(1);
    expect(first.next.completion.status).toBe("NEEDS_CLARIFICATION");

    // The API persists the first row; the second evaluation runs against that state.
    const withFirst: InterviewInput = {
      ...base,
      responses: [
        answered("q.retry", "dunya", {
          state: "LOW_CONFIDENCE",
          pathwayKey: "PATH-RETRY",
        }),
      ],
    };
    const second = evaluateResponse(
      withFirst,
      pathways,
      req({ questionKey: "q.retry", rawAnswer: "bhatakta" }),
    );
    expect(second.state).toBe("LOW_CONFIDENCE");
    expect(second.next.question).toBeNull();
    const completion = second.next.completion;
    expect(completion.outstandingReason["q.retry"]).toBe(
      "LOW_CONFIDENCE (asked 2/2)",
    );
    expect(completion.maxQuestionsReached).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Completion + SOCRATES ratio
// ---------------------------------------------------------------------------

describe("completion and SOCRATES ratio (chest pain)", () => {
  const completeChestResponses = (extra: readonly ResponseRecord[] = []) => {
    const safetyAndSocrates: ResponseRecord[] = [
      answered("q.chest_pain.safety_dyspnoea", "no", {
        normalisedJson: { negated: true },
      }),
      answered("q.chest_pain.safety_sweating", "no", {
        normalisedJson: { negated: true },
      }),
      answered("q.chest_pain.safety_syncope", "no", {
        normalisedJson: { negated: true },
      }),
      answered("q.chest_pain.safety_cardiac_history", "no", {
        normalisedJson: { negated: true },
      }),
      answered("q.chest_pain.site", "q.chest_pain.site.opt.left", {
        kind: "SINGLE_CHOICE",
        category: "CHIEF_COMPLAINT",
      }),
      answered("q.chest_pain.onset", "2 din", {
        kind: "DURATION",
        category: "CHIEF_COMPLAINT",
      }),
      answered(
        "q.chest_pain.character",
        "q.chest_pain.character.opt.pressure",
        { kind: "SINGLE_CHOICE", category: "CHIEF_COMPLAINT" },
      ),
      answered("q.chest_pain.radiation", "q.chest_pain.radiation.opt.none", {
        kind: "MULTI_CHOICE",
        category: "CHIEF_COMPLAINT",
      }),
      answered(
        "q.chest_pain.associated",
        "q.chest_pain.associated.opt.nausea",
        { kind: "MULTI_CHOICE", category: "CHIEF_COMPLAINT" },
      ),
      answered("q.chest_pain.timing", "q.chest_pain.timing.opt.exertional", {
        kind: "SINGLE_CHOICE",
        category: "CHIEF_COMPLAINT",
      }),
    ];
    return [...safetyAndSocrates, ...extra];
  };

  it("reports socratesRequiredRatio 1 when all required dims are closed", () => {
    const base = input({
      complaints: ["MK-SYM-001"],
      responses: completeChestResponses(),
    });
    const { progress } = selectNextQuestion(base, selectActivePathways(base));
    expect(progress.socratesRequiredRatio).toBe(1);
  });

  it("reports socratesRequiredRatio < 1 when a required dim is missing", () => {
    const responses = completeChestResponses();
    const timing = responses[9] as ResponseRecord;
    const withoutTiming = responses.filter(
      (r) => r.questionKey !== timing.questionKey,
    );
    const base = input({
      complaints: ["MK-SYM-001"],
      responses: withoutTiming,
    });
    const { progress } = selectNextQuestion(base, selectActivePathways(base));
    expect(progress.socratesRequiredRatio).toBeLessThan(1);
  });

  it("is COMPLETE once every required question is terminal", () => {
    const responses = [
      ...completeChestResponses(),
      answered("q.history.medications", "metformin", {
        pathwayKey: "PATH-HISTORY-GENERAL",
        kind: "FREE_TEXT",
        category: "MEDICATION_ALLERGY",
      }),
      answered("q.history.allergies", "no", {
        pathwayKey: "PATH-HISTORY-GENERAL",
        category: "MEDICATION_ALLERGY",
        normalisedJson: { negated: true },
      }),
    ];
    const base = input({ complaints: ["MK-SYM-001"], responses });
    const pathways = selectActivePathways(base);
    const completion = computeCompletion(base, pathways);
    expect(completion.status).toBe("COMPLETE");
    expect(completion.maxQuestionsReached).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. Max-questions budget
// ---------------------------------------------------------------------------

describe("max-questions budget", () => {
  it("stops offering questions and reports maxQuestionsReached at the budget", () => {
    const pw = makePathway(
      "PATH-BUDGET",
      [
        makeQuestion("q.a", { maxAsks: 2 }),
        makeQuestion("q.b", { maxAsks: 2 }),
        makeQuestion("q.c", { maxAsks: 2 }),
      ],
      { completion: { socratesRequiredRatio: 1, maxQuestions: 2 } },
    );
    const base = input({
      responses: [
        answered("q.a", "yes", { pathwayKey: "PATH-BUDGET" }),
        answered("q.b", "yes", { pathwayKey: "PATH-BUDGET" }),
      ],
    });
    const result = selectNextQuestion(base, [pw]);
    expect(result.question).toBeNull();
    expect(result.completion.maxQuestionsReached).toBe(true);
    expect(result.completion.outstandingRequired).toContain("q.c");
    expect(result.completion.status).toBe("INCOMPLETE");
  });

  it("applies budgets per pathway: an exhausted pathway does not starve an active one", () => {
    const exhausted = makePathway(
      "PATH-BUDGET",
      [makeQuestion("q.a"), makeQuestion("q.b")],
      { completion: { socratesRequiredRatio: 1, maxQuestions: 1 } },
    );
    const active = makePathway(
      "PATH-ACTIVE",
      [makeQuestion("q.x")],
      { completion: { socratesRequiredRatio: 1, maxQuestions: 5 } },
    );
    const base = input({
      responses: [answered("q.a", "yes", { pathwayKey: "PATH-BUDGET" })],
    });
    const result = selectNextQuestion(base, [exhausted, active]);
    expect(result.question?.key).toBe("q.x");
    expect(result.completion.maxQuestionsReached).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. Escalation advisory
// ---------------------------------------------------------------------------

describe("escalation advisory", () => {
  it("emits ESC-CHEST-PAIN-001 for chest pain with dyspnoea", () => {
    const base = input({ complaints: ["MK-SYM-001"] });
    const outcome = evaluateResponse(
      base,
      selectActivePathways(base),
      req({ rawAnswer: "haan" }),
    );
    const keys = outcome.advisories.map((a) => a.key);
    expect(keys).toContain("ESC-CHEST-PAIN-001");
  });
});

// ---------------------------------------------------------------------------
// 9. Trigger context build (polarity / negation / unanswered)
// ---------------------------------------------------------------------------

describe("buildTriggerContext polarity", () => {
  it("maps a positive answer to answeredYes and clears unanswered", () => {
    const base = input({
      complaints: ["MK-SYM-001"],
      responses: [
        answered("q.chest_pain.safety_dyspnoea", "haan", {
          kind: "YES_NO",
          normalisedJson: { conceptCodes: ["MK-SYM-002"], negated: false },
        }),
      ],
    });
    const ctx = buildTriggerContext(base);
    expect(ctx.answeredYes["q.chest_pain.safety_dyspnoea"]).toBe(true);
    expect(ctx.answeredNo["q.chest_pain.safety_dyspnoea"]).toBe(false);
    expect(
      evaluateTrigger({ answeredYes: "q.chest_pain.safety_dyspnoea" }, ctx),
    ).toBe(true);
    expect(
      evaluateTrigger({ unanswered: "q.chest_pain.safety_dyspnoea" }, ctx),
    ).toBe(false);
  });

  it("maps a negated answer to answeredNo, never to answeredYes", () => {
    const base = input({
      complaints: ["MK-SYM-001"],
      responses: [
        answered("q.chest_pain.safety_dyspnoea", "nahi", {
          kind: "YES_NO",
          normalisedJson: { negated: true },
        }),
      ],
    });
    const ctx = buildTriggerContext(base);
    expect(ctx.answeredYes["q.chest_pain.safety_dyspnoea"]).toBe(false);
    expect(ctx.answeredNo["q.chest_pain.safety_dyspnoea"]).toBe(true);
  });

  it("does not mark an unasked question answered or unanswered-forced", () => {
    const base = input({ complaints: ["MK-SYM-001"] });
    const ctx = buildTriggerContext(base);
    expect(ctx.answeredYes["q.chest_pain.safety_dyspnoea"]).toBeUndefined();
    expect(ctx.answeredAny["q.chest_pain.safety_dyspnoea"]).toBeUndefined();
    // An unanswered key is not treated as a yes and its trigger stays false.
    expect(
      evaluateTrigger({ answeredYes: "q.chest_pain.safety_dyspnoea" }, ctx),
    ).toBe(false);
  });
});

describe("MULTI_CHOICE selection", () => {
  const multiPathway = makePathway(
    "PATH-MULTI",
    [
      makeQuestion("q.ros", {
        kind: "MULTI_CHOICE",
        options: [
          { key: "q.ros.opt.fever", conceptCodes: ["MK-SYM-020"] },
          { key: "q.ros.opt.cough", conceptCodes: ["MK-SYM-007"] },
          { key: "q.ros.opt.breathlessness", conceptCodes: ["MK-SYM-002"] },
          { key: "q.ros.opt.none", conceptCodes: [] },
        ],
      }),
    ],
    { completion: { socratesRequiredRatio: 1, maxQuestions: 10 } },
  );

  it("unions concepts when several options are chosen and preserves the selection", () => {
    const base = input({ complaints: ["MK-SYM-020"] });
    const outcome = evaluateResponse(
      base,
      [multiPathway],
      req({
        questionKey: "q.ros",
        rawAnswer: "q.ros.opt.fever ; q.ros.opt.cough; q.ros.opt.breathlessness",
      }),
    );
    expect(outcome.state).toBe("ANSWERED");
    const normalised = outcome.normalisedJson as Record<
      string,
      unknown
    > | null;
    expect(normalised).toBeTruthy();
    const codes = (normalised?.conceptCodes ?? []) as string[];
    expect(codes).toContain("MK-SYM-020");
    expect(codes).toContain("MK-SYM-007");
    expect(codes).toContain("MK-SYM-002");
    expect(codes).not.toContain("q.ros.opt.none");
    expect(normalised?.rawAnswer).toBe(
      "q.ros.opt.fever; q.ros.opt.cough; q.ros.opt.breathlessness",
    );
    const factCodes = outcome.facts.map((fact) => fact.conceptCode);
    expect(factCodes).toContain("MK-SYM-020");
    expect(factCodes).toContain("MK-SYM-002");
  });

  it("treats a partially unknown set as free text rather than silently dropping options", () => {
    const base = input({ complaints: ["MK-SYM-020"] });
    const outcome = evaluateResponse(
      base,
      [multiPathway],
      req({
        questionKey: "q.ros",
        rawAnswer: "q.ros.opt.fever; not-an-option",
      }),
    );
    expect(outcome.state).not.toBe("ANSWERED");
  });
});

// ---------------------------------------------------------------------------
// 10. Runtime version and hint mismatch
// ---------------------------------------------------------------------------

describe("runtime version and hint mismatch", () => {
  it("exposes the pinned runtime version", () => {
    expect(INTERVIEW_RUNTIME_VERSION).toBe("1.0.0");
  });

  it("flags a hint mismatch when client and server concept codes differ", () => {
    const base = input({ complaints: ["MK-SYM-001"] });
    const mismatched = evaluateResponse(
      base,
      selectActivePathways(base),
      req({ clientHintJson: { conceptCodes: ["MK-SYM-999"] } }),
    );
    expect(mismatched.hintMismatch).toBe(true);
    const agreed = evaluateResponse(
      base,
      selectActivePathways(base),
      req({ clientHintJson: { conceptCodes: ["MK-SYM-002"] } }),
    );
    expect(agreed.hintMismatch).toBe(false);
  });
});
