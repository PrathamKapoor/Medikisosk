# MediKiosk

**Consent-gated clinical intake for Indian OPDs — multilingual kiosk, deterministic safety
signalling, evidence-backed doctor review.**

MediKiosk collects and structures patient information *before* the consultation so clinicians
spend visits on care, not data entry. A patient completes a touch-first intake (in English,
Hindi or Marathi, with voice fallback), the system assembles a structured, provenance-tagged
record with deterministic safety signals, and the doctor reviews, verifies and completes the
case in a clinical console. MediKiosk **does not diagnose**: system output is labelled as
patient-reported, system-generated, or doctor-verified — never as a medical decision.

## Problem

OPD staff re-collect the same history, medicines and complaints on paper for every visit.
Information is unstructured, unreviewed and lost between visits, while urgent presentations
wait in the same queue as routine ones.

## Key features

- **Patient kiosk (React, retained subsystem):** language → identity → granular consent →
  adaptive interview → health details (history, medicines, allergies, vitals, documents) →
  review → explicit confirmation → queue token.
- **Adaptive interview engine:** deterministic, pathway-driven questions with per-pathway
  budgets, clarification handling and non-coercive Unknown/Skip/Decline. No LLM anywhere.
- **Safety signals:** versioned red-flag rules (chest-pain, hypoxia, neuro, bleeding,
  metabolic) evaluated after every fact change; vitals, labs and documents feed the engine.
