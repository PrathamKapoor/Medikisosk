/**
 * Completion, clarification and escalation state of the interview.
 *
 * Completion is deliberately question-level: a required question must reach a terminal state
 * (answered, verified, declined, unknown, not-applicable). `SKIPPED` and the open clarification
 * states never close a required question, but the interview never coerces a patient — it records
 * the state and reports completion honestly. Declining is terminal, so a patient is never trapped
 * in a loop (see docs/PHASE-3-PLAN.md §2).
 */

import {
  evaluateTrigger,
  questionAppliesToAge,
  type InterviewPathway,
  type PathwayQuestion,
  type TriggerExpression,
} from "@medikiosk/clinical-schema";
import { isTerminal } from "@medikiosk/shared-types";
import {
  askedForPathway,
  buildTriggerContext,
  askCountFor,
  stateFor,
} from "./context";
import { activePathwayKeys } from "./pathways";
import type {
  CompletionView,
  InterviewInput,
  InterviewStatus,
  InterviewQuestionState,
} from "./types";

/** Human/debug reason for why a required question remains outstanding. */
function describeOutstanding(
  question: PathwayQuestion,
  state: InterviewQuestionState,
  askCount: number,
): string {
  switch (state) {
    case "UNANSWERED":
      return "UNANSWERED";
    case "SKIPPED":
      return "SKIPPED";
    case "CONTRADICTORY":
      return "CONTRADICTORY";
    case "LOW_CONFIDENCE":
    case "NEEDS_CLARIFICATION":
      return `${state} (asked ${askCount}/${question.maxAsks})`;
    default:
      return state;
  }
}

/**
 * Active pathways that have exhausted their own `maxQuestions` budget.
 *
 * Budgets are per-pathway: a chest-pain patient with dyspnoea has both the chest and respiratory
 * pathways active, and each spends only its own interview budget (see ADR-012).
 */
export function exhaustedPathways(
  input: InterviewInput,
  activePathways: readonly InterviewPathway[],
): readonly string[] {
  return activePathways
    .filter(
      (pathway) =>
        askedForPathway(input.responses, pathway.key) >=
        pathway.completion.maxQuestions,
    )
    .map((pathway) => pathway.key);
}

/**
 * Compute completion for the current interview input.
 *
 * `canFinishAnyway` is always true: the finish endpoint is advisory and never coerces a patient.
 * The triage level is deliberately NOT part of this result — `SAFETY_ESCALATION` is composed by
 * the API layer from the safety engine's latest assessment (ADR-009).
 */
export function computeCompletion(
  input: InterviewInput,
  activePathways: readonly InterviewPathway[],
): CompletionView {
  const context = buildTriggerContext(input);
  const evaluate = (when: TriggerExpression) => evaluateTrigger(when, context);

  const outstandingRequired: string[] = [];
  const outstandingReason: Record<string, string> = {};

  for (const pathway of activePathways) {
    for (const key of activePathwayKeys(pathway, evaluate)) {
      const question = pathway.questions.find((q) => q.key === key);
      if (!question || !question.required) continue;
      if (!questionAppliesToAge(question, input.patient.ageYears)) continue;
      const state = stateFor(input.responses, key);
      if (isTerminal(state)) continue;
      outstandingRequired.push(key);
      outstandingReason[key] = describeOutstanding(
        question,
        state,
        askCountFor(input.responses, key),
      );
    }
  }

  // The budget flag answers "can the interview still present a question?" — true only when
  // outstanding required work remains yet every pathway owning such work has exhausted its own
  // maxQuestions budget. A single exhausted pathway does not flag the interview while another
  // active pathway can still ask (ADR-012: budgets are per pathway).
  const exhausted = new Set(exhaustedPathways(input, activePathways));
  const maxQuestionsReached =
    outstandingRequired.length > 0 &&
    outstandingRequired.every((key) => {
      const owningPathway = activePathways.find((pathway) =>
        pathway.questions.some((question) => question.key === key),
      );
      return owningPathway !== undefined && exhausted.has(owningPathway.key);
    });

  let status: InterviewStatus = "COMPLETE";
  if (outstandingRequired.length > 0) {
    const hasOpenClarification = outstandingRequired.some((key) => {
      const state = stateFor(input.responses, key);
      return (
        state === "LOW_CONFIDENCE" ||
        state === "NEEDS_CLARIFICATION" ||
        state === "CONTRADICTORY"
      );
    });
    status = hasOpenClarification ? "NEEDS_CLARIFICATION" : "INCOMPLETE";
  }

  return {
    status,
    outstandingRequired,
    outstandingReason,
    canFinishAnyway: true,
    maxQuestionsReached,
  };
}
