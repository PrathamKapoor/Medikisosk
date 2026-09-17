/**
 * The assembled chest-pain interview pathway.
 *
 * Separated from the question lists so that each concern stays readable: questions are reviewed for
 * clinical wording, this file is reviewed for entry conditions, branching and escalation. Escalation
 * entries raise an ADVISORY for clinician attention; they do not set the triage level, which is the
 * exclusive responsibility of the deterministic red-flag engine (ADR-009).
 */

import type { InterviewPathway } from "../pathway-model";
import {
  CHEST_PAIN_CHARACTERISATION_QUESTIONS,
  CHEST_PAIN_SAFETY_QUESTIONS,
} from "./chest-pain";

export const CHEST_PAIN_PATHWAY: InterviewPathway = {
  key: "PATH-CHEST-PAIN",
  version: "1.0.0",
  displayName: "Chest pain",
  complaintCodes: ["MK-SYM-001"],
  entryWhen: { hasSymptom: "MK-SYM-001" },
  priorityRank: 1,
  completion: { socratesRequiredRatio: 1, maxQuestions: 22 },
  questions: [
    ...CHEST_PAIN_SAFETY_QUESTIONS,
    ...CHEST_PAIN_CHARACTERISATION_QUESTIONS,
  ],
  branches: [
    {
      key: "BR-CHEST-EXERTION",
      when: {
        any: [
          { answeredYes: "q.chest_pain.safety_dyspnoea" },
          { answeredYes: "q.chest_pain.safety_syncope" },
        ],
      },
      questionKeys: ["q.chest_pain.exertion", "q.chest_pain.relief"],
      description:
        "Added when an associated cardiac symptom is present: exertional pattern and relieving factors refine the assessment.",
    },
  ],
  escalation: [
    {
      key: "ESC-CHEST-PAIN-001",
      when: {
        any: [
          { answeredYes: "q.chest_pain.safety_dyspnoea" },
          { answeredYes: "q.chest_pain.safety_sweating" },
          { answeredYes: "q.chest_pain.safety_syncope" },
        ],
      },
      advisory:
        "Chest pain with an associated cardiac symptom was reported. Deterministic triage rules must be evaluated before the patient leaves the kiosk.",
    },
  ],
};
