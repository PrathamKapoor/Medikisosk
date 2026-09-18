/**
 * Deterministic longitudinal timeline assembly.
 *
 * A timeline is a sorted sequence of events derived from heterogeneous clinical rows (encounter
 * lifecycle, symptoms, medications, allergies, labs, vitals, triage, documents). This module is
 * pure: it never touches a database, never reads the clock (timestamps are passed in as strings)
 * and never reasons about clinical meaning — it only orders, groups and filters.
 */

/**
 * The source provenance of a timeline event. Mirrors the clinical origin of the fact it summarises
 * so a consumer can tell a patient statement from a documented record from an AI-derived note.
 */
export type TimelineSource =
  | "PATIENT_REPORTED"
  | "DOCUMENT_DERIVED"
  | "VITAL_DERIVED"
  | "PHYSICIAN_ENTERED"
  | "SYSTEM_DERIVED"
  | "AI_DERIVED";

/** A single timeline event as provided by the caller. */
export interface TimelineEventInput {
  eventType: string;
  /** ISO-8601 UTC timestamp. Ordering is purely textual ascending. */
  eventAt: string;
  headline: string;
  detailJson?: string;
  evidenceIds?: readonly string[];
  source: TimelineSource;
  encounterId: string;
  patientId?: string;
  /** Optional grouping key (e.g. an encounter id). Events without one are their own group. */
  groupKey?: string;
}

export type TimelineEvent = TimelineEventInput;

/** A group of events sharing a `groupKey`, with the span they cover. */
export interface TimelineGroup {
  groupKey: string;
  events: readonly TimelineEvent[];
  firstEventAt: string;
  lastEventAt: string;
}

export interface GroupedTimeline {
  /** All input events, sorted ascending by eventAt with stable input-order tie-breaking. */
  readonly events: readonly TimelineEvent[];
  /**
   * Events grouped by `groupKey` (in first-appearance order). Only events that carry a groupKey are
   * attributed to a group; the remaining ungrouped events are returned as a trailing pseudo-group.
   */
  readonly grouped: readonly TimelineGroup[];
}

/**
 * Sort events ascending by eventAt. Ties keep their relative input order (stable), so re-running
 * with the same input always yields the same timeline.
 */
export function buildTimeline(
  events: readonly TimelineEventInput[],
): readonly TimelineEvent[] {
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      const byTime = a.event.eventAt.localeCompare(b.event.eventAt);
      return byTime !== 0 ? byTime : a.index - b.index;
    })
    .map(({ event }) => event);
}

/** Group sorted events by groupKey, preserving first-appearance order of keys. */
export function groupTimeline(
  events: readonly TimelineEventInput[],
): GroupedTimeline {
  const sorted = buildTimeline(events);
  const byKey = new Map<string, TimelineEvent[]>();
  const keyOrder: string[] = [];
  const ungrouped: TimelineEvent[] = [];

  for (const event of sorted) {
    const key = event.groupKey;
    if (!key) {
      ungrouped.push(event);
      continue;
    }
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = [];
      byKey.set(key, bucket);
      keyOrder.push(key);
    }
    bucket.push(event);
  }

  const grouped = keyOrder.map((key) => {
    const bucket = byKey.get(key) as TimelineEvent[];
    return {
      groupKey: key,
      events: bucket,
      firstEventAt: bucket[0]!.eventAt,
      lastEventAt: bucket[bucket.length - 1]!.eventAt,
    };
  });

  if (ungrouped.length > 0) {
    grouped.push({
      groupKey: "\u0000__ungrouped__",
      events: ungrouped,
      firstEventAt: ungrouped[0]!.eventAt,
      lastEventAt: ungrouped[ungrouped.length - 1]!.eventAt,
    });
  }

  return { events: sorted, grouped };
}

export interface TimelineFilter {
  /** Only include events whose eventType is in this set, when provided. */
  types?: readonly string[];
  /** Inclusive lower bound on eventAt. */
  from?: string;
  /** Inclusive upper bound on eventAt. */
  to?: string;
  /** Only include events whose source is in this set, when provided. */
  source?: readonly TimelineSource[];
}

/** Filter a timeline by type, time window and source. Ordering is preserved. */
export function filterEvents(
  timeline: readonly TimelineEvent[],
  filter: TimelineFilter = {},
): readonly TimelineEvent[] {
  return timeline.filter((event) => {
    if (
      filter.types &&
      filter.types.length > 0 &&
      !filter.types.includes(event.eventType)
    )
      return false;
    if (
      filter.source &&
      filter.source.length > 0 &&
      !filter.source.includes(event.source)
    )
      return false;
    if (filter.from !== undefined && event.eventAt < filter.from) return false;
    if (filter.to !== undefined && event.eventAt > filter.to) return false;
    return true;
  });
}
