# MediKiosk API Contract v1

**Status:** frozen for implementation. Base path `/api/v1`.
**Related:** ADR-001, ADR-002, ADR-005, ADR-007, ADR-009, ADR-011.

Every endpoint below is specified with purpose, authentication, authorisation, request, response,
errors, side effects and audit behaviour. This document is the single source of truth for the API, the
kiosk and the console. If a client and the server disagree, this document wins.

**Implementation boundary (2026-09-17):** This contract contains future-phase
endpoints as well as implemented routes. It is a design specification, not proof
that every endpoint is available. See the current phase report and `handoff.md`
for exercised routes. No clinical interview, document, physician, FHIR or ABDM
workflow is established by the registration/consent subphase.

---

## 0. Conventions

**Transport.** HTTPS in staging and production; plain HTTP is permitted only for local development.

**Content type.** `application/json; charset=utf-8` everywhere except document upload
(`multipart/form-data`).

**Authentication.** A JWT bearer token in `Authorization: Bearer <token>` for all staff endpoints.
Kiosk endpoints use a kiosk session token from `POST /kiosk/sessions`, scoped to one kiosk, one tenant
and one patient session.

**Tenant.** Clients never send a tenant id. The tenant is derived from the authenticated principal. A
client-supplied tenant id is ignored, and cross-tenant reads return `404` rather than `403` so that the
existence of another tenant's record is not disclosed. See ADR-011.

**Roles.** `PHYSICIAN`, `NURSE`, `TRIAGE`, `ADMIN`, `KIOSK`, `SUPER_ADMIN`. Permissions are derived
from roles, not asserted by the client. `SUPER_ADMIN` may manage configuration and read aggregate
metrics but may **not** read clinical content.

**Idempotency.** Mutating kiosk lifecycle endpoints accept `Idempotency-Key` as a
ULID or UUID. Same authenticated scope, operation, key and canonical payload
replay the original response; changed payload returns
`409 IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD`. Future clinical endpoints
must adopt this convention before offline replay is enabled. Staff login/logout
are not replay-cached.

**Error envelope.** Every error response has exactly this shape and never contains a stack trace, SQL
text, an internal path, a provider payload, or PHI.

```json
{
  "error": {
    "code": "CONSENT_MISSING",
    "message": "Consent is required before processing data for purpose \"treatment\".",
    "requestId": "01J9Z8Y6Q0K3M4N5P6R7S8T9V0",
    "details": { "purpose": "treatment" }
  }
}
```

**Success envelope.** Resources are returned directly. Lists return
`{ "items": [...], "total": n, "limit": n, "offset": n }`.

**Headers.** Every response carries `X-Request-Id`. Rate-limited responses carry `Retry-After`.

**Provenance.** Every derived clinical fact carries:

```json
{
  "originClass": "PATIENT_REPORTED",
  "confidence": 0.82,
  "verificationState": "UNVERIFIED",
  "evidenceIds": ["01J9Z8…"]
}
```

`originClass` is one of `PATIENT_REPORTED`, `DOCUMENT_DERIVED`, `CLINICIAN_ENTERED`, `AI_INFERRED`. It
is never inferred by the client and never rewritten by the server.

**Pagination.** `limit` default 25, maximum 100. `offset` default 0.

---

## 1. Health and capability discovery

### `GET /health`
Liveness. No auth. `200 { "status": "ok", "version": "0.1.0", "uptimeSeconds": n }`.
Deliberately performs no database call, so a database outage cannot cascade into a container restart
loop.

### `GET /ready`
Readiness. No auth. Performs a database round trip. `200 { "status": "ready", "database": "ok" }`, or
`503 { "status": "not_ready", "database": "unavailable" }`.

### `GET /api/v1/capabilities`
No auth. Declares exactly which providers are live, so the product can never present a mock as a real
capability. This is a contract, not a diagnostic screen.