- **Document pipeline:** validated upload → deterministic mock-OCR extraction ("Demo
  extraction", synthetic fixtures only) → patient confirmation → clinician
  verify/reject/edit with superseding evidence.
- **Doctor console (vanilla HTML/CSS/JS):** EMERGENCY-first queue, full case view with
  separated provenance blocks, evidence verification, longitudinal timeline and pairwise
  compare, notes, diagnoses, disposition, completion.
- **Admin console (vanilla):** live overview metrics, kiosk fleet, audit log, system health.
- **Interoperability-ready:** validated FHIR R4 bundle export, meta-tagged as a demo
  representation; ABDM explicitly blocked without credentials.
- **Auditability:** append-only PHI-free audit trail; idempotent mutations; deterministic
  summaries (12-section drafts, never LLM prose).

## Architecture

```
Kiosk (React/Vite) ──┐
                     ├─→ Fastify API (modular monolith) → pure domain packages
Console (vanilla) ───┘         │                              (interview-engine,
                               ├─→ SQLite (local) / Postgres (dialect)        safety-rules,
                               └─→ content-addressed uploads                  evidence-model,
                                                                              longitudinal,
                                                                              fhir-models)
```

See `docs/ARCHITECTURE.md` (with Mermaid maps), `docs/DATA_MODEL.md` and `docs/adr/`
(13 decisions, including ADR-013 on the console stack).

## Patient workflow

Welcome → language → identity (guest/OTP/QR/returning) → consent receipt → chief complaint
(+ speech) → adaptive questions → health-details hub → review → confirm → submit → token
(`A-042`) with priority. Inactivity warns, then wipes the session (`?idle=N` shortens it
for demos). Details: `docs/USER_FLOWS.md`.

## Doctor workflow

Sign in (`dr.rao` / `demo-pass-1234`) → queue → case (reported / system / longitudinal /
authored) → verify evidence → notes → diagnosis → disposition → complete. The completed
encounter joins the patient's history and the audit trail.

## Admin workflow

Sign in (`admin.patil` / `demo-pass-1234`) → overview → fleet → audit → health. The admin
role cannot open clinical records (403, tested).

## Safety approach

Deterministic rules with no-hit-without-evidence, no inferred negatives, implausible-reading
exclusion, patient-safe wording, and rule provenance shown to clinicians. Full statement:
`docs/CLINICAL_SAFETY.md`. The rules are a curated starter set, **not clinically validated**.

## Technology stack

Node 20+, TypeScript (strict), Fastify + Kysely, React 18 + Vite (kiosk only), vanilla
HTML/CSS/JS + `ogl` (console backdrop), better-sqlite3, Vitest, ESLint, Prettier. No LLM
dependency; no external service required for the demo.

## Setup instructions

```powershell
npm ci
Copy-Item .env.example .env
npm run demo:up        # migrate + seed synthetic cohort
npm run dev:api        # terminal 1 — http://127.0.0.1:8080
npm run dev:kiosk      # terminal 2 — http://127.0.0.1:5173
npm run dev:console    # terminal 3 — http://127.0.0.1:5174
```

Production build: `npm run build`. Release gate: `npm run verify`
(format → lint → typecheck → tests → build). CI runs the same gates.

## Environment variables

`.env.example` is the complete reference. Notable keys: `API_PORT`, `KIOSK_ORIGIN`,
`CONSOLE_ORIGIN`, `MEDIKIOSK_DB_DIALECT`, `MEDIKIOSK_SQLITE_PATH`, `MEDIKIOSK_UPLOAD_DIR`,
`DOCUMENT_MAX_UPLOAD_MB`, the three secrets (production refuses dev defaults),
`IDENTITY_PROVIDER`, `OCR_PROVIDER`, feature flags. Never commit `.env`.

## Database setup

Kysely migrations `0001–0016` run via `npm run db:migrate` (idempotent; SQLite executed,
Postgres dialect supported but never executed — see limitations).

## Seed instructions

`npm run db:seed` (base: tenant, staff, kiosks, consent wording) and `npm run seed:demo`
(adds the synthetic cohort: Ramesh Kumar's chest-pain history, Sunita Deshmukh's 3-visit
diabetes story, fever/cough urgent case, abdominal pain, injury, follow-ups, demo documents).

## Test commands

```powershell
npm test            # full suite: 152 tests, 18 files
npm run verify      # the whole gate
npx vitest run tests/e2e   # journeys A–E only
```

What is tested: `docs/TESTING.md`. Live HTTP proof: `node scripts/smoke-interview.cjs`
(with `SMOKE_API`, `SMOKE_KIOSK_ID`, `SMOKE_DB` set).

## Demo credentials

Password for all demo accounts: `demo-pass-1234`. Kiosk device ID + token are printed by
the seed. Staff: `dr.rao` (physician), `nurse.mehta`, `triage.desk`, `admin.patil`
(admin). Tenant slug: `demo-hospital`. All data is synthetic.

## Demo scenarios

The 5-minute walkthrough is `docs/DEMO_SCRIPT.md`: chest-pain intake with priority banner
→ token → EMERGENCY queue (Aarav, SpO2 91) → verification → Sunita's longitudinal story →
admin → privacy reset. E2E journeys A–E automate the same paths.

## Screenshots

Not included — run the demo locally; the kiosk, queue, case, timeline and admin screens
are all live surfaces, not mockups.

## Limitations

Authoritative register: `docs/LIMITATIONS.md`. Headlines: mock identity/OCR; browser
speech unvalidated for Indian languages; starter safety rules unvalidated; ABDM blocked;
Postgres/containers/TLS unexecuted; no clinical, legal (DPDP) or security review. Do not
use with real patient data without those reviews.

## Future integrations

Real ABDM/ABHA verification (adapter interface + BLOCKED labels), HIS/EMR FHIR sync,
offline kiosk queue, hardware vitals devices, LLM summary drafts with AI_DERIVED
provenance and mandatory review, evaluation harness with golden cases.

## Security notes

Permission-checked endpoints, tenant scoping, 404-not-403 across tenants, PHI-free audit,
upload hardening, session wipe, tab-scoped console tokens. Gaps: see LIMITATIONS.md.
Details: `docs/SECURITY.md`.

## License

UNLICENSED — rights are reserved unless a license is added by the repository owner.
