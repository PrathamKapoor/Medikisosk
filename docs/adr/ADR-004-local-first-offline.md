# ADR-004 — Local-first / offline architecture

**Status:** Accepted
**Date:** 2026-09-15

## Context

MediKiosk is targeted at Indian OPDs and community health centres where connectivity is
unreliable. A patient standing at a kiosk must not be blocked because the uplink dropped, and
clinical data must not be lost because a hospital endpoint was unreachable.

At the same time, offline must be *genuinely* implemented. A "demo offline mode" that merely
disables the UI and shows a badge would be dishonest and would fail the product's own
Definition of Done.

## Decision

Implement a real three-tier local-first design.

**Tier 1 — Kiosk (browser):** the intake flow is a PWA with a local durable queue.
- Every patient-visible step is persisted to `localStorage`/IndexedDB **before** the network call.
- Mutating requests carry a client-generated **idempotency key** (ULID) and are appended to a
  local outbox. The kiosk retries the outbox when connectivity returns.
- Replay is safe because the server deduplicates on the idempotency key; a replayed request
  returns the original result rather than creating a second clinical record.
- A live connectivity indicator distinguishes `ONLINE`, `DEGRADED` and `OFFLINE` and states
  exactly what is queued.

**Tier 2 — API (server):** a database-backed **outbox** for outbound interoperability.
- FHIR/ABDM/HIS transmissions are written to a `sync_job` row inside the same transaction as the
  clinical change. Delivery is therefore not lost if the outbound call fails.
- A background worker drains the outbox with exponential backoff and a bounded attempt count.
- Every job records type, status, attempts, next attempt time, and last error.

**Tier 3 — Local processing:** every AI capability has a local provider
(see ADR-003), so extraction, safety rules, triage and summary generation all work with no
network. Only the cloud provider options require connectivity.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Require connectivity; show an error page offline | Fails the core requirement; makes the product unusable where it is needed most |
| A service worker cache that only caches assets | Caches the UI but loses patient data on network failure — the actual failure that matters |
| Full CRDT-based bi-directional sync engine | Massive complexity for a workload that is overwhelmingly append-oriented and single-kiosk-per-patient; conflicts are rare and resolvable deterministically in the order of encounter creation |
| Client-side encryption of everything with no server copy | Would block physician review of offline-created encounters, which is the whole point |
| Third-party offline sync product (PouchDB/CouchDB, Firebase Offline) | Introduces a second data store and a vendor lock-in for clinical data; violates the requirement not to send PHI to unnecessary third parties |

## Consequences

**Positive**
- The kiosk completes an entire intake, including extraction, red flags and case synthesis,
  with the network physically disconnected; on reconnect the encounter synchronises and the
  outbox drains. This is a demonstrable, verifiable capability, not a badge.
- No clinical data is lost when a downstream hospital endpoint is down, because delivery is
  transactional with the clinical write.
- Retry safety is guaranteed by idempotency keys, so a flaky network cannot duplicate records.

**Negative / accepted**
- Local kiosk storage holds PHI temporarily. Mitigated by: encrypted local storage for the queue,
  automatic purging of the queue once the server acknowledges it, a configurable retention window
  (`MEDIKIOSK_TEMP_RETENTION_MINUTES`), and the session wipe described in ADR-007.
- Idempotency keys must be generated on the client, so the contracts are explicit about which
  endpoints require them. Enforced by a shared Zod request schema rather than convention.
- Last-write-wins is used for genuinely concurrent edits to the same field; both values are
  retained in the edit history so a clinician can see what happened. Clinical truth is never
  silently overwritten.