```json
{
  "deploymentMode": "local",
  "providers": {
    "identity": { "provider": "mock",          "isMock": true,  "status": "MOCKED" },
    "llm":      { "provider": "mock",          "isMock": true,  "status": "MOCKED" },
    "asr":      { "provider": "browser",       "isMock": false, "status": "IMPLEMENTED" },
    "tts":      { "provider": "browser",       "isMock": false, "status": "IMPLEMENTED" },

---

## 3. Kiosk session lifecycle

### `POST /api/v1/kiosk/sessions`
Purpose: open a patient session at a registered kiosk. Auth: kiosk device token via `X-Kiosk-Id` +
`X-Kiosk-Token`. Authorisation: the kiosk must be `ACTIVE` for its tenant.
Request `{ "locale": "hi-IN" }`. Response `201`:

```json
{
  "sessionId": "01J9Z8",
  "token": "<kiosk-session-bearer-token>",
  "expiresAt": "2026-09-15T11:15:00.000Z",
  "ttlMinutes": 45,
  "kiosk": { "id": "k-1", "name": "OPD Block A Kiosk 2" },
  "tenant": { "id": "t-1", "name": "Demo District Hospital", "branding": { "primaryColor": "#0F766E" } }
}
```

Errors: `404 NOT_FOUND` when the kiosk is unknown or inactive. A kiosk that exists but belongs to
another tenant also returns `404`, so identities across tenants are not enumerable.
Side effects: creates a session row with a finite TTL. Audit: `SESSION_OPENED`.

### `POST /api/v1/kiosk/sessions/:sessionId/wipe`
Purpose: end the session and destroy transient data. Authorisation: the session itself, or staff of
the tenant.
Response `200 { "wiped": true, "transientArtifactsDeleted": n, "clinicalRecordRetained": true }`.
Side effects: deletes transient audio and pre-processing page images, clears extraction buffers, and
marks the session ended. **Retains the clinical record and the audit trail.** Deleting the record of
care would itself be a clinical and legal failure, so the distinction between transient and record data
is made explicit in the response. Audit: `SESSION_WIPED`.

### `GET /api/v1/kiosk/sessions/:sessionId`
Auth: session token. Returns session state, remaining TTL and the current interview step, so a kiosk
that reloads mid-interview resumes rather than restarts. Audit: none (high frequency, read only).

### `PATCH /api/v1/kiosk/sessions/:sessionId`
Auth: session token. Request `{ "locale": "mr-IN" }`. Changes presentation language
without replacing patient identity or consent history. The locale must be supported
by the tenant and have published consent wording; switching language is not a new
consent grant. Current consent retains the language originally presented.

---

## 4. Identity

### `POST /api/v1/kiosk/identity/start`
Request `{ "sessionId": "s-1", "method": "ABHA_OTP" | "ABHA_QR" | "GUEST" | "RETURNING" }`.
Response for an ABHA flow:
`201 { "challengeId": "c-1", "otpLength": 6, "expiresAt": "2026-09-15T10:35:00.000Z", "providerName": "mock" }`.
Response for a guest flow: `201 { "guestRef": "g-1", "patientId": "p-1", "providerName": "mock", "verified": false }`.
Errors: `503 IDENTITY_PROVIDER_UNAVAILABLE`, `403 FORBIDDEN`.
Audit: `IDENTITY_FLOW_STARTED`. `providerName` is returned so the kiosk can display an honest notice
when identity is a mock rather than ABHA.

### `POST /api/v1/kiosk/identity/verify`
Request `{ "challengeId": "c-1", "otp": "123456" }`.
Response `200 { "patientId": "p-1", "verified": true, "displayNameMasked": "R a K r", "abhaNumberMasked": "XX-XXXX-XXXX-1234" }`.
Errors: `410 IDENTITY_OTP_EXPIRED`, `400 IDENTITY_OTP_INVALID`, `429 IDENTITY_OTP_ATTEMPTS_EXCEEDED`.
Side effects: creates or matches a patient; links an external identifier.
Audit: `IDENTITY_VERIFIED` / `IDENTITY_VERIFICATION_FAILED`. Only the masked identifier is ever logged.

**Synthetic identity boundary:** The local mock challenge accepts the displayed
synthetic demonstration OTP `123456`. `ABHA_OTP`, `ABHA_QR` and `RETURNING` mock
paths do not verify real ABHA, scan a real QR or retrieve an existing person's
medical record. Responses identify `providerName: "mock"`; `verified: true` means
only that the synthetic challenge was completed. Do not enter real identifiers.

---

## 5. Consent

### `GET /api/v1/consent/versions?locale=hi-IN`
No auth, because consent wording must be readable before authentication to be meaningful.
Response `200 { "consentVersion": "1.0.0", "locale": "hi-IN", "purposes": [{ "key": "treatment", "statementKey": "consent.purpose.treatment", "categories": ["IDENTITY","SYMPTOMS","DOCUMENTS","VOICE","VITALS"], "required": true }] }`.

### `POST /api/v1/kiosk/consent`
Request:

```json
{
  "sessionId": "s-1",
  "patientId": "p-1",
  "consentVersion": "1.0.0",
  "locale": "hi-IN",
  "method": "TOUCH_CONFIRMED",
  "decisions": [
    { "purpose": "treatment", "granted": true,  "categories": ["IDENTITY","SYMPTOMS","DOCUMENTS","VOICE","VITALS"] },
    { "purpose": "research",  "granted": false, "categories": [] },
    { "purpose": "analytics", "granted": true,  "categories": ["SESSION_METRICS"] }
  ]
}
```

Partial consent is a first-class outcome, not an edge case. Response `201` with the persisted consent
record including `grantedAt`, `expiresAt` and per-purpose decisions.
Declining a purpose is **valid input, not an error**: it returns `201` with that purpose withheld and a
flag telling the kiosk to stop. Returning an error would coerce the patient.
Audit: `CONSENT_GRANTED` / `CONSENT_PARTIAL` / `CONSENT_DECLINED`.

### `POST /api/v1/consent/:consentId/revoke`
Request `{ "reason": "PATIENT_REQUEST" }`. Response `200` with the updated record.
Side effects: every subsequent `requireConsent` guard fails immediately. The guard runs in the domain
layer, not the UI, so a revoked consent cannot be bypassed by calling the API directly.
Audit: `CONSENT_REVOKED`.

### `GET /api/v1/patients/:patientId/consents`
Authorisation: `patient.read`. Audit: `CONSENT_VIEWED`.

---

## 6. Encounters

### `POST /api/v1/encounters`
Request:

```json
{
  "patientId": "p-1",
  "sessionId": "s-1",
  "encounterType": "OPD",
  "chiefComplaintCodes": ["MK-SYM-001"],
  "chiefComplaintVerbatim": "seene mein dard kal se",
  "locale": "hi-IN",
  "ayushMode": false,
  "questionnaireVersion": "1.0.0"
}
```

Response `201 { "encounterId": "e-1", "status": "IN_PROGRESS", "activePathways": ["PATH-CHEST-PAIN","PATH-HISTORY-GENERAL"] }`.
Errors: `403 CONSENT_MISSING` when treatment consent is absent. The guard runs before any write, so a
consent gap is a hard stop rather than a warning.
Audit: `ENCOUNTER_CREATED`.

### `GET /api/v1/encounters/:encounterId`
Authorisation: `patient.read`. The physician console's single main read. Returns the complete case:
patient header, chief complaint, SOCRATES state, symptoms, history, medications, allergies, vitals,
labs, documents, red flags, contradictions, timeline deltas, summary and verification state.
Audit: `RECORD_VIEWED`.

### `POST /api/v1/encounters/:encounterId/submit`
Authorisation: `encounter.submit`.
Response `200 { "status": "READY_FOR_REVIEW", "triageLevel": "RED", "queueEntryId": "q-1" }`.
Errors: `409 ENCOUNTER_ALREADY_SUBMITTED`.
Side effects: runs the deterministic safety engine, creates or updates the triage queue entry, and
enqueues FHIR generation into the sync outbox. Audit: `ENCOUNTER_SUBMITTED`, `TRIAGE_TRIGGERED`.
> **Phase 3:** the implemented response is `{ status:'READY_FOR_REVIEW', triageLevel, priority,
> queueEntryId, incomplete, outstandingRequired }`. The FHIR-outbox enqueue is `PLANNED` (no
> FHIR layer exists yet); the queue entry IS created (priority from the triage level, status
> `WAITING`). `GET /encounters/:encounterId` is implemented for the kiosk owner and for staff
> with `patient.read`.

---

## 7. Interview

> **Phase 3 implementation notes (2026-09-18).** Endpoints `GET …/interview/next`,
> `POST …/interview/response`, `POST …/interview/finish`, `POST …/interview/language` and
> `POST /encounters/:id/submit` are implemented by the deterministic interview runtime
> (`packages/interview-engine` + `services/api/src/interview`). Deviations from this section's
> example shapes, all implemented:
> - `next` response `progress` carries `activeCount` and `requiredClosed/requiredTotal` plus
>   `socratesRequiredRatio`; `remainingEstimate` from the example is **not** emitted.
> - `next` and `response` responses additionally include `completion`
>   (`{status, outstandingRequired, outstandingReason, canFinishAnyway, maxQuestionsReached}`),
>   `safetyStatus` (`GREEN`/`AMBER`/`RED`/`NOT_EVALUATED`), `requiresHumanReview` and
>   `rationale` (the selector's deterministic reason).
> - `response` accepts `state` ∈ `ANSWERED|SKIPPED|DECLINED|UNKNOWN|NOT_APPLICABLE` (default
>   `ANSWERED`); the server recomputes normalisation and stores `hintMismatch` when the supplied
>   `normalisedAnswer` disagrees. `DECLINED`/`UNKNOWN` are terminal (evidence row created,
>   never coerced to "no"); `SKIPPED` keeps the question re-askable while below its ask budget.
> - `submit` returns `{status:'READY_FOR_REVIEW', triageLevel, priority, queueEntryId,
>   incomplete, outstandingRequired}`; it runs the final deterministic triage, creates the queue
>   entry, and transitions encounter → `SUBMITTED` + interview session → `COMPLETED`. FHIR
>   outbox enqueue remains `PLANNED`.

### `GET /api/v1/encounters/:encounterId/interview/next`
Authorisation: `encounter.read`. Returns the question the engine has selected, with the reason it was
selected.

```json
{
  "question": {
    "key": "q.chest_pain.safety_dyspnoea",
    "kind": "YES_NO",
    "category": "SAFETY_CRITICAL",
    "pathwayKey": "PATH-CHEST-PAIN",
    "promptKey": "q.chest_pain.safety_dyspnoea",
    "options": [],
    "socratesDimensions": ["ASSOCIATED"],
    "rationale": "Chest pain with breathlessness is the highest-acuity presentation and is asked before anything else."
  },
  "progress": { "asked": 3, "remainingEstimate": 11, "socratesRequiredRatio": 0.25 },
  "complete": false
}
```

When the interview is finished:
`{ "question": null, "complete": true, "completeness": { "requiredRatio": 1, "outstanding": [] } }`.

### `POST /api/v1/encounters/:encounterId/interview/response`
Request:

```json
{
  "questionKey": "q.chest_pain.safety_dyspnoea",
  "state": "ANSWERED",
  "modality": "VOICE",
  "rawAnswer": "haan saans phool rahi hai",
  "asrConfidence": 0.78,
  "asrLanguage": "hi-IN",
  "normalisedAnswer": {
    "conceptCodes": ["MK-SYM-002"],
    "severity": "MODERATE",
    "confidence": 0.71,
    "language": "hi-IN",
    "codeMixed": true,
    "negated": false,
    "uncertain": false
  }
}
```

`state` is one of `ANSWERED`, `SKIPPED`, `DECLINED`, `UNKNOWN`, `NOT_APPLICABLE`. The server
**recomputes** normalisation and does not trust the client's interpretation blindly: a mismatch above a
threshold is recorded, and the client value is kept only as a hint. `DECLINED` and `UNKNOWN` are
terminal and are never converted into a negative answer.

Response `201`:

```json
{
  "responseId": "r-1",
  "evidenceIds": ["ev-1"],
  "advisories": [{ "key": "ESC-CHEST-PAIN-001", "advisory": "Chest pain with an associated cardiac symptom was reported." }],
  "nextQuestionKey": "q.chest_pain.safety_sweating",
  "normalisationAgreed": true
}
```
Audit: `FACT_EXTRACTED`. The audit row stores codes and the question key, **not** the free text.

### `POST /api/v1/encounters/:encounterId/interview/language`
Request `{ "locale": "mr-IN", "fromStep": 7 }`.
Response `200 { "locale": "mr-IN", "resumedAtStep": 7, "clinicalStatePreserved": true }`.
Purpose: switch language mid-interview. Clinical state is stored language-independently, so only
presentation changes. Audit: `INTERVIEW_LANGUAGE_CHANGED`.

### `POST /api/v1/encounters/:encounterId/interview/finish`
Response `200 { "complete": false, "unansweredRequired": ["q.history.medications"], "canFinishAnyway": true }`.
Advisory only. The engine reports what is missing and lets the patient finish. Blocking a patient from
finishing because they declined a question would be coercion.

---

## 8. Documents

### `POST /api/v1/encounters/:encounterId/documents`
Purpose: upload a prescription, laboratory report, discharge summary or certificate.
Auth: session or bearer. Authorisation: `document.upload`. `multipart/form-data` with `file` and an
optional `documentType` field.
Constraints, enforced before the file is parsed: maximum 10 MB per file, maximum 10 pages, MIME types
`image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Anything else is rejected.
Response `202` when accepted for asynchronous processing:

