# ADR-007 — Consent, session lifecycle and automatic data wipe

**Status:** Accepted
**Date:** 2026-09-15

## Context

MediKiosk is used by many patients in sequence on a shared kiosk in a waiting area. Two obligations
follow:

1. **Consent must precede processing.** Under India's Digital Personal Data Protection Act
   (DPDPA) and general medical ethics, a patient's personal and health data may not be processed
   without purpose-specific, informed, recorded consent — and consent may be withdrawn.
2. **Nothing may persist on the kiosk between patients.** A previous patient's name, symptoms,
   documents or summary must never be visible to the next patient, and temporary artifacts must not
   live indefinitely.

The project must also be honest: implementing DPDPA-aligned *mechanisms* is not the same as
holding a legal certification of DPDPA *compliance*, and no legal review has occurred.

## Decision

**Consent as a stateful, first-class subsystem.**

- A `Consent` record captures: patient, purpose, data categories, processing action, destination,
  language the consent was presented in, **consent document version**, timestamp, method
  (voice-confirmed / touch-confirmed), device/session, and revocation state.
- Consent is versioned: `ConsentVersion` stores the exact wording shown. Adding a data category or
  changing wording produces a new version and does not retroactively alter existing consents.
- Supported operations: view, accept, **partial accept**, decline, revoke, expire.
- **Enforcement is mechanical.** A `requireConsent(purpose, category)` guard runs in the domain
  service layer — not in the route handler and not in the UI — before any sensitive processing.
  Missing consent raises a typed error and the operation does not occur. A UI-only check would be
  bypassable and is therefore not a control at all.
- Revocation checks the same guard on every read and write, so revoking consent immediately stops
  further processing.

**Session lifecycle.**

- A kiosk session has an explicit finite TTL (`MEDIKIOSK_SESSION_TTL_MINUTES`, default 45) and an
  inactivity timeout.
- A session can be ended by the patient ("Finish"), by timeout, or by kiosk staff ("Clear").
- Ending a session performs a **wipe**: patient-visible UI state is cleared, the browser's local
  queue and cached PHI are purged, and any temporary server-side artifacts created *only* for that
  session (raw audio, pre-processing page images) are deleted.
- A **retention policy is explicit and configurable**. Temporary artifacts
  (`MEDIKIOSK_TEMP_RETENTION_MINUTES`) are swept by a scheduled job. Clinical records, evidence and
  audit events are retained per hospital policy because they are the medical record — deleting them
  would itself be a safety and legal failure. The distinction between *transient* and *record* data
  is documented in `docs/privacy/PRIVACY.md`.
- A kiosk-side inactivity guard visibly warns the patient before wiping, so a slow reader is not
  silently logged out mid-sentence.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| A single blanket "I agree to everything" checkbox | Not purpose-specific and not valid informed consent; cannot support partial consent or per-category revocation |
| Consent enforced only in the frontend | Trivially bypassed (any API client, any bug); not a security or privacy control |
| Never delete anything, retain all audio and images forever | Violates data minimisation; retains biometric-adjacent voice data indefinitely for no clinical reason |
| Delete everything including the clinical record at session end | Destroys the medical record the physician needs; conflates transient artifacts with the record of care |
| No session timeout (kiosk stays logged in) | Direct PHI exposure to the next person at the kiosk; unacceptable in a waiting room |
| Claim "DPDPA compliant" | No legal review has occurred. The project reports DPDPA-*aligned mechanisms* and explicitly labels compliance as `NOT ESTABLISHED` |

## Consequences

**Positive**
- A judge or auditor can inspect the consent record and see exactly what this patient consented to,
  in which language, which wording version, when, and by which method — and can watch a revocation
  take effect.
- The end-of-session wipe is demonstrable: complete an intake, finish the session, observe that no
  prior patient data is reachable and that the local queue is empty.
- Partial consent is genuinely supported, so a patient can allow clinical use while declining
  research use, and the research pipeline respects it.

**Negative / accepted**
- Session TTL and retention windows are policy decisions a hospital must make; sensible defaults are
  provided and are tenant-configurable.
- Automatic wipe introduces a real risk of losing an *incomplete* intake. Mitigated by persisting
  the in-progress encounter server-side once consent is granted, so a wipe clears the kiosk's local
  state and UI but does not discard the patient's answers. The patient can resume with the same
  identity or the encounter can be routed to staff.
- **DPDPA compliance status is `NOT ESTABLISHED`** and is stated as such everywhere it appears.