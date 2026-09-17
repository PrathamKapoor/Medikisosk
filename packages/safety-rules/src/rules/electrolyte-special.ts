/**
 * Electrolyte and special-population rules.
 *
 * Self-harm and obstetric rules are deliberately included in the deterministic set: there is exactly
 * one safe response to them, which is immediate human escalation, and that response should never
 * depend on judgement, availability of a model, or network connectivity.
 */

import { RULE_SET_VERSION, type RedFlagRule } from "../types";

const STARTER_SOURCE =
  "curated starter set, requires clinical review (debt TD-06)";

export const ELECTROLYTE_SPECIAL_RULES: readonly RedFlagRule[] = [
  {
    identifier: "HYPERKALAEMIA_001",
    description: "Potassium flagged high",
    trigger: { labFlaggedHigh: "MK-LAB-007" },
    evidenceRequired: ["MK-LAB-007"],
    severity: "RED",
    action: "IMMEDIATE_HUMAN_TRIAGE",
    clinicalRationale: "Severe hyperkalaemia is a cardiac emergency.",
    source: STARTER_SOURCE,
    version: RULE_SET_VERSION,
  },
  {
    identifier: "HYPONATRAEMIA_SEVERE_001",
    description: "Sodium flagged low at a severe level",
    trigger: { labFlaggedLow: "MK-LAB-006" },
    evidenceRequired: ["MK-LAB-006"],
    severity: "RED",
    action: "IMMEDIATE_HUMAN_TRIAGE",
    clinicalRationale:
      "Severe hyponatraemia risks seizures and needs controlled correction.",
    source: STARTER_SOURCE,
    version: RULE_SET_VERSION,
  },
  {
    identifier: "PREGNANCY_BLEEDING_001",
    description: "Vaginal bleeding in pregnancy",
    trigger: { all: [{ pregnant: true }, { hasSymptom: "MK-SYM-053" }] },
    evidenceRequired: ["MK-SYM-053", "MK-CON-014"],
    severity: "RED",
    action: "IMMEDIATE_HUMAN_TRIAGE",
    clinicalRationale:
      "Bleeding in pregnancy is an obstetric emergency until assessed.",
    source: STARTER_SOURCE,
    version: RULE_SET_VERSION,
  },
  {
    identifier: "PREGNANCY_HYPERTENSION_001",
    description: "Recorded pregnancy with systolic at or above 140 mmHg",
    trigger: {
      all: [
        { pregnant: true },
        { vitalAbove: { code: "MK-VIT-001:SYSTOLIC", value: 140 } },
      ],
    },
    evidenceRequired: ["MK-CON-014", "MK-VIT-001:SYSTOLIC"],
    severity: "AMBER",
    action: "PRIORITY_CLINICIAN_REVIEW",
    clinicalRationale:
      "Hypertension in pregnancy needs pre-eclampsia assessment.",
    source: STARTER_SOURCE,
    version: RULE_SET_VERSION,
  },
  {
    identifier: "PEDIATRIC_FEVER_INFANT_001",
    description: "Fever in an infant under three months",
    trigger: { all: [{ hasSymptom: "MK-SYM-020" }, { ageAtMost: 0 }] },
    evidenceRequired: ["MK-SYM-020"],
    severity: "RED",
    action: "IMMEDIATE_HUMAN_TRIAGE",
    clinicalRationale: "Any fever in a neonate is an emergency workup.",
    source: STARTER_SOURCE,
    version: RULE_SET_VERSION,
    maxAgeYears: 0.25,
  },
  {
    identifier: "PEDIATRIC_FEVER_001",
    description: "Fever in a child under five",
    trigger: { all: [{ hasSymptom: "MK-SYM-020" }, { ageAtMost: 5 }] },
    evidenceRequired: ["MK-SYM-020"],
    severity: "AMBER",
    action: "PRIORITY_CLINICIAN_REVIEW",
    clinicalRationale: "Under-five fever needs a timely cause found.",
    source: STARTER_SOURCE,
    version: RULE_SET_VERSION,
    maxAgeYears: 5,
  },
  {
    identifier: "ELDERLY_FALL_001",
    description: "Fainting at or above age 65",
    trigger: { all: [{ hasSymptom: "MK-SYM-006" }, { ageAtLeast: 65 }] },
    evidenceRequired: ["MK-SYM-006"],
    severity: "AMBER",
    action: "PRIORITY_CLINICIAN_REVIEW",
    clinicalRationale:
      "Syncope in the elderly carries injury and cardiac risk.",
    source: STARTER_SOURCE,
    version: RULE_SET_VERSION,
    minAgeYears: 65,
  },
  {
    identifier: "TRAUMA_MECHANISM_001",
    description: "Significant trauma mechanism reported",
    trigger: { answeredYes: "q.special.trauma_mechanism" },
    evidenceRequired: ["q.special.trauma_mechanism"],
    severity: "AMBER",
    action: "PRIORITY_CLINICIAN_REVIEW",
    clinicalRationale:
      "Mechanism determines whether occult injury must be ruled out.",
    source: STARTER_SOURCE,
    version: RULE_SET_VERSION,
  },
  {
    identifier: "SELF_HARM_RISK_001",
    description: "Self-harm risk statement recorded",
    trigger: { hasSymptom: "MK-HIS-015" },
    evidenceRequired: ["MK-HIS-015"],
    severity: "RED",
    action: "IMMEDIATE_HUMAN_TRIAGE",
    clinicalRationale:
      "A self-harm statement requires immediate compassionate human attention. It is never auto-resolved and never de-escalated by rules.",
    source: STARTER_SOURCE,
    version: RULE_SET_VERSION,
  },
  {
    identifier: "DATA_INCOMPLETE_SAFETY_001",
    description: "A safety-critical question is unresolved",
    trigger: { always: true },
    evidenceRequired: ["SAFETY_CRITICAL_UNRESOLVED"],
    severity: "AMBER",
    action: "PRIORITY_CLINICIAN_REVIEW",
    clinicalRationale:
      "An unresolved safety-critical question is never treated as a negative answer. The missing fact requires human review rather than being assumed absent.",
    source: STARTER_SOURCE,
    version: RULE_SET_VERSION,
    advisoryOnly: true,
  },
];
