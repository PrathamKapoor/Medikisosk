/**
 * Fever and respiratory pathways.
 *
 * Each pathway pairs a neuro-oriented or exposure-oriented SOCRATES variant with the safety question
 * that must never be skipped: neck stiffness in fever, blood in sputum in respiratory disease.
 */

import type { InterviewPathway } from "../pathway-model";
import { makeQuestion } from "./chest-pain";

export const FEVER_PATHWAY: InterviewPathway = {
  key: "PATH-FEVER",
  version: "1.0.0",
  displayName: "Fever",
  complaintCodes: ["MK-SYM-020", "MK-SYM-021", "MK-SYM-022"],
  entryWhen: { hasSymptomAny: ["MK-SYM-020", "MK-SYM-021", "MK-SYM-022"] },
  priorityRank: 2,
  completion: { socratesRequiredRatio: 0.6, maxQuestions: 18 },
  questions: [
    makeQuestion({
      key: "q.fever.neck_stiffness",
      kind: "YES_NO",
      category: "SAFETY_CRITICAL",
      required: true,
      positiveConceptCodes: ["MK-SYM-032"],
      rationale:
        "Fever with neck stiffness may indicate meningitis and needs prompt review.",
    }),
    makeQuestion({
      key: "q.fever.onset",
      kind: "DURATION",
      category: "CHIEF_COMPLAINT",
      required: true,
      socratesDimensions: ["ONSET"],
      rationale:
        "Fever duration separates acute infections from prolonged fever.",
    }),
    makeQuestion({
      key: "q.fever.severity",
      kind: "SEVERITY",
      category: "CHIEF_COMPLAINT",
      required: true,
      socratesDimensions: ["SEVERITY"],
      rationale: "Maximum temperature reached and how it was measured.",
    }),
    makeQuestion({
      key: "q.fever.pattern",
      kind: "SINGLE_CHOICE",
      category: "CHIEF_COMPLAINT",
      required: false,
      options: [
        { key: "q.fever.pattern.opt.continuous" },
        { key: "q.fever.pattern.opt.intermittent" },
        { key: "q.fever.pattern.opt.episodic" },
      ],
      socratesDimensions: ["TIMING"],
      rationale: "Intermittent fever suggests malaria-like causes.",
    }),
    makeQuestion({
      key: "q.fever.rash",
      kind: "YES_NO",
      category: "RELEVANT_HISTORY",
      required: false,
      positiveConceptCodes: ["MK-SYM-064"],
      rationale: "Rash with fever changes the differential.",
    }),
    makeQuestion({
      key: "q.fever.headache_with_fever",
      kind: "YES_NO",
      category: "RELEVANT_HISTORY",
      required: false,
      positiveConceptCodes: ["MK-SYM-030"],
      rationale: "Headache with fever is relevant to meningitis screening.",
    }),
    makeQuestion({
      key: "q.fever.mosquito_exposure",
      kind: "YES_NO",
      category: "CONTEXTUAL",
      required: false,
      rationale: "Mosquito exposure is relevant to dengue and malaria.",
    }),
    makeQuestion({
      key: "q.fever.water_intake",
      kind: "YES_NO",
      category: "CONTEXTUAL",
      required: false,
      rationale: "Water source is relevant to enteric fever.",
    }),
  ],
  branches: [],
  escalation: [
    {
      key: "ESC-FEVER-NECK",
      when: { answeredYes: "q.fever.neck_stiffness" },
      advisory:
        "Fever with neck stiffness was reported. Prompt clinical review for meningitis risk is required.",
    },
  ],
};

export const RESPIRATORY_PATHWAY: InterviewPathway = {
  key: "PATH-RESPIRATORY",
  version: "1.0.0",
  displayName: "Respiratory",
  complaintCodes: ["MK-SYM-007", "MK-SYM-009", "MK-SYM-002", "MK-SYM-003"],
  entryWhen: {
    hasSymptomAny: ["MK-SYM-007", "MK-SYM-009", "MK-SYM-002", "MK-SYM-003"],
  },
  priorityRank: 2,
  completion: { socratesRequiredRatio: 0.6, maxQuestions: 18 },
  questions: [
    makeQuestion({
      key: "q.respiratory.blood_in_sputum",
      kind: "YES_NO",
      category: "SAFETY_CRITICAL",
      required: true,
      positiveConceptCodes: ["MK-SYM-008"],
      rationale: "Haemoptysis is watched by a deterministic red-flag rule.",
    }),
    makeQuestion({
      key: "q.respiratory.onset",
      kind: "DURATION",
      category: "CHIEF_COMPLAINT",
      required: true,
      socratesDimensions: ["ONSET"],
      rationale:
        "Cough duration separates acute infection from chronic disease.",
    }),
    makeQuestion({
      key: "q.respiratory.sputum",
      kind: "YES_NO",
      category: "CHIEF_COMPLAINT",
      required: false,
      rationale: "Dry versus productive cough matters for TB and COPD.",
    }),
    makeQuestion({
      key: "q.respiratory.wheeze",
      kind: "YES_NO",
      category: "CHIEF_COMPLAINT",
      required: false,
      positiveConceptCodes: ["MK-SYM-009"],
      rationale: "Wheeze points to reactive airways disease.",
    }),
    makeQuestion({
      key: "q.respiratory.night_symptoms",
      kind: "YES_NO",
      category: "CHIEF_COMPLAINT",
      required: false,
      rationale: "Nocturnal symptoms matter in asthma and heart failure.",
    }),
    makeQuestion({
      key: "q.respiratory.chest_tightness",
      kind: "YES_NO",
      category: "CHIEF_COMPLAINT",
      required: false,
      positiveConceptCodes: ["MK-SYM-001"],
      rationale: "Chest tightness with cough can indicate a cardiac component.",
    }),
    makeQuestion({
      key: "q.respiratory.smoking",
      kind: "YES_NO",
      category: "CONTEXTUAL",
      required: false,
      positiveConceptCodes: ["MK-HIS-001"],
      rationale: "Smoking history is central to respiratory disease.",
    }),
  ],
  branches: [],
  escalation: [
    {
      key: "ESC-RESP-BLOOD",
      when: { answeredYes: "q.respiratory.blood_in_sputum" },
      advisory:
        "Blood in sputum was reported. Prompt clinical review is required.",
    },
  ],
};
