/**
 * Machine-readable error catalogue and the project error type.
 *
 * Deliberately absent from every code and message: stack traces, SQL text, internal file paths,
 * provider credentials, raw provider payloads, and PHI. A kiosk screen in a waiting room must never be
 * able to display the internals of the system.
 */

export const ERROR_CODES = [
  // Generic
  "INTERNAL_ERROR",
  "VALIDATION_FAILED",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "SERVICE_UNAVAILABLE",
  "DEPENDENCY_UNAVAILABLE",

  // Auth and authorisation
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "SESSION_EXPIRED",
  "INVALID_CREDENTIALS",
  "ROLE_NOT_PERMITTED",

  // Consent and privacy. These block processing, so they form their own group.
  "CONSENT_MISSING",
  "CONSENT_REVOKED",
  "CONSENT_EXPIRED",
  "CONSENT_PURPOSE_NOT_PERMITTED",
  "RETENTION_WINDOW_ELAPSED",

  // Identity
  "IDENTITY_PROVIDER_UNAVAILABLE",
  "IDENTITY_OTP_EXPIRED",
  "IDENTITY_OTP_INVALID",
  "IDENTITY_OTP_ATTEMPTS_EXCEEDED",
  "IDENTITY_NOT_VERIFIED",
  "IDENTITY_ALREADY_LINKED",

  // Encounter and interview
  "ENCOUNTER_ALREADY_SUBMITTED",
  "ENCOUNTER_NOT_EDITABLE",
  "INTERVIEW_SESSION_NOT_ACTIVE",
  "QUESTION_NOT_IN_PATHWAY",

  // Documents
  "DOCUMENT_QUALITY_INSUFFICIENT",
  "DOCUMENT_TYPE_UNSUPPORTED",
  "DOCUMENT_MALFORMED",
  "DOCUMENT_EXTRACTION_FAILED",

  // AI providers
  "AI_PROVIDER_DISABLED",
  "AI_PROVIDER_TIMEOUT",
  "AI_OUTPUT_INVALID",
  "AI_OUTPUT_UNGROUNDED",

  // Safety
  "TRIAGE_RULE_SET_INVALID",
  "TRIAGE_OVERRIDE_REQUIRES_CLINICIAN",

  // Interoperability
  "FHIR_VALIDATION_FAILED",
  "ABDM_NOT_CONFIGURED",
  "SYNC_ENDPOINT_UNAVAILABLE",

  // Idempotency and feature gating
  "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD",
  "FEATURE_DISABLED",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** HTTP status implied by each error code. Centralised so it cannot drift per-route. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  INTERNAL_ERROR: 500,
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  SERVICE_UNAVAILABLE: 503,
  DEPENDENCY_UNAVAILABLE: 503,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  SESSION_EXPIRED: 401,
  INVALID_CREDENTIALS: 401,
  ROLE_NOT_PERMITTED: 403,
  CONSENT_MISSING: 403,
  CONSENT_REVOKED: 403,
  CONSENT_EXPIRED: 403,
  CONSENT_PURPOSE_NOT_PERMITTED: 403,
  RETENTION_WINDOW_ELAPSED: 410,
  IDENTITY_PROVIDER_UNAVAILABLE: 503,
  IDENTITY_OTP_EXPIRED: 410,
  IDENTITY_OTP_INVALID: 400,
  IDENTITY_OTP_ATTEMPTS_EXCEEDED: 429,
  IDENTITY_NOT_VERIFIED: 403,
  IDENTITY_ALREADY_LINKED: 409,
  ENCOUNTER_ALREADY_SUBMITTED: 409,
  ENCOUNTER_NOT_EDITABLE: 409,
  INTERVIEW_SESSION_NOT_ACTIVE: 409,
  QUESTION_NOT_IN_PATHWAY: 400,
  DOCUMENT_QUALITY_INSUFFICIENT: 422,
  DOCUMENT_TYPE_UNSUPPORTED: 415,
  DOCUMENT_MALFORMED: 422,
  DOCUMENT_EXTRACTION_FAILED: 422,
  AI_PROVIDER_DISABLED: 503,
  AI_PROVIDER_TIMEOUT: 504,
  AI_OUTPUT_INVALID: 502,
  AI_OUTPUT_UNGROUNDED: 502,
  TRIAGE_RULE_SET_INVALID: 500,
  TRIAGE_OVERRIDE_REQUIRES_CLINICIAN: 403,
  FHIR_VALIDATION_FAILED: 500,
  ABDM_NOT_CONFIGURED: 503,
  SYNC_ENDPOINT_UNAVAILABLE: 503,
  IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD: 409,
  FEATURE_DISABLED: 403,
};

/**
 * The project error type. Always carries a code. `details` is structured and must never contain PHI,
 * stack traces or provider payloads, because it is returned to the client.
 */
export class MediKioskError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "MediKioskError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }

  static is(value: unknown): value is MediKioskError {
    return value instanceof MediKioskError;
  }

  /**
   * Convert an unexpected throwable into a safe error. The original message is discarded on purpose:
   * it may contain SQL text or an internal path. Callers log the original separately.
   */
  static fromUnexpected(
    _cause: unknown,
    message = "An unexpected internal error occurred.",
  ): MediKioskError {
    return new MediKioskError("INTERNAL_ERROR", message);
  }
}

/** Convenience constructors for the errors raised most often. */
export const errors = {
  notFound: (what: string, id?: string) =>
    new MediKioskError(
      "NOT_FOUND",
      id ? `${what} ${id} was not found.` : `${what} was not found.`,
    ),
  validation: (message: string, details?: Record<string, unknown>) =>
    new MediKioskError("VALIDATION_FAILED", message, details),
  consentMissing: (purpose: string) =>
    new MediKioskError(
      "CONSENT_MISSING",
      `Consent is required before processing data for purpose "${purpose}".`,
      { purpose },
    ),
  consentRevoked: (purpose: string) =>
    new MediKioskError(
      "CONSENT_REVOKED",
      `Consent for purpose "${purpose}" was withdrawn by the patient.`,
      { purpose },
    ),
  forbidden: (message = "You do not have permission to perform this action.") =>
    new MediKioskError("FORBIDDEN", message),
  unauthenticated: (message = "Authentication is required.") =>
    new MediKioskError("UNAUTHENTICATED", message),
  conflict: (message: string, details?: Record<string, unknown>) =>
    new MediKioskError("CONFLICT", message, details),
  aiDisabled: (capability: string) =>
    new MediKioskError(
      "AI_PROVIDER_DISABLED",
      `The ${capability} capability is disabled for this installation.`,
      { capability },
    ),
  featureDisabled: (flag: string) =>
    new MediKioskError(
      "FEATURE_DISABLED",
      "This capability is not enabled for this hospital.",
      {
        flag,
      },
    ),
  dependency: (dependency: string, message: string) =>
    new MediKioskError(
      "DEPENDENCY_UNAVAILABLE",
      `${dependency} is currently unavailable.`,
      {
        dependency,
        reason: message,
      },
    ),
};
