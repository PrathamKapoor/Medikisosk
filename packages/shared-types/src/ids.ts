/**
 * Branded identifier types.
 *
 * Identifiers are opaque strings, decorated with a phantom brand so that an encounter id can
 * never be passed where a patient id is expected. Clinical code must not be able to mix these up
 * by accident, and a compile error is a much cheaper failure than a crossed patient record.
 */

declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type TenantId = Brand<string, 'TenantId'>;
export type UserId = Brand<string, 'UserId'>;
export type PatientId = Brand<string, 'PatientId'>;
export type EncounterId = Brand<string, 'EncounterId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type DocumentId = Brand<string, 'DocumentId'>;
export type SummaryId = Brand<string, 'SummaryId'>;
export type TriageAssessmentId = Brand<string, 'TriageAssessmentId'>;
export type QueueEntryId = Brand<string, 'QueueEntryId'>;
export type KioskId = Brand<string, 'KioskId'>;
export type ConsentId = Brand<string, 'ConsentId'>;
export type JobId = Brand<string, 'JobId'>;

/** ISO-8601 instant in UTC, e.g. `2026-09-15T10:30:00.000Z`. */
export type IsoDateTime = Brand<string, 'IsoDateTime'>;

/** Calendar date, `YYYY-MM-DD`. Used where time-of-day is clinically meaningless. */
export type IsoDate = Brand<string, 'IsoDate'>;

/** Cast a validated string to a branded identifier. Validation is the caller's responsibility. */
export function asId<T extends string>(value: string): T {
  return value as unknown as T;
}

export function isIsoDateTime(value: string): value is IsoDateTime {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value);
}

export function isIsoDate(value: string): value is IsoDate {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** A page of results, used by every list endpoint for a consistent shape. */
export interface Paged<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}
