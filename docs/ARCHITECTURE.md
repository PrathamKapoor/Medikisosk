# MediKiosk architecture

## System map

```mermaid
flowchart LR
    subgraph clients [Clients]
        K[Kiosk — React/Vite<br/>language, consent, interview,<br/>details, documents, review]
        C[Console — vanilla HTML/CSS/JS<br/>doctor queue/case, admin]
    end
    subgraph api [API — Fastify modular monolith]
        RT[Routes<br/>auth, kiosk, interview,<br/>intake, documents,<br/>clinical, summary, admin]
        SVC[Services<br/>consent guard, replay,<br/>evidence-first writes,<br/>triage re-evaluation, audit]
        ENG[Domain packages<br/>interview-engine,<br/>safety-rules, evidence-model,<br/>longitudinal, fhir-models]
    end
    subgraph data [Persistence]
        DB[(SQLite local / Postgres dialect<br/>Kysely migrations 0001–0016)]
        FS[Uploads<br/>content-addressed files]
    end
    K -->|/api/v1 + Idempotency-Key| RT
    C -->|/api/v1 + staff JWT| RT
    RT --> SVC --> ENG
    SVC --> DB
    SVC --> FS
```

## Data flow: patient to completed encounter

```mermaid
flowchart TD
    P[Patient] --> S[Encounter<br/>IN_PROGRESS]
    S --> R[Questionnaire responses<br/>immutable raw answers]
    R --> E[Evidence rows<br/>written before facts]
    E --> F[Facts: symptoms, meds,<br/>allergies, vitals, labs]
    F --> T[Safety rules<br/>evaluateTriage]
    T --> Q[Queue entry<br/>priority + token]
    S --> D[Documents → mock OCR<br/>→ entities → patient confirm]
    D --> F
    Q --> DR[Doctor review<br/>verify/reject/edit]
    DR --> N[Notes, diagnoses,<br/>disposition]
    N --> C2[COMPLETED<br/>joins longitudinal history]
```

## Layer rules

- Routes validate shapes and authenticate; they never decide authorisation (permissions are
  checked in services via `requireStaff`, consent via `requireConsent`).
- Every clinical mutation runs `authenticate → consent guard → engine → persist
  (evidence-first) → triage → audit` inside one transaction, wrapped in `replayMutation`
  (encrypted idempotent replay, 24 h).
- The interview engine, safety rules, evidence graph, longitudinal diff and FHIR mapper are
  pure packages: no clock (injected `now`), no I/O, no LLM. Determinism is tested, not claimed.
- Provenance classes are structural, not cosmetic: `originClass`
  (PATIENT_REPORTED / DOCUMENT_DERIVED / CLINICIAN_ENTERED / SYSTEM_DERIVED) plus
  `verificationState` (UNVERIFIED / VERIFIED / REJECTED / CORRECTED) on every clinical row;
  evidence rows are immutable (corrections supersede); doctor prose lives in `encounter_notes`,
  apart from everything else.

## Frontend decisions

- Kiosk (React, retained under ADR-013): the working subsystem — do not rewrite without
  re-proving the golden-case and security suites.
- Console (vanilla, ADR-013): no build step; correctness carried by API tests and the E2E
  journeys. The GradientWaves backdrop is the same `ogl` shaders in both (React component in
  the kiosk, `waves.js` in the console), paused when hidden and static under
  `prefers-reduced-motion`.

Further detail: `docs/architecture/*` (phase plans), ADRs in `docs/adr/`, the interview domain
in `docs/interview/DOMAIN.md`.
