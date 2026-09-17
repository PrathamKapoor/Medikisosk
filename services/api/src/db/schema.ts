/**
 * Database row-type barrel.
 *
 * Re-exports every row type so the repository layer imports types from one place. The types
 * themselves live in `tables.ts`, `tables-clinical.ts`, `tables-evidence.ts` and `tables-system.ts`
 * so that each concern stays reviewable.
 */

export type {
  TenantRow,
  UserRow,
  KioskRow,
  SessionRow,
  PatientRow,
  ExternalIdentifierRow,
  IdentityChallengeRow,
  ConsentVersionRow,
  ConsentRow,
  EncounterRow,
} from './tables';

export type {
  QuestionnaireResponseRow,
  SymptomRow,
  MedicationRow,
  AllergyRecordRow,
  AllergyStatusRow,
  HistoryRow,
  PersonalHistoryRow,
  VitalRow,
} from './tables-clinical';

export type {
  LabResultRow,
  DocumentRow,
  DocumentPageRow,
  DocumentEntityRow,
  EvidenceRow,
  ClinicalClaimRow,
  TriageAssessmentRow,
  QueueEntryRow,
  SummaryRow,
  SummarySectionRow,
  AyushAssessmentRow,
  ContradictionRow,
  FhirResourceRow,
  SyncJobRow,
} from './tables-evidence';

export type {
  JobRow,
  AuditEventRow,
  AnalyticsEventRow,
  IdempotencyKeyRow,
  DiagnosisRow,
  ProcedureRow,
  TimelineViewRow,
  EvaluationRunRow,
  TenantConfigHistoryRow,
  Database,
} from './tables-system';