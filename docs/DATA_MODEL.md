# MediKiosk data model

Migrations `0001–0016` (`services/api/src/db/migrations/`); row types in
`tables.ts` / `tables-clinical.ts` / `tables-evidence.ts` / `tables-system.ts`.

## Core graph

```mermaid
erDiagram
    patients ||--o{ encounters : has
    encounters ||--o{ questionnaire_responses : asks
    encounters ||--o{ evidence : backs
    encounters ||--o{ symptoms : characterises
    encounters ||--o{ medications : takes
    encounters ||--o{ allergy_records : reacts
    encounters ||--o{ vitals : measures
    encounters ||--o{ lab_results : reports
    encounters ||--o{ history_entries : records
    encounters ||--o{ documents : attaches
    documents ||--o{ document_entities : extracts
    documents ||--o{ document_pages : ocr
    encounters ||--o{ triage_assessments : assesses
    encounters ||--o{ queue_entries : queues
    encounters ||--o{ summaries : drafts
    summaries ||--o{ summary_sections : sections
    encounters ||--o{ encounter_notes : annotates
    encounters ||--o{ diagnoses : diagnoses
    encounters ||--o{ fhir_resources : exports
    patients ||--o{ timeline_events : logs
    patients ||--o{ allergy_status : states
```

## Conventions (enforced, not suggested)

- Every clinical table carries `tenantId`. Timestamps are ISO-8601 UTC text.
- `originClass` + `verificationState` on every clinical row; evidence immutable
  (`supersededBy` for corrections); audit rows append-only and PHI-free.
- Encounter lifecycle: `IN_PROGRESS → SUBMITTED → COMPLETED`, with `patientConfirmedAt`
  gating submission and `disposition`/`completedAt` at completion.
- Queue lifecycle: `WAITING → CALLED → IN_CONSULTATION → COMPLETED`, plus `CANCELLED`;
  `tokenNumber` (`A-042`) assigned once at submission.
- Document lifecycle: `UPLOADED → EXTRACTED → PATIENT_CONFIRMED → VERIFIED`, plus `REJECTED`.