```json
{ "documentId": "d-1", "status": "QUEUED", "quality": { "acceptable": true, "issues": [] }, "jobId": "j-1" }
```

When quality is inadequate the response is `200`, not an error:

```json
{
  "documentId": "d-1",
  "status": "REJECTED_QUALITY",
  "quality": { "acceptable": false, "issues": ["DOCUMENT_TOO_DARK"] },
  "messageKey": "document.quality.retake"
}
```

and the document is **not** extracted. Silently extracting from an unreadable image is how confident
wrong data enters a record.
Errors: `415 DOCUMENT_TYPE_UNSUPPORTED`, `413 PAYLOAD_TOO_LARGE`, `422 DOCUMENT_MALFORMED`.
Audit: `DOCUMENT_UPLOADED`, `DOCUMENT_QUALITY_REJECTED`.

### `GET /api/v1/encounters/:encounterId/documents`
List of document summaries with `status` one of `QUEUED`, `PROCESSING`, `EXTRACTED`, `FAILED`,
`REJECTED_QUALITY`, `VERIFIED`.

### `GET /api/v1/documents/:documentId/extraction`
Extracted entities for physician review, each with confidence and verification state:

```json
{
  "documentId": "d-1",
  "documentType": "LAB_REPORT",
  "ocrConfidence": 0.88,
  "pages": [{ "pageNumber": 1, "textPreview": "Hb 9.2 g/dL (12-16)", "qualityScore": 0.9 }],
  "entities": [
    {
      "id": "en-1",
      "kind": "LAB_RESULT",
      "testCode": "MK-LAB-001",
      "rawText": "Hb 9.2 g/dL (12-16)",
      "normalised": { "value": 9.2, "unit": "g/dL", "referenceLow": 12, "referenceHigh": 16, "referenceSource": "SOURCE_DOCUMENT" },
      "flag": "LOW",
      "confidence": 0.86,
      "verificationState": "UNVERIFIED",
      "evidenceId": "ev-2"
    },
    {
      "id": "en-2",
      "kind": "MEDICATION",
      "conceptCode": "MK-MED-001",
      "rawText": "Tab Glycomet 500",
      "normalised": { "doseValue": 500, "doseUnit": "mg", "frequency": "BD", "route": "ORAL" },
      "confidence": 0.64,
      "verificationState": "UNVERIFIED",
      "needsClinicianReview": true,
      "evidenceId": "ev-3"
    }
  ],
  "lowConfidenceCount": 1
}
```

