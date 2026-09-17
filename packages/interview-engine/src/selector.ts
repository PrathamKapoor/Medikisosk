/**
 * Deterministic next-question selection.
 *
 * Ordering is fixed and testable: candidates are ranked by (question category priority, pathway
 * priority, pathway order). An open-state question (LOW_CONFIDENCE / NEEDS_CLARIFICATION /
 * CONTRADICTORY) is re-asked while its `askCount` is below `maxAsks`; a question whose state is
 * terminal is never offered again. Each pathway's `completion.maxQuestions` bounds its own
 * questions, so concurrently active pathways each receive their configured interview budget.
 */

import {
  CATEGORY_PRIORITY_RANK,
  SOCRATES_PROFILES,
  evaluateTrigger,
  questionAppliesToAge,
  socratesCompleteness,
  type InterviewPathway,
  type PathwayQuestion,
  type SocratesSlotMap,
  type TriggerContext,
  type TriggerExpression,
} from "@medikiosk/clinical-schema";
import { isOpen, isTerminal } from "@medikiosk/shared-types";
import {
  askCountFor,
  askedForPathway,
  buildTriggerContext,
  stateFor,
} from "./context";
import { computeCompletion } from "./complete";
import { activePathwayKeys } from "./pathways";
import type {
  InterviewInput,
  NextQuestionResult,
  ProgressView,
  QuestionView,
} from "./types";

interface Candidate {
  readonly pathway: InterviewPathway;
  readonly question: PathwayQuestion;
  readonly orderIndex: number;
}

/** The rendered view of a question a client can show. */
function toQuestionView(
  question: PathwayQuestion,
  pathway: InterviewPathway,
  askCount: number,
): QuestionView {
  return {
    key: question.key,
    kind: question.kind,
    category: question.category,
    pathwayKey: pathway.key,
    promptKey: question.key,
    options: question.options.map((option) => ({
      key: option.key,
      conceptCodes: [...option.conceptCodes],
      ...(option.severity === undefined ? {} : { severity: option.severity }),
    })),
    socratesDimensions: [...question.socratesDimensions],
    rationale: question.rationale,
    required: question.required,
    askCount,
  };
}

/** Why a question was selected; deterministic and aimed at the physician/debug view. */
function buildRationale(
  candidate: Candidate,
  context: TriggerContext,
  reasking: boolean,
): string {
  if (reasking)
    return `Re-asking for clarification (max ${candidate.question.maxAsks})`;
  const inBase = candidate.pathway.questions.some(
    (q) => q.key === candidate.question.key,
  );
  if (!inBase) {
    const branch = candidate.pathway.branches.find((b) =>
      b.questionKeys.includes(candidate.question.key),
    );
    if (branch)
      return `Branch condition of ${candidate.pathway.key} (${branch.key})`;
  }
  if (
    candidate.question.category === "SAFETY_CRITICAL" &&
    candidate.question.required
  )
    return `SAFETY_CRITICAL question required by ${candidate.pathway.key}`;
  return `Question from ${candidate.pathway.key}`;
}

/**
 * Blended SOCRATES required ratio across the complaint profiles (see
 * `@medikiosk/clinical-schema` `SOCRATES_PROFILES`). A complaint without a profile adds no
 * requirement and so counts as satisfied; the project's chest-pain profile requires SITE..TIMING.
 */
export function computeSocratesRatio(input: InterviewInput): number {
  let requiredTotal = 0;
  let requiredClosed = 0;
  for (const complaint of input.complaints) {
    const profile = SOCRATES_PROFILES[complaint];
    if (!profile) continue;
    const slots: SocratesSlotMap = {};
    for (const relevance of profile.dimensions) {
      slots[relevance.dimension] = {
        dimension: relevance.dimension,
        state: stateFor(input.responses, relevance.questionKey),
        answer: undefined,
        evidenceIds: [],
        askCount: 0,
      };
    }
    const completeness = socratesCompleteness(profile, slots);
    requiredTotal += completeness.requiredTotal;
    requiredClosed += completeness.requiredClosed;
  }
  return requiredTotal === 0 ? 1 : requiredClosed / requiredTotal;
}

function computeProgress(
  input: InterviewInput,
  candidates: readonly Candidate[],
  activeCount: number,
): ProgressView {
  let requiredClosed = 0;
  let requiredTotal = 0;
  for (const candidate of candidates) {
    if (!candidate.question.required) continue;
    requiredTotal += 1;
    if (isTerminal(stateFor(input.responses, candidate.question.key)))
      requiredClosed += 1;
  }
  return {
    asked: input.responses.length,
    activeCount,
    requiredClosed,
    requiredTotal,
    socratesRequiredRatio: computeSocratesRatio(input),
  };
}

export function selectNextQuestion(
  input: InterviewInput,
  activePathways: readonly InterviewPathway[],
): NextQuestionResult {
  const context = buildTriggerContext(input);
  const evaluate = (when: TriggerExpression) => evaluateTrigger(when, context);

  const candidates: Candidate[] = [];
  for (const pathway of activePathways) {
    const keys = activePathwayKeys(pathway, evaluate);
    keys.forEach((key, orderIndex) => {
      const question = pathway.questions.find((q) => q.key === key);
      if (!question) return;
      if (!questionAppliesToAge(question, input.patient.ageYears)) return;
      candidates.push({ pathway, question, orderIndex });
    });
  }

  // Deterministic global ordering across pathways.
  const ordered = [...candidates].sort(
    (a, b) =>
      CATEGORY_PRIORITY_RANK[a.question.category] -
        CATEGORY_PRIORITY_RANK[b.question.category] ||
      a.pathway.priorityRank - b.pathway.priorityRank ||
      a.orderIndex - b.orderIndex,
  );

  const eligible = ordered.filter((candidate) => {
    // A pathway whose own `completion.maxQuestions` is exhausted stops offering its
    // questions; active pathways do not share one global budget (a chest-pain patient
    // with dyspnoea legitimately has both the chest and respiratory pathways active).
    if (
      askedForPathway(input.responses, candidate.pathway.key) >=
      candidate.pathway.completion.maxQuestions
    )
      return false;
    const state = stateFor(input.responses, candidate.question.key);
    if (state === "UNANSWERED") return true;
    // Open clarification states AND a skipped question are re-askable while under maxAsks
    // (the plan's §4.4 makes SKIPPED re-askable even though shared-types `isOpen` omits it).
    if (isOpen(state) || state === "SKIPPED")
      return (
        askCountFor(input.responses, candidate.question.key) <
        candidate.question.maxAsks
      );
    return false;
  });

  const completion = computeCompletion(input, activePathways);
  const progress = computeProgress(input, ordered, eligible.length);

  const selected = eligible[0];

  const question =
    selected === undefined
      ? null
      : toQuestionView(
          selected.question,
          selected.pathway,
          askCountFor(input.responses, selected.question.key),
        );
  const rationale =
    question === null || selected === undefined
      ? null
      : buildRationale(
          selected,
          context,
          // "Re-asking" only when the question was already answered at least once; a first
          // UNANSWERED presentation is a new ask, not a clarification.
          (isOpen(stateFor(input.responses, selected.question.key)) ||
            stateFor(input.responses, selected.question.key) === "SKIPPED") &&
            askCountFor(input.responses, selected.question.key) > 0,
        );

  return { question, progress, completion, rationale };
}
