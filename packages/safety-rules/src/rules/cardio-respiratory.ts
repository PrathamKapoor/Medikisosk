/**
 * Cardiovascular and respiratory red-flag rules.
 *
 * Every rule is data: identifier, description, declarative trigger, evidence requirement, severity,
 * action, rationale, source and version. The engine contains no complaint-specific logic, so adding a
 * rule is a clinical review task rather than a code change. All sources are the curated starter set,
 * never a claimed guideline, until clinical advisory review has been recorded.
 */

import { RULE_SET_VERSION, type RedFlagRule } from "../types";

const STARTER_SOURCE =
  "curated starter set, requires clinical review (debt TD-06)";

/** Vitals are keyed by component-qualified code so blood pressure reads correctly. */
export const SYS = "MK-VIT-001:SYSTOLIC";
export const DIA = "MK-VIT-001:DIASTOLIC";
export const PULSE = "MK-VIT-002";
export const TEMP = "MK-VIT-003";
export const SPO2 = "MK-VIT-004";
export const RR = "MK-VIT-005";
export const GLUCOSE = "MK-VIT-006";

export const CARDIO_RESPIRATORY_RULES: readonly RedFlagRule[] = [
  {
    identifier: "CHEST_PAIN_HIGH_RISK_001",
    description: "Chest pain with shortness of breath",
    trigger: {
      all: [{ hasSymptom: "MK-SYM-001" }, { hasSymptom: "MK-SYM-002" }],
    },
    evidenceRequired: ["MK-SYM-001", "MK-SYM-002"],
    severity: "RED",
    action: "IMMEDIATE_HUMAN_TRIAGE",
    clinicalRationale:
      "Chest pain with breathlessness is the highest-acuity presentation this product sees; cardiac and pulmonary emergencies present exactly this way.",
    source: STARTER_SOURCE,
    version: RULE_SET_VERSION,
  },
  {
    identifier: "CHEST_PAIN_HIGH_RISK_002",
    description: "Chest pain radiating to arm or jaw, or with cold sweat",
    trigger: {
      all: [
        { hasSymptom: "MK-SYM-001" },
        { hasSymptomAny: ["MK-SYM-012", "MK-SYM-005"] },
      ],
    },
    evidenceRequired: ["MK-SYM-001", "MK-SYM-012"],
    severity: "RED",
    action: "IMMEDIATE_HUMAN_TRIAGE",
    clinicalRationale:
      "Radiation to the arm or jaw and cold sweating are classical accompaniments of acute coronary syndromes.",
    source: STARTER_SOURCE,
    version: RULE_SET_VERSION,
  },
  {
    identifier: "CHEST_PAIN_HIGH_RISK_003",
    description: "Chest pain with fainting",
    trigger: {
      all: [{ hasSymptom: "MK-SYM-001" }, { hasSymptom: "MK-SYM-006" }],
    },
    evidenceRequired: ["MK-SYM-001", "MK-SYM-006"],
    severity: "RED",
    action: "IMMEDIATE_HUMAN_TRIAGE",
    clinicalRationale:
      "Syncope with chest pain indicates possible haemodynamic compromise.",
    source: STARTER_SOURCE,
    version: RULE_SET_VERSION,
  },
  {
    identifier: "CHEST_PAIN_HIGH_RISK_004",
    description: "Chest pain in a patient with known ischaemic heart disease",
    trigger: {
      all: [{ hasSymptom: "MK-SYM-001" }, { hasCondition: "MK-CON-004" }],
    },
    evidenceRequired: ["MK-SYM-001", "MK-CON-004"],
    severity: "AMBER",
    action: "PRIORITY_CLINICIAN_REVIEW",
    clinicalRationale:
      "Recurrent ischaemia in known heart disease needs prompt review, and is a severity step below pain with an acute associated symptom.",
    source: STARTER_SOURCE,
    version: RULE_SET_VERSION,
  },
  {
    identifier: "CHEST_PAIN_HIGH_RISK_005",
    description: "Chest pain with exertional breathlessness at or above age 45",
    trigger: {
      all: [
        { hasSymptom: "MK-SYM-001" },
        { hasSymptom: "MK-SYM-003" },
        { ageAtLeast: 45 },
      ],
    },
    evidenceRequired: ["MK-SYM-001", "MK-SYM-003"],
    severity: "AMBER",
    action: "PRIORITY_CLINICIAN_REVIEW",
    clinicalRationale:
      "Exertional angina-equivalent in an older adult warrants cardiology review.",
    source: STARTER_SOURCE,
    version: RULE_SET_VERSION,
    minAgeYears: 45,
  },
  {
    identifier: "PALPITATIONS_001",
    description: "Palpitations with fainting or chest pain",
    trigger: {
      all: [
        { hasSymptom: "MK-SYM-004" },
        { hasSymptomAny: ["MK-SYM-006", "MK-SYM-001"] },
      ],
    },
    evidenceRequired: ["MK-SYM-004"],
    severity: "AMBER",
    action: "PRIORITY_CLINICIAN_REVIEW",
    clinicalRationale: "Symptomatic arrhythmia can present exactly this way.",
    source: STARTER_SOURCE,
    version: RULE_SET_VERSION,
  },
  {
    identifier: "HYPOXIA_001",
    description: "Oxygen saturation below 92 percent",
    trigger: { vitalBelow: { code: SPO2, value: 92 } },
    evidenceRequired: [SPO2],
    severity: "RED",
    action: "IMMEDIATE_HUMAN_TRIAGE",
    clinicalRationale:
      "Hypoxia at this level needs immediate assessment regardless of cause.",
    source: STARTER_SOURCE,
    version: RULE_SET_VERSION,
  },
  {
    identifier: "HYPOXIA_002",
    description: "Oxygen saturation below 94 percent",
    trigger: { vitalBelow: { code: SPO2, value: 94 } },
    evidenceRequired: [SPO2],
    severity: "AMBER",
    action: "PRIORITY_CLINICIAN_REVIEW",
    clinicalRationale:
      "Low-normal saturation needs review, a step below frank hypoxia.",
    source: STARTER_SOURCE,
    version: RULE_SET_VERSION,
  },
];
