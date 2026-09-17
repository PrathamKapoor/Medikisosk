/**
 * Triage primitives.
 *
 * The triage level is produced by a deterministic rule engine and never by a language model.
 * See ADR-009.
 */

/** Deterministic safety-engine output. */
export const TRIAGE_LEVELS = ["GREEN", "AMBER", "RED"] as const;
export type TriageLevel = (typeof TRIAGE_LEVELS)[number];

export const TRIAGE_LEVEL_LABELS: Record<TriageLevel, string> = {
  GREEN: "Routine",
  AMBER: "Priority review",
  RED: "Immediate priority assessment",
};

/**
 * Patient-facing wording. Deliberately does NOT say "you are having a heart attack" or
 * "emergency detected by AI" — the system must never diagnose. It states that a priority
 * assessment is required and routes the patient to a human. See ADR-009.
 */
export const TRIAGE_PATIENT_MESSAGE_KEYS: Record<TriageLevel, string> = {
  GREEN: "triage.green.patient_message",
  AMBER: "triage.amber.patient_message",
  RED: "triage.red.patient_message",
};

/** Ordering used when merging several rule outcomes; a higher rank wins. */
export const TRIAGE_SEVERITY_RANK: Record<TriageLevel, number> = {
  GREEN: 0,
  AMBER: 1,
  RED: 2,
};

export function maxTriageLevel(levels: readonly TriageLevel[]): TriageLevel {
  let highest: TriageLevel = "GREEN";
  for (const level of levels) {
    if (TRIAGE_SEVERITY_RANK[level] > TRIAGE_SEVERITY_RANK[highest])
      highest = level;
  }
  return highest;
}

/** Queue priority derived from the triage level. */
export const TRIAGE_PRIORITIES = ["ROUTINE", "URGENT", "EMERGENCY"] as const;
export type TriagePriority = (typeof TRIAGE_PRIORITIES)[number];

export const PRIORITY_SEVERITY_RANK: Record<TriagePriority, number> = {
  ROUTINE: 0,
  URGENT: 1,
  EMERGENCY: 2,
};

export function levelToPriority(level: TriageLevel): TriagePriority {
  switch (level) {
    case "RED":
      return "EMERGENCY";
    case "AMBER":
      return "URGENT";
    case "GREEN":
      return "ROUTINE";
  }
}

/**
 * Queue entry lifecycle. A patient must never disappear from the queue, so terminal states are
 * explicit and every transition is timestamped.
 */
export const QUEUE_STATUSES = [
  "WAITING",
  "CALLED",
  "IN_CONSULTATION",
  "COMPLETED",
  "CANCELLED",
] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export const QUEUE_STATUS_LABELS: Record<QueueStatus, string> = {
  WAITING: "Waiting",
  CALLED: "Called",
  IN_CONSULTATION: "In consultation",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/** Queue ordering: EMERGENCY first, then oldest-first within the same priority. */
export function compareQueueOrder(
  a: { priority: TriagePriority; enqueuedAt: string },
  b: { priority: TriagePriority; enqueuedAt: string },
): number {
  const byPriority =
    PRIORITY_SEVERITY_RANK[b.priority] - PRIORITY_SEVERITY_RANK[a.priority];
  if (byPriority !== 0) return byPriority;
  return a.enqueuedAt.localeCompare(b.enqueuedAt);
}