`needsClinicianReview` is true below 0.5 confidence. Such entities are stored but must not influence
the triage level until a clinician verifies them.

### `POST /api/v1/documents/:documentId/extraction/entities/:entityId/verify`
Request `{ "decision": "ACCEPT" | "EDIT" | "REJECT" | "UNCERTAIN", "corrected": { "doseValue": 500 } }`.
Authorisation: `document.verify`. Response `200` with the updated entity.
Side effects: `ACCEPT` promotes the entity to `VERIFIED` and makes it eligible to affect triage;
`REJECT` removes it from clinical consideration while keeping it in the audit trail.
Audit: `FACT_VERIFIED` / `FACT_EDITED` / `FACT_REJECTED`, recording before and after values.

### `POST /api/v1/documents/:documentId/reprocess`
Authorisation: `document.upload`. Response `202 { "jobId": "j-2" }`. Used after a retake.
Audit: `DOCUMENT_REPROCESS_REQUESTED`.

---

## 9. Vitals

### `GET /api/v1/vitals/devices`
Auth: kiosk or bearer. Lists attached devices and, critically, whether they are real:

```json
{ "devices": [{ "deviceId": "mock-bp-1", "kind": "BLOOD_PRESSURE", "provider": "mock", "isMock": true, "status": "AVAILABLE" }] }
```

