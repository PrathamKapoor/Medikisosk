/**
 * Interview pathway model.
 *
 * A pathway is clinical knowledge expressed as data: when it applies, what it asks, when it
 * branches, when it escalates, and when it is finished. Pathways are versioned and reviewable, and
 * the interview engine contains no complaint-specific logic. See ADR-008.
 */

import { z } from "zod";
import type { PathwayQuestion } from "./pathway";
import type { TriggerExpression } from "./trigger";

export const completionCriteriaSchema = z.object({
  /** Fraction of *required* SOCRATES dimensions that must be closed for the complaint. */
  socratesRequiredRatio: z.number().min(0).max(1).default(1),
  /** Maximum questions the pathway may ask. Bounds the patient's time at the kiosk. */
  maxQuestions: z.number().int().min(1).max(200).default(40),
});

export type CompletionCriteria = z.infer<typeof completionCriteriaSchema>;

/**
 * A branch of questions entered when `when` evaluates true.
 *
 * Branches are what make the interview adaptive without making it unpredictable: the branch
 * condition is declarative, serialisable, and displayed in the pathway viewer, so a clinician can
 * read exactly why a question appeared.
 */
export interface PathwayBranch {
  readonly key: string;
  readonly when: TriggerExpression;
  readonly questionKeys: readonly string[];
  /** Clinical note describing the branch, shown in the pathway viewer. */
  readonly description: string;
}

/**
 * An escalation advisory.
 *
 * Important: this does NOT set the triage level. Setting triage is the exclusive responsibility of
 * the deterministic red-flag rule engine (ADR-009), which evaluates evidence across symptoms,
 * vitals, demographics and history. A pathway advisory only requests clinician attention.
 */
export interface PathwayEscalation {
  readonly key: string;
  readonly when: TriggerExpression;
  readonly advisory: string;
}

export interface InterviewPathway {
  readonly key: string;
  /** Pathway content version. Recorded on the encounter so any interview is reproducible. */
  readonly version: string;
  readonly displayName: string;
  /** Complaint concept codes this pathway characterises. */
  readonly complaintCodes: readonly string[];
  /** Condition for activating this pathway for an encounter. */
  readonly entryWhen: TriggerExpression;
  /**
   * Default condition for asking this pathway's questions. Individual questions draw their
   * applicability from this plus their own age bounds.
   */
  readonly askWhen?: TriggerExpression;
  readonly questions: readonly PathwayQuestion[];
  readonly branches: readonly PathwayBranch[];
  readonly completion: CompletionCriteria;
  readonly escalation: readonly PathwayEscalation[];
  /** Lower rank is considered earlier when several pathways are active. */
  readonly priorityRank: number;
}

/**
 * Resolve the questions that are actually available in a pathway for a given context.
 *
 * Returns questions in pathway order. The caller applies priority ranking across pathways; this
 * function only answers "is this question part of the active set?".
 */
export function activeQuestionKeys(
  pathway: InterviewPathway,
  evaluate: (when: TriggerExpression) => boolean,
): readonly string[] {
  const keys: string[] = [];
  const seen = new Set<string>();

  for (const question of pathway.questions) {
    if (seen.has(question.key)) continue;
    seen.add(question.key);
    keys.push(question.key);
  }

  for (const branch of pathway.branches) {
    if (!evaluate(branch.when)) continue;
    for (const key of branch.questionKeys) {
      if (seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
  }

  return keys;
}

/** Look a question up by key across a set of pathways. */
export function findQuestion(
  pathways: readonly InterviewPathway[],
  questionKey: string,
): PathwayQuestion | undefined {
  for (const pathway of pathways) {
    const found = pathway.questions.find(
      (question) => question.key === questionKey,
    );
    if (found) return found;
  }
  return undefined;
}

/**
 * Structural validation of a pathway set.
 *
 * Runs at load time, not at question time. A pathway that references a question key it does not
 * define, or that declares a completion criterion it can never satisfy, would otherwise surface as
 * a confusing patient-facing failure mid-interview. Failing fast at startup is the correct trade.
 */
export function validatePathway(pathway: InterviewPathway): readonly string[] {
  const problems: string[] = [];
  const defined = new Set<string>();
  for (const question of pathway.questions) {
    if (defined.has(question.key)) {
      problems.push(
        `Pathway ${pathway.key}: duplicate question key ${question.key}`,
      );
    }
    defined.add(question.key);
  }

  for (const branch of pathway.branches) {
    if (branch.questionKeys.length === 0) {
      problems.push(
        `Pathway ${pathway.key}: branch ${branch.key} has no questions`,
      );
    }
    for (const key of branch.questionKeys) {
      if (!defined.has(key)) {
        problems.push(
          `Pathway ${pathway.key}: branch ${branch.key} references undefined question ${key}`,
        );
      }
    }
  }

  const requiredCount = pathway.questions.filter(
    (question) => question.required,
  ).length;
  if (requiredCount > pathway.completion.maxQuestions) {
    problems.push(
      `Pathway ${pathway.key}: ${requiredCount} required questions exceeds maxQuestions ${pathway.completion.maxQuestions}`,
    );
  }

  if (pathway.questions.length === 0) {
    problems.push(`Pathway ${pathway.key}: contains no questions`);
  }

  return problems;
}
