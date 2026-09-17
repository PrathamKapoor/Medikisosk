/**
 * Builds the clinical trigger context from raw interview input.
 *
 * The trigger context is the narrow, read-only view the deterministic evaluator
 * (`@medikiosk/clinical-schema` `evaluateTrigger`) is allowed to consult. Keeping it explicit
 * guarantees that a branch condition can only depend on facts the domain has already established,
 * never on the database or on model output.
 */

import type {
  NormalisedAnswer,
  TriggerContext,
} from "@medikiosk/clinical-schema";
import { isTerminal } from "@medikiosk/shared-types";
import type { InterviewInput, ResponseRecord } from "./types";

/** The latest (highest `askCount`) response row for a question key, if any. */
export function latestResponseFor(
  responses: readonly ResponseRecord[],
  questionKey: string,
): ResponseRecord | undefined {
  let latest: ResponseRecord | undefined;
  for (const response of responses) {
    if (response.questionKey !== questionKey) continue;
    if (latest === undefined || response.askCount >= latest.askCount)
      latest = response;
  }
  return latest;
}

/** The state of a question, or "UNANSWERED" when it has never been answered. */
export function stateFor(
  responses: readonly ResponseRecord[],
  questionKey: string,
): ResponseRecord["state"] {
  return latestResponseFor(responses, questionKey)?.state ?? "UNANSWERED";
}

/** The number of response rows recorded for a question key. */
export function askCountFor(
  responses: readonly ResponseRecord[],
  questionKey: string,
): number {
  return latestResponseFor(responses, questionKey)?.askCount ?? 0;
}

/**
 * Responses attributed to one pathway.
 *
 * A question is asked "from" the pathway that presented it (responses record their owning
 * pathway key), so a pathway's `completion.maxQuestions` budget bounds exactly its own
 * questions even when several pathways are active concurrently.
 */
export function askedForPathway(
  responses: readonly ResponseRecord[],
  pathwayKey: string,
): number {
  return responses.reduce(
    (count, response) =>
      response.pathwayKey === pathwayKey ? count + 1 : count,
    0,
  );
}

/**
 * True when the latest response to a question reads as a positive clinical statement:
 * answered, not negated, and carrying either concept codes or an un-negated YES_NO match.
 */
function polarisedYes(response: ResponseRecord): boolean {
  const normalised = response.normalisedJson as
    (Partial<NormalisedAnswer> & { negated?: boolean }) | null | undefined;
  const negated = normalised?.negated === true;
  if (response.state !== "ANSWERED" && response.state !== "VERIFIED")
    return false;
  if (negated) return false;
  const conceptCount = (normalised?.conceptCodes ?? []).length;
  return conceptCount > 0 || response.kind === "YES_NO";
}

/**
 * Build the trigger context for an interview input.
 *
 * Polarity is derived from the server-computed normalised answer stored on each response:
 * a negated interpretation makes the question read as "no"; a positive (un-negated) answer with
 * concept codes, or a positive YES_NO answer, reads as "yes". A question is "unanswered" only
 * when no response row exists yet, so a decline/unknown/skip is never treated as data absence.
 */
export function buildTriggerContext(input: InterviewInput): TriggerContext {
  const answeredYes: Record<string, boolean> = {};
  const answeredNo: Record<string, boolean> = {};
  const answeredAny: Record<string, boolean> = {};
  const unanswered: Record<string, boolean> = {};

  for (const questionKey of new Set(
    input.responses.map((r) => r.questionKey),
  )) {
    const latest = latestResponseFor(input.responses, questionKey);
    if (!latest) continue;
    answeredAny[questionKey] = isTerminal(latest.state);
    answeredYes[questionKey] = polarisedYes(latest);
    answeredNo[questionKey] =
      (latest.state === "ANSWERED" || latest.state === "VERIFIED") &&
      (latest.normalisedJson as { negated?: boolean } | null | undefined)
        ?.negated === true;
    // A question with a response row is no longer "unanswered".
    unanswered[questionKey] = false;
  }

  const symptomCodes: string[] = [];
  const seenSymptoms = new Set<string>();
  for (const code of input.complaints) {
    if (seenSymptoms.has(code)) continue;
    seenSymptoms.add(code);
    symptomCodes.push(code);
  }
  for (const fact of input.symptomFacts) {
    if (seenSymptoms.has(fact.conceptCode)) continue;
    seenSymptoms.add(fact.conceptCode);
    symptomCodes.push(fact.conceptCode);
  }

  const symptomDurationDays: Record<string, number> = {};
  for (const fact of input.symptomFacts) {
    if (fact.durationDays !== null && fact.durationDays !== undefined)
      symptomDurationDays[fact.conceptCode] = fact.durationDays;
  }

  return {
    symptomCodes,
    symptomDurationDays,
    answeredYes,
    answeredNo,
    answeredAny,
    unanswered,
    ageYears: input.patient.ageYears,
    sex: input.patient.sex,
    pregnant: input.patient.pregnant,
    conditionCodes: [...input.conditionCodes],
    medicationCodes: [...input.medicationCodes],
    allergyCategories: [...input.allergyCategories],
    vitals: { ...input.vitals },
    labFlaggedHigh: [...input.labFlaggedHigh],
    labFlaggedLow: [...input.labFlaggedLow],
    documentCount: input.documentCount,
  };
}
