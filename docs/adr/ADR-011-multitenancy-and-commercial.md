# ADR-011 — Multi-tenancy, feature flags and commercial readiness

**Status:** Accepted
**Date:** 2026-09-15

## Context

MediKiosk is designed as a product that a hospital could pay for, not only as a competition
demonstration. Potential customers differ enormously: government hospitals, private multispecialty
hospitals, OPD chains, diagnostic centres, AYUSH hospitals, community health centres, single
clinics and hospital groups. They differ in branding, departments, doctors, languages, triage
thresholds, and interoperability endpoints.

Two things must be true from the beginning:
1. One hospital must never be able to reach another hospital's patient data.
2. A pilot at a single hospital must not require forking the product.

Retrofitting tenant isolation onto a system that was built single-tenant is a well-known source of
critical data-leak defects, so this is a day-one architectural concern, not a later feature.

## Decision

**`tenant_id` is a first-class column on every clinical, configuration and audit table**, and
tenant scoping is enforced in the repository layer rather than trusted to callers.

- Every authenticated principal carries a `tenant_id`; every query is scoped by it.
- Repository functions **require** a tenant context argument. There is no API shape that permits an
  unscoped clinical read, so "forgot the tenant filter" is a compile error rather than a leak.
- The one legitimately cross-tenant role (`SUPER_ADMIN`, for a platform operator) is explicit,
  audited, and cannot read clinical content — only configuration and aggregate metrics.
- Security tests assert isolation directly: a principal in tenant A requesting tenant B's patient
  receives `404` (not `403`, which would leak existence).

**Configuration is tenant-scoped:** branding, departments, doctors, enabled languages, question
pathways, red-flag thresholds, lab reference ranges, consent wording versions, AI providers, FHIR
endpoints, ABDM configuration and feature flags.

**Feature flags are real and enforced server-side:** `voice_enabled`, `tts_enabled`,
`ayush_enabled`, `abdm_enabled`, `offline_enabled`, `document_ai_enabled`, `local_llm_enabled`,
`research_mode_enabled`. Every flag is checked in the domain layer, not only in the UI, so a
disabled capability cannot be invoked through the API. Flags allow a graduated pilot without a code
change and without redeployment.

**Billing-ready architecture without a billing system.** No pricing is hard-coded. Instead the
system emits the usage metrics that a commercial model would need — encounters per tenant per
period, active kiosks, documents processed, provider calls — as analytics rows, so any of SaaS,
per-kiosk, per-encounter, hospital licence, enterprise, on-premise or hybrid pricing can be layered
on later without re-instrumenting the product.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Single-tenant now, add tenancy later | The highest-severity class of defect in health software; categorically worse than paying the cost up front |
| Database-per-tenant | Strong isolation, but multiplies migration, backup, monitoring and upgrade work by the customer count, which is unmanageable for an early-stage product and impossible locally without a Postgres server |
| Schema-per-tenant (Postgres schemas) | Same operational multiplication problem, and unavailable in the SQLite dev dialect (ADR-002) |
| Tenant indicated by a request header | Forgeable; must be derived from the authenticated principal and the resource, never from a client-supplied value |
| Feature flags evaluated only in the frontend | Not a control; a flagged-off capability would remain API-reachable. Flags must be enforced where the work happens |
| Implement a full billing/subscription engine now | Premature. It would add surface area while the core clinical product is still being proven, and pricing is not yet known |

## Consequences

**Positive**
- Onboarding a new hospital is configuration, not a fork or a deployment of bespoke code — which is
  exactly what makes the product sellable to many hospitals.
- Cross-tenant access is a tested, failing-by-design case rather than an assumption.
- A single-hospital pilot can be shipped with capabilities disabled, then enabled per tenant as the
  hospital's governance approves them (for example, `abdm_enabled` only once credentials exist).
- Commercial packaging can change without touching the clinical core.

**Negative / accepted**
- Every clinical query must carry a tenant predicate, which adds a small amount of ceremony and
  index width. Mitigated by a repository-layer helper so the predicate is added in one place.
- A genuinely shared resource (a national drug dictionary, a LOINC subset) needs an explicit shared
  or global tenant scope, which must be modelled deliberately rather than by omission.
- Multi-tenancy does not by itself deliver data *residency* separation (some hospitals require their
  own database). The architecture permits it — because all data access goes through one repository
  layer with one dialect selector (ADR-002) — but per-tenant database routing is `PLANNED`, not
  implemented.