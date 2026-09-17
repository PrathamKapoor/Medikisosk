/**
 * Database row types, part two: questionnaire, clinical facts, documents, evidence, safety,
 * summaries, interoperability, jobs, audit and analytics.
 *
 * Each row is written by exactly one repository module, named after the domain it owns. The
 * persistence order matters for evidence: an evidence row is always written before the claim that
 * references it, so a claim can never point at an evidence row that does not exist.
 */

export interface QuestionnaireResponseRow {
  id: string;
  tenantId: string;
  encounterId: string;
  questionKey: string;
  pathwayKey: string;
  kind: string;
  category: string;
  state: string;
  modality: string;
  rawAnswer: string | null;
  normalisedJson: string | null;
  confidence: number | null;
  language: string | null;
  codeMixed: number;
  negated: number;
  uncertain: number;
  askCount: number;
  answeredAt: string | null;
  createdAt: string;
}

export interface SymptomRow {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId: string;
  conceptCode: string;
  displayName: string;
  patientText: string | null;
  onsetDate: string | null;
  durationValue: number | null;
  durationUnit: string | null;
  durationVerbatim: string | null;
  durationApproximate: number;
  severity: string | null;
  severityVerbatim: string | null;
  certainty: string;
  socratesJson: string;
  originClass: string;
  confidence: number;
  verificationState: string;
  verifiedAt: string | null;
  verifiedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MedicationRow {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId: string;
  conceptCode: string;
  asWrittenName: string;
  strengthValue: number | null;
  strengthUnit: string | null;
  doseValue: number | null;
  doseUnit: string | null;
  frequency: string;
  route: string;
  durationDays: number | null;
  status: string;
  startedOn: string | null;
  stoppedOn: string | null;
  isPrescribed: number;
  documentId: string | null;
  originClass: string;
  confidence: number;
  verificationState: string;
  verifiedAt: string | null;
  verifiedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AllergyRecordRow {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId: string;
  conceptCode: string | null;
  freeTextName: string | null;
  category: string | null;
  reactionText: string | null;
  severity: string;
  onsetDate: string | null;
  originClass: string;
  confidence: number;
  verificationState: string;
  verifiedAt: string | null;
  verifiedBy: string | null;
  createdAt: string;
}

export interface AllergyStatusRow {
  tenantId: string;
  patientId: string;
  status: string;
  recordedAt: string;
  recordedBy: string | null;
}

export interface HistoryRow {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId: string;
  kind: string;
  conceptCode: string | null;
  displayName: string;
  relation: string | null;
  onsetYear: number | null;
  resolvedYear: number | null;
  active: number | null;
  controlled: number | null;
  procedureText: string | null;
  performedOn: string | null;
  facility: string | null;
  notes: string | null;
  originClass: string;
  confidence: number;
  verificationState: string;
  createdAt: string;
}

export interface PersonalHistoryRow {
  tenantId: string;
  patientId: string;
  encounterId: string;
  smoking: string;
  alcohol: string;
  tobaccoChewing: string;
  dietPattern: string | null;
  physicalActivity: string | null;
  saltIntake: string | null;
  sleepQuality: string | null;
  occupationalExposure: string | null;
  recentTravel: string | null;
  menstrualLastPeriod: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VitalRow {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId: string;
  conceptCode: string;
  componentCode: string | null;
  value: number;
  unit: string;
  measuredAt: string;
  source: string;
  deviceId: string | null;
  implausible: number;
  originClass: string;
  confidence: number;
  verificationState: string;
  verifiedAt: string | null;
  verifiedBy: string | null;
  createdAt: string;
}