### `POST /api/v1/encounters/:encounterId/vitals`
Request:

```json
{
  "readings": [
    { "conceptCode": "MK-VIT-001", "systolic": 158, "diastolic": 94, "unit": "mmHg", "measuredAt": "2026-09-15T10:30:00.000Z", "source": "KIOSK_DEVICE", "deviceId": "mock-bp-1" },
    { "conceptCode": "MK-VIT-003", "value": 102, "unit": "F", "measuredAt": "2026-09-15T10:30:00.000Z", "source": "MANUAL_ENTRY" },
    { "conceptCode": "MK-VIT-004", "value": 93, "unit": "%", "measuredAt": "2026-09-15T10:30:00.000Z", "source": "MANUAL_ENTRY" }
  ]
}
```

Response `201`:

```json
{
  "stored": [{ "id": "v-1", "conceptCode": "MK-VIT-003", "value": 38.9, "unit": "Cel", "implausible": false }],
  "issues": ["Unit \"ZZ\" is not recognised for this vital, so the value was not recorded."],
  "derived": [{ "conceptCode": "MK-VIT-009", "value": 24.8, "unit": "kg/m2" }]
}
```

Note that the Fahrenheit input is stored as Celsius: unit conversion is the server's responsibility. An
unrecognised unit produces an issue and stores nothing, because a silently unconverted value
misrepresents the measurement.
Audit: `VITAL_RECORDED`.

---

## 10. Triage

### `GET /api/v1/encounters/:encounterId/triage`
Authorisation: `triage.read`. The full explainable assessment:

```json
{
  "assessmentId": "ta-1",
  "level": "RED",
  "priority": "EMERGENCY",
  "ruleSetVersion": "1.0.0",
  "requiresHumanReview": true,
  "explanation": "Priority assessment required. CHEST_PAIN_HIGH_RISK_001 (v1.0.0): chest pain with shortness of breath. Evidence: MK-SYM-001, MK-SYM-002. Rule set 1.0.0.",
  "hits": [
    {
      "ruleIdentifier": "CHEST_PAIN_HIGH_RISK_001",
      "ruleVersion": "1.0.0",
      "severity": "RED",
      "action": "IMMEDIATE_HUMAN_TRIAGE",
      "description": "Chest pain with shortness of breath",
      "clinicalRationale": "Chest pain with breathlessness is a high-acuity presentation requiring immediate human assessment.",
      "source": "curated starter set, requires clinical review",
      "evidenceRefs": ["MK-SYM-001", "MK-SYM-002"],
      "evidenceIds": ["ev-1", "ev-4"],
      "advisoryOnly": false
    }
  ],
  "overriddenBy": null,
  "patientMessageKey": "triage.red.patient_message"
}
```

`evidenceIds` resolve to real evidence rows so the console can render the trace. `patientMessageKey` is
a localisation key, never an inline string, and its English wording deliberately does not diagnose.
Audit: `TRIAGE_TRIGGERED` on first evaluation.

### `POST /api/v1/encounters/:encounterId/triage/override`
Authorisation: `triage.override` (physician or triage nurse only).
Request `{ "level": "AMBER", "reason": "Symptoms resolved after rest; re-assessed at triage desk." }`.
Response `200` with the assessment showing `overriddenBy`.
Errors: `403 TRIAGE_OVERRIDE_REQUIRES_CLINICIAN`.
Audit: `TRIAGE_OVERRIDDEN` with actor, previous level, new level and reason. The system records the
override and never overrides the clinician.

### `GET /api/v1/queue?status=&priority=&limit=&offset=`
Authorisation: `triage.read`. Ordered `EMERGENCY` first, then oldest first within a priority. Each entry
carries `{ queueEntryId, encounterId, patientHeader, priority, status, enqueuedAt, reason, ruleIdentifiers, evidenceIds }`.
Audit: none.

### `POST /api/v1/queue/:queueEntryId/status`
Request `{ "status": "CALLED" | "IN_CONSULTATION" | "COMPLETED" | "CANCELLED", "reason": "Called to room 3" }`.
Authorisation: `triage.update`. Audit: `QUEUE_STATUS_CHANGED`.

### `GET /api/v1/queue/stream`
Server-sent events emitting `queue.updated` with the current ordered queue on every change.
Authorisation: `triage.read`. Exists so the triage console is genuinely real-time rather than polling.

---

## 11. Clinical read model

