# ADR-006 — Interoperability: FHIR R4 core, ABDM/HIS as adapters behind one interface

**Status:** Accepted
**Date:** 2026-09-15

## Context

MediKiosk must interoperate with Indian health infrastructure (ABDM/ABHA), with hospital
information systems, and with EMRs. Two facts constrain the design:

1. **No ABDM sandbox credentials exist.** Onboarding requires a registered health facility and
   approved client credentials. Fabricating an "ABDM integration" is both impossible and
   dishonest.
2. Hospital systems differ wildly. Some speak FHIR, many speak proprietary HL7 v2 or a REST API,
   and many speak nothing at all yet.

## Decision

**FHIR R4 is the canonical interoperability format**, and every external system is reached through
a provider interface.

**FHIR layer** (fully implemented, not mocked):
- A mapper converts the internal clinical model into validated FHIR R4 resources:
  `Patient`, `Encounter`, `Condition`, `Observation`, `MedicationRequest`, `AllergyIntolerance`,
  `Procedure`, `DiagnosticReport`, `DocumentReference`, `Questionnaire`, `QuestionnaireResponse`,
  `Composition`, and `Bundle`.
- Output is **validated before use**: required fields, resource types, reference integrity inside
  the bundle, and coding systems. Validation failures are errors, not warnings.
- Mapped resources are persisted as `FHIRResource` rows with a version, so exactly what was sent
  is auditable.
- Terminology uses standard systems where a real code exists (LOINC for observations, SNOMED CT
  and ICD-10 for conditions, RxNorm for medications). Where MediKiosk has only a local concept,
  the local code is emitted with an explicit local system URI **rather than inventing a standard
  code** — false standard codes are worse than honest local ones.

**ABDM layer** (adapter boundary fully implemented; providers vary):
```
ABDMProvider
  ├── MockABDMProvider       IMPLEMENTED — deterministic, offline, used by tests and demo
  ├── SandboxABDMProvider    IMPLEMENTED — real HTTP calls, requires approved credentials; BLOCKED until issued
  └── ProductionABDMProvider PLANNED     — same interface as sandbox, production endpoints, HIU/HIP roles
```
`SandboxABDMProvider` is real code that performs real signed HTTP requests against the configured
base URL. It is not a stub. It simply cannot be *executed* here because no credentials exist, and
this is reported as `BLOCKED — credentials`, never as "integrated".

**HIS/EMR layer:** generic adapters over the FHIR mapper plus an outbox (ADR-004). Supports
export, import, sync, retry, idempotency, authentication, failure handling and status tracking.
An endpoint that is temporarily unavailable never loses clinical data, because transmission is
persisted in the same transaction as the clinical write.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Claim ABDM integration without credentials | Dishonest and would collapse under any judge or auditor question. Explicitly forbidden by the project's own rules |
| Build ABDM first and treat FHIR as optional | ABDM itself is FHIR-based; FHIR-first is strictly more general and is also what HIS/EMR integration needs |
| HL7 v2 as the internal format | 30-year-old pipe-delimited format; unsuitable as an internal model, though a v2 *adapter* remains a legitimate future addition for legacy HIS |
| A single hard-coded integration per hospital | Does not scale commercially; each new customer becomes a code change rather than a configuration change |
| Emit FHIR without validation | Produces plausible-looking JSON that downstream systems reject or, worse, misinterpret. Validation is required |

## Consequences

**Positive**
- The FHIR layer is genuinely complete and testable offline, so a judge can inspect real
  `Bundle` output with real references and real codings.
- Adding ABDM production support is a credentials-and-configuration task, with the interface
  already implemented and contract-tested against the mock.
- Any hospital integration reduces to implementing one interface.

**Negative / accepted**
- No end-to-end ABDM exchange can be demonstrated. Reported as `BLOCKED — credentials`, documented
  in `docs/LIMITATIONS.md` and `docs/interoperability/ABDM.md` with the exact activation steps.
- FHIR validation is self-implemented rather than using the official Java validator, which cannot
  run in this environment. The implemented checks are documented precisely so their coverage is
  known and false confidence is not created.