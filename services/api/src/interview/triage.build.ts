/**
 * Interview runtime — triage integration.
 *
 * The interview never asserts an acuity level: it only evaluates the deterministic rule engine
 * (`@medikiosk/safety-rules` evaluateTriage) and persists the result. Level is always RED/AMBER/
 * GREEN exactly as the rules compute it; an unresolved safety-critical question is reported
 * through `safetyCriticalUnresolvedQuestionKeys` and never treated as a negative (ADR-009).
 */

import {
  evaluateTriage,
  type RuleEvaluationInput,
  type TriageAssessmentResult,
} from "@medikiosk/safety-rules";
import { stateFor, askCountFor } from "@medikiosk/interview-engine";
import { isTerminal } from "@medikiosk/shared-types";
import type { AppDatabase } from "../db/kysely";
import { persistTriage } from "./state.repo";
import type { LoadedInterview } from "./state.repo";
import type { InterviewPathway } from "@medikiosk/clinical-schema";

/**
 * Safety-critical questions whose state is NOT terminal and which are still within their ask
 * budget. The triage engine keys on these so an interrupted interview is never read as "no".
 */
function safetyCriticalUnresolved(
  loaded: LoadedInterview,
  activePathways: readonly InterviewPathway[],
): string[] {
  const unresolved: string[] = [];
  for (const pathway of activePathways) {
    for (const question of pathway.questions) {
      if (question.category !== "SAFETY_CRITICAL") continue;
      const state = stateFor(loaded.input.responses, question.key);
      const asked = askCountFor(loaded.input.responses, question.key);
      if (!isTerminal(state as never) && asked < question.maxAsks) {
        unresolved.push(question.key);
      }
    }
  }
  return unresolved;
}

/** Keys answered YES (ANSWERED/VERIFIED and not negated) — a rule can key on these. */
function answeredYes(loaded: LoadedInterview): string[] {
  return loaded.responses
    .filter(
      (r) =>
        (r.state === "ANSWERED" || r.state === "VERIFIED") && r.negated !== 1,
    )
    .map((r) => r.questionKey);
}

/** Build the rule-evaluation input from the loaded interview state. */
export function buildRuleEvaluationInput(
  loaded: LoadedInterview,
  activePathways: readonly InterviewPathway[],
): RuleEvaluationInput {
  return {
    symptomCodes: [
      ...loaded.input.complaints,
      ...loaded.symptoms.map((s) => s.conceptCode),
    ],
    symptomFacts: loaded.symptoms.map((s) => {
      const severity =
        s.severity === null
          ? undefined
          : (s.severity as
              | "NONE"
              | "MILD"
              | "MODERATE"
              | "SEVERE"
              | "VERY_SEVERE"
              | "UNKNOWN");
      return {
        code: s.conceptCode,
        ...(severity === undefined ? {} : { severity }),
        ...(s.durationValue === null ? {} : { durationDays: s.durationValue }),
        negated: s.certainty === "NEGATED",
      };
    }),
    vitalFacts: [],
    labFacts: [],
    conditionCodes: loaded.input.conditionCodes,
    medicationCodes: loaded.input.medicationCodes,
    allergyCodes: loaded.allergies
      .map((a) => a.conceptCode)
      .filter((c): c is string => c !== null),
    ...(loaded.patient.ageYears === null
      ? {}
      : { ageYears: loaded.patient.ageYears }),
    ...(loaded.patient.sex === "MALE" ||
    loaded.patient.sex === "FEMALE" ||
    loaded.patient.sex === "OTHER"
      ? { sex: loaded.patient.sex }
      : {}),
    ...(loaded.patient.pregnant === null
      ? {}
      : { pregnant: loaded.patient.pregnant === 1 }),
    safetyCriticalUnresolvedQuestionKeys: safetyCriticalUnresolved(
      loaded,
      activePathways,
    ),
    answeredYesQuestionKeys: answeredYes(loaded),
    documentCount: 0,
  };
}

/**
 * Evaluate triage against the current state and persist an assessment snapshot + timeline event.
 * Returns the evaluation result. Called after every fact-changing mutation.
 */
export async function evaluateAndPersistTriage(
  db: AppDatabase,
  loaded: LoadedInterview,
  activePathways: readonly InterviewPathway[],
  now: string,
): Promise<TriageAssessmentResult> {
  const result = evaluateTriage(
    buildRuleEvaluationInput(loaded, activePathways),
  );
  // Evidence ids per referenced fact, resolved from symptom socrates evidence slots.
  const evidenceByFact = new Map<string, string[]>();
  for (const symptom of loaded.symptoms) {
    const ids: string[] = [];
    if (symptom.socratesJson) {
      try {
        const slots = JSON.parse(symptom.socratesJson) as Record<
          string,
          { evidenceIds?: unknown }
        >;
        for (const slot of Object.values(slots)) {
          if (Array.isArray(slot?.evidenceIds))
            ids.push(...(slot.evidenceIds as string[]));
        }
      } catch {
        // Not a socrates map; ignore.
      }
    }
    evidenceByFact.set(symptom.conceptCode, ids);
  }
  await persistTriage(db, {
    tenantId: loaded.encounter.tenantId,
    patientId: loaded.encounter.patientId,
    encounterId: loaded.encounter.id,
    result,
    evidenceIdsByFact: (fact) => evidenceByFact.get(fact) ?? [],
    now,
  });
  return result;
}

/**
 * The latest triage result for an encounter, or null when nothing has been assessed yet.
 * `latestTriage` is loaded with the interview state (orderBy assessedAt desc).
 */
export function latestTriageSummary(
  loaded: LoadedInterview,
): { level: string; priority: string; requiresHumanReview: boolean } | null {
  if (!loaded.latestTriage) return null;
  return {
    level: loaded.latestTriage.level,
    priority: loaded.latestTriage.priority,
    requiresHumanReview: loaded.latestTriage.requiresHumanReview === 1,
  };
}
