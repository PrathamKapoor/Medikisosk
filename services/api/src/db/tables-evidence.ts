/**
 * Database row types, part three: labs, documents, evidence, claims, triage, queue, summaries,
 * AYUSH, FHIR, sync, jobs, audit, analytics, idempotency and configuration audit.
 */

export interface LabResultRow {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId: string;
  testCode: string;
  value: number;
  unit: string;
  referenceLow: number | null;
  referenceHigh: number | null;
  referenceSource: string;
  flag: string;
  implausible: number;
  collectedAt: string;
  reportedAt: string;
  documentId: string | null;
  sourceComment: string | null;
  originClass: string;
  confidence: number;
  verificationState: string;
  verifiedAt: string | null;
  verifiedBy: string | null;
  createdAt: string;
}

export interface DocumentRow {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId: string;
  documentType: string;
  mimeType: string;
  byteSize: number;
  pageCount: number;
  storagePath: string;
  checksum: string;
  status: string;
  qualityJson: string;
  ocrConfidence: number | null;
  uploadedAt: string;
  processedAt: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface DocumentPageRow {
  id: string;
  documentId: string;
  pageNumber: number;
  /** OCR text. Retained for verification; purged with transient artifacts on session wipe. */
  ocrText: string | null;
  qualityScore: number | null;
  createdAt: string;
}

export interface DocumentEntityRow {
  id: string;
  tenantId: string;
  documentId: string;
  kind: string;
  conceptCode: string | null;
  testCode: string | null;
  rawText: string;
  normalisedJson: string;
  flag: string | null;
  confidence: number;
  verificationState: string;
  needsClinicianReview: number;
  evidenceId: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * An evidence row is immutable once written. Corrections are new rows that supersede, never updates.
 * A clinical claim references evidence rows; the reference graph is what the physician inspects in
 * the evidence trace.
 */
export interface EvidenceRow {
  id: string;
  tenantId: string;
  encounterId: string;
  type: string;
  originClass: string;
  source: string;
  sourceRef: string | null;
  rawValue: string | null;
  normalisedJson: string | null;
  confidence: number;
  language: string | null;
  capturedAt: string;
  createdBy: string | null;
  verificationState: string;
  verifiedAt: string | null;
  verifiedBy: string | null;
  supersededBy: string | null;
}

export interface ClinicalClaimRow {
  id: string;
  tenantId: string;
  encounterId: string;
  kind: string;
  statement: string;
  subjectRef: string | null;
  evidenceIdsJson: string;
  originClass: string;
  confidence: number;
  verificationState: string;
  generatedByJson: string | null;
  createdAt: string;
}

export interface TriageAssessmentRow {
  id: string;
  tenantId: string;
  encounterId: string;
  level: string;
  priority: string;
  ruleSetVersion: string;
  requiresHumanReview: number;
  explanation: string;
  hitsJson: string;
  overriddenTo: string | null;
  overriddenBy: string | null;
  overrideReason: string | null;
  overriddenAt: string | null;
  assessedAt: string;
}

export interface QueueEntryRow {
  id: string;
  tenantId: string;
  encounterId: string;
  patientId: string;
  priority: string;
  status: string;
  reason: string | null;
  /** Human-showable queue token, e.g. `A-042`. Assigned once at submission. */
  tokenNumber: string | null;
  ruleIdentifiersJson: string;
  enqueuedAt: string;
  calledAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface SummaryRow {
  id: string;
  tenantId: string;
  encounterId: string;
  providerJson: string;
  ungroundedClaimCount: number;
  verified: number;
  verifiedBy: string | null;
  verifiedAt: string | null;
  attestation: string | null;
  createdAt: string;
}

export interface SummarySectionRow {
  id: string;
  summaryId: string;
  sectionKey: string;
  text: string;
  kind: string;
  evidenceIdsJson: string;
  verificationState: string;
  originalAiText: string | null;
  editedBy: string | null;
  editedAt: string | null;
}

export interface AyushAssessmentRow {
  tenantId: string;
  encounterId: string;
  itemsJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContradictionRow {
  id: string;
  tenantId: string;
  encounterId: string;
  kind: string;
  severity: string;
  statementAJson: string;
  statementBJson: string;
  suggestion: string | null;
  resolutionState: string;
  resolution: string | null;
  resolutionNote: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface FhirResourceRow {
  id: string;
  tenantId: string;
  encounterId: string;
  resourceType: string;
  resourceId: string;
  version: string;
  payloadJson: string;
  createdAt: string;
}

export interface SyncJobRow {
  id: string;
  tenantId: string;
  kind: string;
  encounterId: string | null;
  payloadRef: string | null;
  endpoint: string | null;
  status: string;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}