### `GET /api/v1/encounters/:encounterId/evidence?claimId=`
Authorisation: `patient.read`. Returns evidence rows for the encounter, optionally filtered to one claim:

```json
{
  "id": "ev-1",
  "type": "INTERVIEW_RESPONSE",
  "originClass": "PATIENT_REPORTED",
  "source": "questionnaire_response",
  "sourceRef": "q.chest_pain.safety_dyspnoea",
  "rawValue": "haan saans phool rahi hai",
  "normalisedValue": { "conceptCodes": ["MK-SYM-002"], "severity": "MODERATE" },
  "confidence": 0.71,
  "capturedAt": "2026-09-15T10:31:12.000Z",
  "language": "hi-IN",
  "verificationState": "UNVERIFIED",
  "verifiedBy": null
}
```

`rawValue` is immutable. This endpoint is what makes the evidence-trace feature real rather than a UI
device: the console renders exactly what was captured and how it was interpreted.
Audit: `EVIDENCE_VIEWED`.

### `GET /api/v1/encounters/:encounterId/timeline`
Chronological events across encounters, each with its evidence. Events are typed
`ENCOUNTER | SYMPTOM | DIAGNOSIS | MEDICATION | PROCEDURE | LAB_RESULT | VITAL | DOCUMENT | ADMISSION | DISCHARGE`.
Audit: `TIMELINE_VIEWED`.

### `GET /api/v1/encounters/:encounterId/contradictions`
Unresolved conflicts for human resolution, each with both sides and their provenance:

```json
{
  "contradictions": [
    {
      "id": "c-1",
      "kind": "MEDICATION_DISCREPANCY",
      "severity": "HIGH",
      "statementA": { "text": "Patient reports no current medications", "originClass": "PATIENT_REPORTED", "evidenceIds": ["ev-9"] },
      "statementB": { "text": "Metformin 500 mg BD on prescription dated 2026-06-02", "originClass": "DOCUMENT_DERIVED", "evidenceIds": ["ev-12"] },
      "resolutionState": "OPEN",
      "suggestedQuestion": "Confirm whether metformin is still being taken."
    }
  ]
}
```
The system surfaces contradictions and asks for human resolution. It never resolves one silently.
Audit: `CONTRADICTION_VIEWED`.

### `POST /api/v1/contradictions/:contradictionId/resolve`
Authorisation: `contradiction.resolve` (clinician).
Request `{ "resolution": "ACCEPT_A" | "ACCEPT_B" | "MERGE" | "DEFER", "note": "Patient confirms metformin continues." }`.
Audit: `CONTRADICTION_RESOLVED` with the resolution and note.

### `GET /api/v1/encounters/:encounterId/what-changed`
Structured comparison against the previous encounter, every item evidence-linked:

```json
{
  "baselineEncounterId": "e-0",
  "baselineAt": "2026-03-04T09:00:00.000Z",
  "changes": [
    { "kind": "NEW", "subject": "Dyspnoea", "detail": "Not present at the previous visit.", "evidenceIds": ["ev-1"] },
    { "kind": "WORSENED", "subject": "Haemoglobin", "detail": "11.2 g/dL to 9.2 g/dL (-17.9%).", "evidenceIds": ["ev-2","ev-20"] },
    { "kind": "UNCHANGED", "subject": "Metformin 500 mg BD", "detail": "Continued.", "evidenceIds": ["ev-3"] },
    { "kind": "CONFLICTING", "subject": "Current medications", "detail": "Patient reports none; a prescription lists metformin.", "evidenceIds": ["ev-9","ev-12"], "contradictionId": "c-1" }
  ]
}
```
Every generated comparison carries evidence. The engine never turns a comparison into a diagnosis.
Audit: `WHAT_CHANGED_VIEWED`.

### `GET /api/v1/encounters/:encounterId/summary`
The AI-synthesised physician brief, section by section, each section carrying provenance and
verification state. Sections: `CHIEF_COMPLAINT`, `HPI`, `SOCRATES`, `PAST_MEDICAL_HISTORY`,
`PAST_SURGICAL_HISTORY`, `MEDICATION_HISTORY`, `ALLERGY_HISTORY`, `FAMILY_HISTORY`, `PERSONAL_HISTORY`,
`REVIEW_OF_SYSTEMS`, `VITALS`, `INVESTIGATIONS`, `PREVIOUS_TREATMENT`, `CURRENT_MEDICATIONS`,
`DOCUMENTS`, `RED_FLAGS`, `CONTRADICTIONS`, `TIMELINE_CHANGES`, plus the four SOAP sections
`SUBJECTIVE`, `OBJECTIVE`, `ASSESSMENT`, `PLAN`.

```json
{
  "summaryId": "s-1",
  "generatedBy": { "provider": "mock", "model": "medikiosk-deterministic-v1", "promptId": "case-synthesis", "promptVersion": "1.0.0" },
  "sections": [
    {
      "key": "ASSESSMENT",
      "text": "Not established from intake. AI-suggested consideration: possible acute coronary syndrome given chest pain with dyspnoea and abnormal vitals.",
      "kind": "AI_INFERRED",
      "evidenceIds": ["ev-1", "ev-4"],
      "verificationState": "UNVERIFIED"
    }
  ],
  "ungroundedClaimCount": 0
}
```

