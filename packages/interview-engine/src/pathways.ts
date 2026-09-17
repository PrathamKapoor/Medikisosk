/**
 * Active pathway selection and branch-gated question resolution.
 *
 * A pathway is active when its `entryWhen` trigger fires (or it is the always-on general-history
 * pathway). Question resolution additionally honours branches: a question referenced by a branch
 * is only asked once that branch's condition is true, so characterisation questions that are only
 * relevant under a branch (e.g. exertional pattern after a positive dyspnoea answer) do not
 * surface prematurely even though they are members of the pathway's question list.
 */

import {
  PATHWAYS,
  evaluateTrigger,
  type InterviewPathway,
  type TriggerExpression,
} from "@medikiosk/clinical-schema";
import { buildTriggerContext } from "./context";
import type { InterviewInput } from "./types";

/**
 * Select and order the pathways active for an encounter.
 *
 * Ordered by `priorityRank` ascending (lower rank first). Deduped by key.
 */
export function selectActivePathways(
  input: InterviewInput,
): readonly InterviewPathway[] {
  const context = buildTriggerContext(input);
  const selected: InterviewPathway[] = [];
  const seen = new Set<string>();

  for (const pathway of PATHWAYS) {
    const alwaysOn =
      "always" in pathway.entryWhen && pathway.entryWhen.always === true;
    const active =
      evaluateTrigger(pathway.entryWhen, context) ||
      (input.complaints.length === 0 && alwaysOn);
    if (!active || seen.has(pathway.key)) continue;
    seen.add(pathway.key);
    selected.push(pathway);
  }

  return selected.sort((a, b) => a.priorityRank - b.priorityRank);
}

/**
 * Resolve the question keys actually available in a pathway, honouring branches.
 *
 * A question key referenced by any branch is gated: it appears in the active set only when at
 * least one of the branches that reference it is active. Base (non-branch) questions are always
 * available. Keys are returned in pathway order.
 */
export function activePathwayKeys(
  pathway: InterviewPathway,
  evaluate: (when: TriggerExpression) => boolean,
): readonly string[] {
  const branchGated = new Set<string>();
  const activeBranchKeys = new Set<string>();
  for (const branch of pathway.branches) {
    for (const key of branch.questionKeys) branchGated.add(key);
    if (evaluate(branch.when)) {
      for (const key of branch.questionKeys) activeBranchKeys.add(key);
    }
  }

  const keys: string[] = [];
  const seen = new Set<string>();
  for (const question of pathway.questions) {
    if (seen.has(question.key)) continue;
    seen.add(question.key);
    if (branchGated.has(question.key) && !activeBranchKeys.has(question.key))
      continue;
    keys.push(question.key);
  }
  for (const key of activeBranchKeys) {
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}
