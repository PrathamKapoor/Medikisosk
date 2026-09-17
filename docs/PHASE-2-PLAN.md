# Phase 1 closure and Phase 2 registration/consent plan

## Objective
Resume the interrupted foundation work without replacing completed domain code. Deliver a real kiosk registration and consent lifecycle, not a simulated clinical interview. The master prompt's later phases remain separate work.

## Verified starting point
- Initial commit `4e497c8` exists; the old handoff's zero-commit statement is obsolete.
- Interrupted changes include Vitest configuration, 14 passing triage tests, a test-app helper and last-login timestamp wiring.
- Root build fails because workspace-wide execution includes manifest-only applications/libraries.
- Fastify app currently registers staff auth, health, readiness and capabilities only.
- DB already models kiosk sessions, identity challenges, patients, consent versions and consent decisions.
- No language server is configured; file searches are the available reference mechanism.

## Design and ownership
1. Foundation: repair ordered build/typecheck and test setup; verify migration repeatability and login/me/logout behavior; complete last-login bookkeeping and route throttling. Preserve timing-equalized credential failure.
2. Lifecycle: implement device-authenticated sessions, finite TTL, language update, wipe, explicitly synthetic identity, granular consent, immediate revocation and service-layer consent enforcement. Reuse repository/service/routes pattern and existing tables; new schema only through additive migrations. All reads/mutations are tenant and session scoped.
3. Kiosk: implement React/Vite flow against real endpoints. Operator provisions device credentials at runtime; no secret embedded in bundle. Large controls, localized copy, state-preserving language switch, granular consent, decline without coercion, receipt/revoke/finish, inactivity warning and wipe. No clinical collection before a consent guard and no pretend interview/OCR/offline capability.
4. Integration owner runs build, typecheck, lint, formatting, full tests and real HTTP/browser flows. Review new lifecycle boundaries and failure paths. Update actual capability and phase status, phase report, local run instructions and handoff.

## Contract amendments
The old session-open example omits the token needed by all subsequent calls: return `token` with the existing fields. Add `PATCH /api/v1/kiosk/sessions/:sessionId` with `{locale}`. Guest identity returns `patientId` as well as `guestRef`. Session reads expose the current patient and consent state. Synthetic identity responses identify provider `mock`; verification is never presented as real ABHA. Consent decisions record category, processing action and destination scope. Accept UUID or ULID idempotency keys, scoped to authenticated operation; different payload returns 409. Cache sensitive replay responses encrypted rather than storing bearer tokens in plaintext.

## Verification cases
- Repeated migrations retain existing data and constraints; tests run from installed workspace dependencies without stale artifacts.
- Staff login/me/logout, equal unknown-user/wrong-password response, timestamp persistence, login throttling.
- Device session creation; wrong/missing device credentials denied; other session cannot read/wipe/consent; expired/wiped sessions stop processing.
- Guest/synthetic OTP identity persists only session-bound patient linkage; failures consume attempt budget; no production ABHA claim.
- Consent partial acceptance, decline, category restrictions, expiry and immediate revoke; no arbitrary patient binding; retry does not duplicate records.
- Browser registration, language switching, consent receipt, revocation, finish/reset and responsive layout against live API.

## Explicit boundaries
This subphase does not deliver interview execution, voice recognition, OCR, clinical record review, FHIR, real ABHA, offline intake, deployment certification or clinical validation. The terminal kiosk screen directs the patient to staff after recording consent. Later-phase capabilities must remain labelled planned/blocked, regardless of configuration labels in older documents.
