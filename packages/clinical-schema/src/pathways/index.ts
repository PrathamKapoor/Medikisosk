/**
 * The interview pathway registry.
 *
 * One version for the whole set, because an interview is reproducible only against a fixed set of
 * questions and branching rules. The version is recorded on every encounter, so any interview can be
 * replayed against the pathway set that produced it — which is what makes the evaluation harness and
 * any future research measurement meaningful.
 */

import type { InterviewPathway } from "../pathway-model";
import { validatePathway } from "../pathway-model";
import type { SocratesProfile } from "../socrates";
import { CHEST_PAIN_PATHWAY } from "./chest-pain-pathway";
import { CHEST_PAIN_SOCRATES_PROFILE } from "./chest-pain";
import { HISTORY_GENERAL_PATHWAY } from "./history-general";
import { FEVER_PATHWAY, RESPIRATORY_PATHWAY } from "./fever-respiratory";
import { HEADACHE_PATHWAY, ABDOMINAL_PATHWAY } from "./headache-abdominal";
import {
  CHRONIC_DISEASE_PATHWAY,
  SPECIAL_POPULATIONS_PATHWAY,
} from "./specialised-pathways";
import { AYUSH_PATHWAY } from "./ayush";

export const PATHWAY_VERSION = "1.0.0";

export const PATHWAYS: readonly InterviewPathway[] = [
  CHEST_PAIN_PATHWAY,
  HISTORY_GENERAL_PATHWAY,
  FEVER_PATHWAY,
  RESPIRATORY_PATHWAY,
  HEADACHE_PATHWAY,
  ABDOMINAL_PATHWAY,
  CHRONIC_DISEASE_PATHWAY,
  SPECIAL_POPULATIONS_PATHWAY,
  AYUSH_PATHWAY,
];

export const PATHWAY_BY_KEY: ReadonlyMap<string, InterviewPathway> = new Map(
  PATHWAYS.map((pathway) => [pathway.key, pathway]),
);

/**
 * SOCRATES profiles by complaint code.
 *
 * A complaint without a profile has no SOCRATES completion requirement; a complaint with one
 * defines which dimensions must be closed before that complaint is considered characterised. The
 * interview engine consults this registry; adding a profile for a new complaint is a data change,
 * not an engine change.
 */
export const SOCRATES_PROFILES: Readonly<
  Partial<Record<string, SocratesProfile>>
> = {
  // The pathway file declares the profile as a read-only literal (`as const`); the registry
  // adapts it once to the canonical schema type so engine consumers need no casts of their own.
  [CHEST_PAIN_SOCRATES_PROFILE.complaintCode]:
    CHEST_PAIN_SOCRATES_PROFILE as unknown as SocratesProfile,
};

/** Pathways whose complaint list covers the given complaint code. */
export function pathwaysForComplaint(
  complaintCode: string,
): readonly InterviewPathway[] {
  return PATHWAYS.filter((pathway) =>
    pathway.complaintCodes.includes(complaintCode),
  );
}

/** Every question key across every pathway, for the localisation-coverage check. */
export function allQuestionKeys(): readonly string[] {
  const keys: string[] = [];
  for (const pathway of PATHWAYS) {
    for (const question of pathway.questions) keys.push(question.key);
    for (const branch of pathway.branches) keys.push(...branch.questionKeys);
  }
  return keys;
}

/** Interview question inventory: pathway count, question count, and the set version. */
export function questionInventory(): {
  pathwayCount: number;
  questionCount: number;
  pathwayVersion: string;
} {
  return {
    pathwayCount: PATHWAYS.length,
    questionCount: allQuestionKeys().length,
    pathwayVersion: PATHWAY_VERSION,
  };
}

/** Every question object across every pathway, keyed by question key. */
export function allQuestions(): ReadonlyMap<
  string,
  InterviewPathway["questions"][number]
> {
  const byKey = new Map<string, InterviewPathway["questions"][number]>();
  for (const pathway of PATHWAYS) {
    for (const question of pathway.questions) byKey.set(question.key, question);
  }
  return byKey;
}

/**
 * Structural validation of the whole pathway set.
 *
 * Runs at start-up. A pathway that references a question key it does not define, or a question key
 * that collides across pathways, would otherwise surface as a confusing patient-facing failure
 * mid-interview. Failing fast at start-up is the correct trade, because a question key is also a
 * localisation key and a collision would silently show the wrong wording.
 */
export function validateAllPathways(): {
  readonly ok: boolean;
  readonly problems: readonly string[];
} {
  const problems: string[] = [];
  const seenPathwayKeys = new Set<string>();
  const seenQuestionKeys = new Map<string, string>();

  for (const pathway of PATHWAYS) {
    if (seenPathwayKeys.has(pathway.key)) {
      problems.push(`Duplicate pathway key: ${pathway.key}`);
    }
    seenPathwayKeys.add(pathway.key);

    for (const problem of validatePathway(pathway)) problems.push(problem);

    for (const question of pathway.questions) {
      const owner = seenQuestionKeys.get(question.key);
      if (owner && owner !== pathway.key) {
        problems.push(
          `Question key ${question.key} is defined in both ${owner} and ${pathway.key}; keys must be unique across pathways.`,
        );
      } else {
        seenQuestionKeys.set(question.key, pathway.key);
      }
    }
  }

  return { ok: problems.length === 0, problems };
}
