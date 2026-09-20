/**
 * Audit trail writer.
 *
 * Audit rows are append-only and PHI-free by construction. This module deliberately exposes only an
 * `append` operation: there is no update and no delete path anywhere in the codebase, because an
 * audit trail that can be edited is not an audit trail.
 *
 * What is captured: actor, action, resource, timestamp, request context, result.
 * What is never captured: free text, symptoms, documents, identifiers, passwords, tokens.
 */

import { ulid } from "ulid";
import type { AppDatabase } from "../db/kysely";
import type { AppLogger, LogContext } from "./logger";

/** The audit action catalogue. Adding an action is a deliberate, reviewable change. */
export type AuditAction =
  | "USER_LOGIN_SUCCEEDED"
  | "USER_LOGIN_FAILED"
  | "USER_LOGOUT"
  | "SESSION_OPENED"
  | "SESSION_WIPED"
  | "IDENTITY_FLOW_STARTED"
  | "IDENTITY_VERIFIED"
  | "IDENTITY_VERIFICATION_FAILED"
  | "CONSENT_GRANTED"
  | "CONSENT_PARTIAL"
  | "CONSENT_DECLINED"
  | "CONSENT_REVOKED"
  | "CONSENT_VIEWED"
  | "PATIENT_SEARCHED"
  | "ENCOUNTER_CREATED"
  | "ENCOUNTER_SUBMITTED"
  | "INTERVIEW_STARTED"
  | "INTERVIEW_LANGUAGE_CHANGED"
  | "FACT_EXTRACTED"
  | "QUESTION_SKIPPED"
  | "QUESTION_DECLINED"
  | "CLARIFICATION_REQUESTED"
  | "SAFETY_CONDITION_TRIGGERED"
  | "TRIAGE_EVALUATED"
  | "FACT_VERIFIED"
  | "FACT_EDITED"
  | "FACT_REJECTED"
  | "VITAL_RECORDED"
  | "DOCUMENT_UPLOADED"
  | "DOCUMENT_QUALITY_REJECTED"
  | "DOCUMENT_REPROCESS_REQUESTED"
  | "OCR_COMPLETED"
  | "TRIAGE_TRIGGERED"
  | "TRIAGE_OVERRIDDEN"
  | "QUEUE_STATUS_CHANGED"
  | "QUEUE_TOKEN_ASSIGNED"
  | "PATIENT_REVIEW_CONFIRMED"
  | "EVIDENCE_PATIENT_CONFIRMED"
  | "ENCOUNTER_COMPLETED"
  | "NOTE_ADDED"
  | "DISPOSITION_RECORDED"
  | "PATIENT_SEARCHED_BY_STAFF"
  | "SUMMARY_GENERATED"
  | "SUMMARY_EDITED"
  | "SUMMARY_ACCEPTED"
  | "SUMMARY_REJECTED"
  | "SUMMARY_VERIFIED"
  | "CONTRADICTION_VIEWED"
  | "CONTRADICTION_RESOLVED"
  | "TIMELINE_VIEWED"
  | "WHAT_CHANGED_VIEWED"
  | "EVIDENCE_VIEWED"
  | "RECORD_VIEWED"
  | "FHIR_GENERATED"
  | "FHIR_VIEWED"
  | "FHIR_TRANSMIT_REQUESTED"
  | "SYNC_JOB_RETRY_REQUESTED"
  | "AYUSH_ASSESSMENT_VIEWED"
  | "AYUSH_ASSESSMENT_RECORDED"
  | "TENANT_CONFIGURED"
  | "TENANT_SETTINGS_UPDATED"
  | "KIOSK_HEARTBEAT"
  | "ANALYTICS_VIEWED"
  | "EVALUATION_RUN_STARTED";

export type AuditResult = "SUCCESS" | "FAILURE" | "DENIED";

export interface AuditEntry {
  readonly tenantId: string;
  readonly actorId?: string;
  readonly actorKind: "STAFF" | "KIOSK" | "SYSTEM";
  readonly action: AuditAction;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly encounterId?: string;
  readonly result: AuditResult;
  /** Non-PHI structured detail: codes, keys, counts. Never free text or identifiers. */
  readonly detail?: Record<string, string | number | boolean>;
}

/**
 * Append an audit row.
 *
 * A failure to write an audit row is logged but never propagated to the caller, with one exception:
 * callers on a safety path may choose to treat a failed audit write as fatal. That choice belongs to
 * the caller, so this function reports the failure through the logger and returns a boolean.
 */
export async function appendAuditEvent(
  db: AppDatabase,
  logger: AppLogger,
  context: LogContext,
  entry: AuditEntry,
): Promise<boolean> {
  try {
    await db
      .insertInto("audit_events")
      .values({
        id: ulid(),
        tenantId: entry.tenantId,
        actorId: entry.actorId ?? null,
        actorKind: entry.actorKind,
        action: entry.action,
        resourceType: entry.resourceType ?? null,
        resourceId: entry.resourceId ?? null,
        encounterId: entry.encounterId ?? null,
        requestId: context.requestId ?? null,
        result: entry.result,
        detailJson:
          entry.detail === undefined ? null : JSON.stringify(entry.detail),
        createdAt: new Date().toISOString(),
      })
      .execute();
    return true;
  } catch (error) {
    // The audit write failed. Log with the code only: the detail payload may contain codes that
    // identify a resource, and the logger scrubs PHI keys independently.
    logger.error(
      { ...context, tenantId: entry.tenantId },
      "Failed to write audit event",
      {
        action: entry.action,
        reason: error instanceof Error ? error.name : "unknown",
      },
    );
    return false;
  }
}