An `ASSESSMENT` with no supporting evidence renders as "Not established from intake." Any model
consideration is explicitly labelled and requires physician review. `ungroundedClaimCount` is the count
of sections the synthesiser could not evidence, reported rather than hidden.
Audit: `SUMMARY_GENERATED`.

---

## 12. Physician review

### `PATCH /api/v1/encounters/:encounterId/summary/sections/:sectionKey`
Authorisation: `summary.edit`.
Request `{ "text": "…", "action": "EDIT" | "ACCEPT" | "REJECT" }`.
Response `200` with the section showing `verificationState`, `editedBy`, `editedAt`, and the retained
`originalAiText`. The original AI output is never overwritten, so a reviewer can always see what the
system produced and what the clinician changed.
Audit: `SUMMARY_EDITED` / `SUMMARY_ACCEPTED` / `SUMMARY_REJECTED`.

### `POST /api/v1/encounters/:encounterId/summary/verify`
Authorisation: `summary.verify` (physician only).
Request `{ "attestation": "I have reviewed and verified this case summary." }`.
Response `200 { "verified": true, "verifiedBy": "u-1", "verifiedAt": "…", "sectionsVerified": 20, "sectionsRejected": 1 }`.
Errors: `400 VALIDATION_FAILED` when a required section is still `UNVERIFIED` and `force` is not set;
`403 FORBIDDEN` for a non-physician.
Audit: `SUMMARY_VERIFIED`. This is the point at which an AI-assisted record becomes a clinician-verified
record, and the distinction is permanent in the data.

---

## 13. AYUSH

### `GET /api/v1/encounters/:encounterId/ayush`
Returns the Dashavidha Pariksha assessment with one slot per item, its option key, evidence and notes.
Audit: `AYUSH_ASSESSMENT_VIEWED`.

### `POST /api/v1/encounters/:encounterId/ayush`
Request `{ "items": [{ "item": "PRAKRITI", "optionKey": "VATA_PITTA", "notes": "Recorded at kiosk." }, { "item": "AGNI", "notes": "Manda" }] }`.
Authorisation gated by the `ayush_enabled` feature flag. Audit: `AYUSH_ASSESSMENT_RECORDED`.
The same consent, evidence and verification machinery applies; AYUSH data is never second-class.

---

## 14. Interoperability

### `POST /api/v1/encounters/:encounterId/fhir/bundle`
Authorisation: `fhir.generate`. Response `200` with the FHIR R4 `Bundle` and a `fhirResourceId`.
Errors: `500 FHIR_VALIDATION_FAILED` listing the failing checks. Generated bundles are validated before
they are returned, not merely shaped like FHIR.
Audit: `FHIR_GENERATED`.

### `GET /api/v1/encounters/:encounterId/fhir`
Returns persisted mapped resources with their versions. Audit: `FHIR_VIEWED`.

### `POST /api/v1/encounters/:encounterId/fhir/transmit`
Authorisation: `fhir.transmit`. Enqueues transmission into the sync outbox and returns `202`.
If the configured endpoint is unavailable the job is retained and retried; clinical data is never lost
because a hospital endpoint was down. Audit: `FHIR_TRANSMIT_REQUESTED`.

### `GET /api/v1/sync/jobs?status=PENDING&limit=`
Authorisation: `sync.read`. Outbox listing with `attempts`, `nextAttemptAt`, `lastError`. Audit: none.

### `POST /api/v1/sync/jobs/:jobId/retry`
Authorisation: `sync.retry`. Audit: `SYNC_JOB_RETRY_REQUESTED`.

### `GET /api/v1/abdm/status`
Authorisation: `abdm.read`. Reports adapter status honestly:

```json
{
  "provider": "mock",
  "isMock": true,
  "status": "MOCKED",
  "blocked": [
    "ABDM sandbox client credentials are required",
    "A registered health facility identifier is required"
  ],
  "activationChecklist": [
    "Register the facility on the ABDM sandbox",
    "Obtain client id and client secret",
    "Set IDENTITY_PROVIDER=abha and the ABDM_* variables",
    "Run the contract test suite against the sandbox"
  ]
}
```
No ABDM exchange has ever been executed by this codebase, and this endpoint says so.

---

## 15. Administration and analytics

### `GET /api/v1/admin/tenants`, `POST /api/v1/admin/tenants`
Authorisation: `tenant.manage` (`ADMIN` or `SUPER_ADMIN`). Tenant CRUD with branding, departments,
doctors and locale configuration. Audit: `TENANT_CONFIGURED`.

### `GET /api/v1/admin/tenants/:tenantId/settings`, `PUT /api/v1/admin/tenants/:tenantId/settings`
Tenant-scoped settings: enabled locales, feature flags, triage thresholds, laboratory reference ranges,
FHIR endpoint, ABDM configuration. Every change to a clinical rule or threshold is versioned and
audited, because a hospital tuning its escalation thresholds must be able to see who changed what and
when. Audit: `TENANT_SETTINGS_UPDATED`.

### `GET /api/v1/admin/kiosks`
Authorisation: `kiosk.read`. Kiosk fleet with `status`, `softwareVersion`, `lastSeenAt`, and hardware
status for microphone, camera, scanner and printer. Audit: none.

