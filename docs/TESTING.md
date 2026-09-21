# MediKiosk testing

`npm run verify` chains `format:check → lint → typecheck → test → build` and fails on any
red step. CI (`.github/workflows/ci.yml`) runs the same gates.

## Unit (pure packages)

Interview engine (determinism, branching, YES_NO lexicon, declined≠unknown≠skipped,
per-pathway budgets, SOCRATES completion), safety rules (triggers, no-hit-without-evidence),
evidence graph and contradiction detectors, longitudinal timeline/diff, i18n catalogue
verification, FHIR mapping + structural validation, summary builder (fixed sections,
provenance tags), mock-OCR providers (including the base64 padding regression).

## API (real SQLite, migrations, seeds, injected clock)

Auth (login, roles, rate limits), kiosk lifecycle (sessions, consent, OTP bounds, wipe),
interview runtime (golden 35-question chest-pain journey → COMPLETE → RED/EMERGENCY with
queue token; confirmation gate; replay idempotency; cross-session and revocation blocks),
intake validation, the document pipeline (upload validation, deterministic extraction,
honest empty results, executable refusal, confirm → facts, verify/reject/edit with
superseding evidence), the console surface (queue ordering/transitions, search, record,
timeline, compare, case view, notes/diagnoses/disposition/completion, admin aggregates,
FHIR export) and the authorisation matrix throughout.

## End-to-end (`tests/e2e/journeys.test.ts`)

- **A** routine patient: vitals → unknown-answers → review → confirm → token → completion.
- **B** returning patient: seeded history retrieved and compared across visits.
- **C** safety signal: dyspnoea YES → RED → EMERGENCY queue → rule hit visible to doctor.
- **D** document: demo prescription → extraction → patient confirm → doctor verify.
- **E** kiosk privacy: partial intake → wipe → dead token → next patient sees nothing.

## Live verification (not automated)

`scripts/smoke-interview.cjs` drives the golden journey over real HTTP against a live API
(session → consent → 35 answers → review → confirm → submit → DB spine assertions).
The kiosk (5173) and console (5174) were walked through against the same stack during
development; see `docs/DEMO_SCRIPT.md`.
