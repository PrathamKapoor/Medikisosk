# Security

**Snapshot:** 2026-09-15 · **Status vocabulary and measured repository state:** [`../LIMITATIONS.md`](../LIMITATIONS.md) §2–§3.

Scope: threat model, authentication and session design, RBAC, tenant isolation, PHI-safe logging, input
and upload validation, rate limiting, CSRF/CORS/security headers, prompt-injection defence, secret
management, the audit event catalogue, retention and secure deletion, backup and restore, and an
explicit disclosure of security work that has **not** been done.

**Status of every control in this document: `PLANNED` unless a row says otherwise.** `packages/auth`
contains only a `package.json`; `services/api` contains only a `package.json`. The dependencies declared
in those manifests (`@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit`, `@fastify/multipart`,
`bcryptjs`, `jose`) show which controls are **intended**, not which are **implemented**.

---

## 1. Purpose and honesty preamble

A hospital IT reviewer reading this document is entitled to know what has been verified. This has been
verified: nothing. Specifically:

- **No penetration test has been performed** (`TD-08`).
- **No third-party security review has been performed.**
- **No formal threat-modelling workshop has been held.** §2 is a paper threat model written by the
  authors of the system — a materially weaker artifact than a facilitated workshop with an
  adversary-minded participant.
- **No security test exists in the executable sense** — `tests/` contains 0 files and `vitest run`
  reports "no test files".
- **No compliance certification of any kind exists.**

The sections below therefore describe the intended control set precisely enough to be implemented and
audited, and label every item.

## 2. Threat model

Framing: for each asset, what threatens its **integrity** (a wrong clinical fact), its **availability**
(a patient or clinician who cannot proceed), and its **confidentiality** (PHI exposure). Integrity is
listed first because in a clinical system a corrupted fact is more dangerous than a missing feature.

| Threat | Asset at risk | Impact | Likelihood (`BASELINE.md` §6) | Intended control | Status |
|---|---|---|---|---|---|
| **T-01** Prompt injection via an uploaded document or patient text | Integrity of extracted facts; integrity of the interview | Injected clinical fact; question set steered | Medium | Document/patient text is DATA, never instructions; schema-constrained extraction; the LLM has no authority to act; the trigger language cannot evaluate user text as logic (`R-05`, ADR-009) | `PLANNED` |
| **T-02** PHI leakage into logs | Confidentiality | PHI in log aggregation, backups and support bundles | Medium | PHI-safe structured logger with an **allow-list** redactor; `LOG_PHI=false` default (`R-06`) | `PLANNED` |
| **T-03** Cross-tenant access | Confidentiality, integrity | One hospital reads another's patients | Low | `tenant_id` on every clinical row; tenant required as a repository argument; 404 not 403; isolation security tests (`R-07`, ADR-011) | `PLANNED` |
| **T-04** Kiosk left unattended between patients | Confidentiality | Next patient sees the previous patient's data | Medium | Session TTL `MEDIKIOSK_SESSION_TTL_MINUTES` (45), inactivity guard with a visible warning, end-of-session wipe (ADR-007) | `PLANNED` |
| **T-05** Stolen database or disk | Confidentiality | Whole-tenant PHI exposure | Medium | **None implemented. No encryption at rest is specified.** Filesystem or database-level encryption is an operator responsibility and must be recorded as such. | **Gap — disclosed** |
| **T-06** Forged tenancy header | Confidentiality, integrity | Attacker reads another tenant by setting a header | Low if designed correctly | Tenant derived from the authenticated principal, **never** from a request header (ADR-011) | `PLANNED` |
| **T-07** Replay / duplicate submission | Integrity | Duplicate clinical records and duplicate external transmissions | Medium | Idempotency keys enforced by a shared Zod request schema, not by convention; server-side de-duplication (`R-10`) | `PLANNED` |
| **T-08** Privilege escalation by a staff account | Integrity | Unauthorised verification, override or configuration change | Medium | RBAC least privilege; `SUPER_ADMIN` cannot read clinical content; audit events on sensitive transitions | `PLANNED` |