### `POST /api/v1/admin/kiosks`, `POST /api/v1/admin/kiosks/:kioskId/heartbeat`
Registration and heartbeat. Heartbeat updates `lastSeenAt` and hardware status. A kiosk that stops
sending heartbeats appears as `STALE` in the command centre. Audit: `KIOSK_HEARTBEAT`.

### `GET /api/v1/admin/analytics/overview?from=&to=`
Authorisation: `analytics.read`. Operational metrics with **no PHI**: patients per day, intake duration
percentiles, queue time, physician review time, language distribution, document counts, OCR success and
correction rates, AI edit rates, red-flag counts, failed sessions, sync failures, kiosk uptime.
Deliberately excludes clinical free text. Audit: `ANALYTICS_VIEWED`.

### `GET /api/v1/admin/audit?actor=&action=&from=&to=`
Authorisation: `audit.read`. Audit rows contain actor, action, resource, timestamp, request context and
result, and never contain raw PHI.

### `POST /api/v1/admin/evaluation/run`
Authorisation: `evaluation.run` plus the `research_mode_enabled` flag.
Request `{ "datasetVersion": "2026.09", "cases": ["CHEST-PAIN-EMERGENCY-001"], "recordProviderVersions": true }`.
Response `202 { "runId": "r-1", "jobId": "j-9" }`. Runs the evaluation harness against synthetic cases
with committed ground truth, recording the software commit, model versions, prompt versions and
rule-set version so a result can be reproduced. Audit: `EVALUATION_RUN_STARTED`.

### `GET /api/v1/evaluation/runs/:runId`
Authorisation: `evaluation.read`. Metrics per case and aggregate, plus failure examples. Metrics are
reported as `MEDIKIOSK BENCHMARK RESULT`; they are synthetic-dataset results and are never presented as
clinical validation.

---

## 16. Failure behaviour

Every external dependency can fail, and each has a defined recovery:

| Dependency | On failure | Recovery |
|---|---|---|
| LLM | Falls back to the deterministic provider; section marked `AI_INFERRED` with lower confidence | Retry once, then deterministic fallback |
| OCR | Document status `FAILED`, patient asked to retake or continue | Reprocess endpoint |
| ASR | Kiosk offers touch fallback; never traps a patient in voice | Touch modality |
| TTS | Kiosk continues in text-only mode | Text |
| Database | `/ready` reports not-ready; writes fail closed, never open | Operator action |
| FHIR endpoint | Job stays in the outbox with backoff | Automatic retry, manual retry endpoint |
| ABDM | Job retained, status reported as unavailable | Automatic retry after backoff |
| Device | Reading rejected with an issue; manual entry offered | Manual entry |
| Network (kiosk offline) | Intake continues locally; requests queued and replayed with idempotency keys | Automatic replay |

In every case the operation fails closed. A failed extraction never becomes a normal value, a failed
triage evaluation never becomes GREEN, and a failed transmission never discards the record.

---

## 17. Definition of endpoint done

An endpoint is complete only when all of the following are true:

1. Request and response validated with a schema at the boundary.
2. Authorisation checked against a permission, not merely a role name.
3. Tenant scoping applied in the repository layer, not the route.
4. Consent guard invoked before any sensitive processing.
5. Mutations idempotent.
6. Audit event written.
7. Errors mapped to the shared error catalogue with no internals leaked.
8. Tested for the success path, the authorisation failure, the consent failure and the failure path.
    "ocr":      { "provider": "mock",          "isMock": true,  "status": "MOCKED" },
    "ner":      { "provider": "deterministic", "isMock": false, "status": "IMPLEMENTED" },
    "abdm":     { "provider": "mock",          "isMock": true,  "status": "MOCKED" }
  },
  "features": { "voice_enabled": true, "ayush_enabled": true, "abdm_enabled": false },
  "supportedLocales": ["en-IN", "hi-IN", "mr-IN", "gu-IN", "ta-IN", "te-IN", "bn-IN", "kn-IN"],
  "limitations": [
    "Handwritten document OCR is not supported.",
    "The red-flag rule set is a curated starter set and has not been prospectively clinically validated."
  ]
}
```

---

## 2. Staff authentication

### `POST /api/v1/auth/login`
Purpose: issue a staff session. Auth: none.
Request `{ "username": "dr.rao", "password": "…", "tenantSlug": "demo-hospital" }`.
Response `200 { "token": "<jwt>", "expiresAt": "<iso>", "user": { "id": "…", "displayName": "…", "roles": ["PHYSICIAN"] } }`.
Errors: `401 INVALID_CREDENTIALS`, `403 FORBIDDEN`, `429 RATE_LIMITED`.
Audit: `USER_LOGIN_SUCCEEDED` / `USER_LOGIN_FAILED`. The username is recorded; the password never is.

### `POST /api/v1/auth/logout`
Auth: bearer. Response `204`. Audit: `USER_LOGOUT`.

### `GET /api/v1/auth/me`
Auth: bearer. Response `200 { "user": {…}, "tenant": {…}, "permissions": ["patient.read", "summary.verify"] }`.