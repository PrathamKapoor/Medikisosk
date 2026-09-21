# MediKiosk API reference

Base URL: `http://127.0.0.1:8080`. All clinical routes live under `/api/v1`.

Authentication:

- Kiosk sessions: `Authorization: Bearer <session token>`, plus `Idempotency-Key`
  (UUID/ULID) on every mutation. The session owns its encounters; cross-session access is 404.
- Staff: `Authorization: Bearer <staff JWT>` from `POST /auth/login`. Permissions are
  checked per endpoint (see the Permission column).
- Devices: `X-Kiosk-Id` / `X-Kiosk-Token` for session open and heartbeat.

Errors use the `MediKioskError` envelope `{ error: { code, message } }` with the status from
`ERROR_STATUS` (`packages/shared-types/src/errors.ts`). No envelope ever carries PHI, stack
traces or SQL.

## Auth

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/login` | none (rate-limited 5/min) | Staff login → token, user, permissions |
| POST | `/auth/logout` | staff | Audit logout (tokens are stateless) |
| GET | `/auth/me` | staff | Current user, roles, permissions |

## Kiosk sessions, identity, consent

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/consent/versions?locale=` | device headers | Consent wording for a locale |
| POST | `/kiosk/sessions` | device headers | Open a session (updates kiosk `lastSeenAt`) |
| GET | `/kiosk/sessions/:id` | kiosk session | Session state (step recovery) |
| PATCH | `/kiosk/sessions/:id` | kiosk session | Change locale mid-flow |
| POST | `/kiosk/sessions/:id/wipe` | kiosk session | Privacy reset (purges transient artifacts) |
| POST | `/kiosk/identity/start` | kiosk session | Begin GUEST / ABHA_OTP / ABHA_QR / RETURNING |
| POST | `/kiosk/identity/verify` | kiosk session | Verify OTP challenge |
| POST | `/kiosk/consent` | kiosk session | Capture granular consent decisions |
| POST | `/consent/:id/revoke` | kiosk session | Revoke (blocks further clinical writes) |
| GET | `/patients/:id/consents` | kiosk session | Consent history |

## Interview and intake (kiosk session, consent-guarded)

| Method | Path | Purpose |
|---|---|---|
| POST | `/encounters` | Open OPD encounter (chief complaint codes + verbatim) |
| GET | `/encounters/:id` | Kiosk-owner read of the case view |
| GET | `/encounters/:id/interview/next` | Engine-selected next question + safety status |
| POST | `/encounters/:id/interview/response` | Record an answer (VOICE/TOUCH/…) |
| POST | `/encounters/:id/interview/finish` | Completion advisory (never blocks) |
| POST | `/encounters/:id/interview/language` | Switch locale, clinical state preserved |
| POST | `/encounters/:id/vitals` | Structured vitals (validated, unit-converted) |
| POST | `/encounters/:id/history` | Conditions, surgeries, family history, stays |
| POST | `/encounters/:id/medications` | Medication entries with frequency vocabulary |
| POST | `/encounters/:id/allergies` | Allergy entries or explicit none-known |
| POST | `/encounters/:id/clinical/remove` | Withdraw a patient-entered row pre-submit |
| GET | `/encounters/:id/review` | Assembled record for patient confirmation |
| POST | `/encounters/:id/confirm` | Explicit review gate (submit requires it) |
| POST | `/encounters/:id/submit` | Submit → triage → queue entry with token (A-042) |

`POST /submit` returns `{ status, triageLevel, priority, queueEntryId, tokenNumber,
queuePosition?, incomplete, outstandingRequired }` and fails `409
PATIENT_CONFIRMATION_REQUIRED` before confirmation.

## Documents (kiosk session; staff fallback where noted)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/encounters/:id/documents` | kiosk (multipart) | Upload → validate → mock-OCR extract |
| GET | `/encounters/:id/documents` | kiosk owner or staff `document.read` | List with entities |
| GET | `/documents/:id/download` | kiosk owner or staff `document.read` | Stream stored bytes |
| POST | `/encounters/:id/documents/:docId/confirm` | kiosk | Accept extraction → fact rows |
| POST | `/encounters/:id/documents/:docId/reject` | kiosk | Reject extraction |
| POST | `/documents/:id/entities/:entityId/verify` | staff `document.verify` | VERIFY / REJECT / EDIT (EDIT supersedes evidence) |
| GET | `/demo-documents` | kiosk | Fixed synthetic set for attachment |
| GET | `/demo-documents/:name` | kiosk | Raw bytes of one synthetic document |

## Clinical console (staff)

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/queue` | `triage.read` | Active entries, EMERGENCY-first |
| POST | `/queue/:id/call` | `triage.update` | → CALLED |
| POST | `/queue/:id/start` | `triage.update` | → IN_CONSULTATION |
| POST | `/queue/:id/cancel` | `triage.update` | → CANCELLED |
| GET | `/patients?query=` | `patient.search` | Safe identifier search |
| GET | `/patients/:id` | `patient.read` | Record with encounter list |
| GET | `/patients/:id/timeline` | `patient.read` | Grouped longitudinal events |
| GET | `/patients/:id/compare?previous=&current=` | `patient.read` | Deterministic encounter diff |
| GET | `/encounters/:id/case` | `encounter.read` | Full case: reported / system / longitudinal / authored + summary |
| POST | `/encounters/:id/notes` | `encounter.read` | Doctor-authored note |
| POST | `/encounters/:id/diagnoses` | `encounter.read` | Doctor-recorded diagnosis |
| POST | `/encounters/:id/disposition` | `triage.update` | Care plan |
| POST | `/encounters/:id/complete` | `triage.update` | → COMPLETED + queue COMPLETED |
| GET | `/encounters/:id/summary` | `summary.read` (or owning kiosk) | Deterministic 12-section draft |
| GET | `/encounters/:id/fhir` | `fhir.generate` | Validated R4 bundle, demo-tagged |

## Administration (staff)

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/admin/overview` | `analytics.read` | Live counts, distributions, intake timing |
| GET | `/admin/kiosks` | `kiosk.read` | Fleet with derived Online/Offline/Maintenance |
| POST | `/admin/kiosks/:id/heartbeat` | device headers | Liveness ping → `lastSeenAt` |
| GET | `/admin/audit?limit=&action=` | `audit.read` | Append-only PHI-free trail |
| GET | `/system/health` | none | Liveness-style subsystem probes |
| GET | `/api/v1/capabilities` | none | Honest provider/feature registry |

`GET /health` (liveness, no DB) and `GET /ready` (DB probe) sit outside versioning.