| Threat | Asset at risk | Impact | Likelihood | Intended control | Status |
|---|---|---|---|---|---|
| **T-09** Boot with development default secrets | Confidentiality, integrity | Whole deployment compromised | Medium | Startup Zod validation refuses to start when `NODE_ENV=production` carries a development default secret (ADR-010) | `PLANNED` |
| **T-10** Unauthenticated access to a monitoring endpoint | Confidentiality | Provider/config fingerprinting, metric scraping | Low | Monitoring endpoints bound to the internal network / behind the reverse proxy | `PLANNED` |
| **T-11** Unbounded input (huge upload, huge body, request flood) | Availability | Kiosk fleet unusable from one client | Medium | `@fastify/rate-limit`; `@fastify/multipart` size limits; Zod request validation | `PLANNED` |
| **T-12** Supply-chain compromise of a dependency | Integrity, confidentiality, availability | Arbitrary code in the clinical path | Medium | Dependency list is deliberately small and read by hand. **No automated dependency scanning, no SBOM, no provenance attestation exists.** | **Gap — disclosed** |
| **T-13** Malicious insider with database access | Confidentiality, integrity | Undetectable modification of the record | Low | Audit events. **No append-only log, no hash chaining, no external log sink.** | **Gap — disclosed** |
| **T-14** Next patient gains access to a not-yet-wiped session | Confidentiality | Previous patient's data visible | Medium | Wipe on Finish / timeout / Clear; encrypted local queue; purge-on-acknowledgement | `PLANNED` |
| **T-15** Clinical fact lost by a session wipe | Availability | Patient's answers discarded | Medium | The in-progress encounter is persisted server-side once consent is granted, so a wipe clears kiosk state without discarding answers (ADR-007) | `PLANNED` |
| **T-16** Silent downgrade of a real provider to a mock | Integrity of trust | A clinician believes a real model produced an output | Low | ADR-003 rule 4: active provider in `/api/v1/health` and the admin console; `model_provider` recorded on every artefact | `PLANNED` |
| **T-17** Triage level manipulated through patient-controlled input | Integrity | Under-triage | Low | Deterministic rules evaluate structured facts with evidence, not raw text; the LLM is not in the safety path | `PLANNED` |
| **T-18** Clock skew invalidating sessions or shifting relative dates | Availability, integrity | Premature session expiry; wrong onset date | Medium | Injectable `Clock` for determinism in tests (`packages/shared-types/src/clock.ts`); **skew tolerance is undecided** | Open |

## 3. Assets and their protection priorities

| Asset | Integrity | Availability | Confidentiality | Notes |
|---|---|---|---|---|
| Clinical record (encounter, symptoms, labs, vitals, medications, allergies) | **Highest** | High | High | A corrupted clinical fact is a safety event, not a data-quality issue |
| Evidence store (`Evidence.raw_value`) | **Highest**, append-only | High | High | Destroying the raw value destroys the audit chain (ADR-005) |
| Consent records (`Consent`, `ConsentVersion`) | **Highest** | High | High | Legal and ethical basis for processing |
| Triage assessments and queue state | **Highest** | **Highest** | High | Misordering an emergency is a safety event; the queue *is* the safety net's output |
| Audit events | High | High | High | Tampering with the trail is itself an incident; must not contain PHI beyond `LOG_PHI` |
| Identity data (ABHA identifier, OTP artefacts) | High | Medium | **Highest** | Kept separable from clinical data ([`../privacy/PRIVACY.md`](../privacy/PRIVACY.md) §2) |
| Documents (uploads; pre-processing images) | High | Medium | High | Images are transient by design |
| Telemetry, analytics, metrics | Medium | Low | Medium | Counters and durations, never patient-scoped |

<!-- MEDIKIOSK-APPEND -->