/**
 * Rule-set coverage: which safety facts are watched, and which are not.
 *
 * A safety input that no rule watches for is the most dangerous possible gap in a deterministic
 * system — it fails silently. That is why this report exists: the gap is surfaced at start-up and
 * in the admin console instead of being discovered during an incident.
 */

import { RED_FLAG_RELEVANT_CONCEPT_CODES } from "@medikiosk/clinical-schema";
import type { RedFlagRule } from "./types";

export interface CoverageEntry {
  readonly watchedFact: string;
  readonly ruleIdentifiers: readonly string[];
}

/** For each distinct fact in any rule's `evidenceRequired`, list the rules watching it. */
export function ruleSetCoverage(
  rules: readonly RedFlagRule[],
): readonly CoverageEntry[] {
  const byFact = new Map<string, string[]>();
  for (const rule of rules) {
    for (const fact of rule.evidenceRequired) {
      const existing = byFact.get(fact);
      if (existing) {
        if (!existing.includes(rule.identifier)) existing.push(rule.identifier);
      } else {
        byFact.set(fact, [rule.identifier]);
      }
    }
  }
  return [...byFact.entries()]
    .map(([watchedFact, ruleIdentifiers]) => ({
      watchedFact,
      ruleIdentifiers: [...ruleIdentifiers].sort(),
    }))
    .sort((a, b) => a.watchedFact.localeCompare(b.watchedFact));
}

/** Facts in the supplied list that no rule watches. An empty list is the only acceptable result. */
export function unwatchedFacts(
  rules: readonly RedFlagRule[],
  factsToWatch: readonly string[],
): readonly string[] {
  const watched = new Set<string>();
  for (const rule of rules) {
    for (const fact of rule.evidenceRequired) watched.add(fact);
  }
  return factsToWatch.filter((fact) => !watched.has(fact));
}

/** Human-readable multi-line coverage summary, naming every unwatched red-flag-relevant fact. */
export function coverageSummary(rules: readonly RedFlagRule[]): string {
  const coverage = ruleSetCoverage(rules);
  const unwatched = unwatchedFacts(rules, RED_FLAG_RELEVANT_CONCEPT_CODES);
  const lines = [
    `Rule set covers ${coverage.length} distinct facts.`,
    ...coverage.map(
      (entry) => `  ${entry.watchedFact}: ${entry.ruleIdentifiers.join(", ")}`,
    ),
  ];
  if (unwatched.length === 0) {
    lines.push(
      "Every red-flag-relevant concept is watched by at least one rule.",
    );
  } else {
    lines.push(
      `UNWATCHED safety-relevant facts (${unwatched.length}): ${unwatched.join(", ")}.`,
    );
    lines.push(
      "Each unwatched fact is a silent gap. Add a rule, or record a clinical rationale for why the fact needs none.",
    );
  }
  return lines.join("\n");
}
