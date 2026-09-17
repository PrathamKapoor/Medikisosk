/**
 * Database row types, part four: background jobs, audit, analytics, idempotency, consent audit,
 * diagnosis, procedures, timeline, evaluation runs and configuration history.
 */

import type {
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
} from "./tables";
import type {
  QuestionnaireResponseRow,
  InterviewSessionRow,
  SymptomRow,
  MedicationRow,
  AllergyRecordRow,
  AllergyStatusRow,
  HistoryRow,
  PersonalHistoryRow,
  VitalRow,
} from "./tables-clinical";
import type {
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
} from "./tables-evidence";

export interface JobRow {
  id: string;
  tenantId: string;
  type: string;
  encounterId: string | null;
  documentId: string | null;
  payloadJson: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

/**
 * Audit rows are append-only. No update or delete path exists in the repository layer, because an
 * audit trail that can be edited is not an audit trail. PHI is excluded by construction: free text
 * and identifiers are never written here, only codes, keys and counts.
 */
export interface AuditEventRow {
  id: string;
  tenantId: string;
  actorId: string | null;
  actorKind: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  encounterId: string | null;
  requestId: string | null;
  result: string;
  detailJson: string | null;
  createdAt: string;
}

export interface AnalyticsEventRow {
  id: string;
  tenantId: string;
  kind: string;
  encounterId: string | null;
  sessionId: string | null;
  valueJson: string;
  createdAt: string;
}

/**
 * Idempotency records. The request hash is over the canonicalised body, so a retried identical
 * request replays the stored response and a key reused with different content is rejected. Records
 * are retained for 24 hours, then swept.
 */
export interface IdempotencyKeyRow {
  key: string;
  tenantId: string;
  route: string;
  requestHash: string;
  statusCode: number;
  responseJson: string;
  createdAt: string;
  expiresAt: string;
  sessionId: string | null;
}

export interface DiagnosisRow {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId: string;
  conceptCode: string | null;
  displayText: string;
  icd10Code: string | null;
  status: string;
  recordedAt: string;
  recordedBy: string | null;
  originClass: string;
  confidence: number;
  verificationState: string;
  createdAt: string;
}

export interface ProcedureRow {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId: string;
  conceptCode: string | null;
  displayText: string;
  performedOn: string | null;
  facility: string | null;
  originClass: string;
  confidence: number;
  verificationState: string;
  createdAt: string;
}

export interface TimelineViewRow {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId: string;
  eventType: string;
  eventAt: string;
  headline: string;
  detailJson: string;
  evidenceIdsJson: string;
  createdAt: string;
}

export interface EvaluationRunRow {
  id: string;
  tenantId: string;
  datasetVersion: string;
  softwareCommit: string;
  providerVersionsJson: string;
  ruleSetVersion: string;
  promptVersionsJson: string;
  status: string;
  resultJson: string | null;
  requestedBy: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface TenantConfigHistoryRow {
  id: string;
  tenantId: string;
  changedBy: string;
  section: string;
  beforeJson: string | null;
  afterJson: string;
  reason: string | null;
  createdAt: string;
}

/** The complete database interface for Kysely. One row type per table, no exceptions. */
export interface Database {
  tenants: TenantRow;
  users: UserRow;
  kiosks: KioskRow;
  sessions: SessionRow;
  patients: PatientRow;
  external_identifiers: ExternalIdentifierRow;
  identity_challenges: IdentityChallengeRow;
  consent_versions: ConsentVersionRow;
  consents: ConsentRow;
  encounters: EncounterRow;
  interview_sessions: InterviewSessionRow;
  questionnaire_responses: QuestionnaireResponseRow;
  symptoms: SymptomRow;
  medications: MedicationRow;
  allergy_records: AllergyRecordRow;
  allergy_status: AllergyStatusRow;
  history_entries: HistoryRow;
  personal_history: PersonalHistoryRow;
  vitals: VitalRow;
  lab_results: LabResultRow;
  documents: DocumentRow;
  document_pages: DocumentPageRow;
  document_entities: DocumentEntityRow;
  evidence: EvidenceRow;
  clinical_claims: ClinicalClaimRow;
  triage_assessments: TriageAssessmentRow;
  queue_entries: QueueEntryRow;
  summaries: SummaryRow;
  summary_sections: SummarySectionRow;
  ayush_assessments: AyushAssessmentRow;
  contradictions: ContradictionRow;
  fhir_resources: FhirResourceRow;
  sync_jobs: SyncJobRow;
  jobs: JobRow;
  audit_events: AuditEventRow;
  analytics_events: AnalyticsEventRow;
  idempotency_keys: IdempotencyKeyRow;
  diagnoses: DiagnosisRow;
  procedures: ProcedureRow;
  timeline_events: TimelineViewRow;
  evaluation_runs: EvaluationRunRow;
  tenant_config_history: TenantConfigHistoryRow;
}
