/**
 * Chronic-disease and special-population pathways.
 *
 * The special-populations pathway carries the most sensitive safety questions: vaginal bleeding in
 * pregnancy, self-harm, and trauma mechanism. Self-harm carries a privacy note and must always be
 * asked, because the whole point of a structured intake is that it does not flinch from the question
 * a rushed consultation skips.
 */

import type { InterviewPathway } from '../pathway-model';
import { makeQuestion } from './chest-pain';

export const CHRONIC_DISEASE_PATHWAY: InterviewPathway = {
  key: 'PATH-CHRONIC-DISEASE',
  version: '1.0.0',
  displayName: 'Chronic disease',
  complaintCodes: ['MK-CON-001', 'MK-CON-003', 'MK-CON-020'],
  entryWhen: { hasSymptomAny: ['MK-SYM-054', 'MK-SYM-055', 'MK-SYM-024', 'MK-SYM-022', 'MK-SYM-060'] },
  priorityRank: 4,
  completion: { socratesRequiredRatio: 0, maxQuestions: 20 },
  questions: [
    makeQuestion({ key: 'q.chronic.symptom_duration', kind: 'DURATION', category: 'CHIEF_COMPLAINT', required: true, rationale: 'Duration of the new symptoms on top of chronic disease.' }),
    makeQuestion({ key: 'q.chronic.medication_adherence', kind: 'SINGLE_CHOICE', category: 'MEDICATION_ALLERGY', required: true, options: [{ key: 'q.chronic.medication_adherence.opt.regular' }, { key: 'q.chronic.medication_adherence.opt.irregular' }, { key: 'q.chronic.medication_adherence.opt.stopped' }], rationale: 'Adherence explains most "uncontrolled" chronic disease.' }),
    makeQuestion({ key: 'q.chronic.glucose_readings', kind: 'FREE_TEXT', category: 'RELEVANT_HISTORY', required: false, rationale: 'Home glucose readings contextualise the visit.' }),
    makeQuestion({ key: 'q.chronic.hypoglycaemia_symptoms', kind: 'YES_NO', category: 'SAFETY_CRITICAL', required: true, rationale: 'Hypoglycaemia on treatment is an acute risk.' }),
    makeQuestion({ key: 'q.chronic.foot_check', kind: 'YES_NO', category: 'RELEVANT_HISTORY', required: false, positiveConceptCodes: ['MK-SYM-065'], rationale: 'Non-healing foot lesions are a diabetic complication to catch early.' }),
  ],
  branches: [],
  escalation: [],
};

export const SPECIAL_POPULATIONS_PATHWAY: InterviewPathway = {
  key: 'PATH-SPECIAL-POPULATIONS',
  version: '1.0.0',
  displayName: 'Special populations',
  complaintCodes: ['MK-CON-014', 'MK-SYM-053'],
  entryWhen: { hasCondition: 'MK-CON-014' },
  priorityRank: 2,
  completion: { socratesRequiredRatio: 0, maxQuestions: 20 },
  questions: [
    makeQuestion({ key: 'q.special.vaginal_bleeding', kind: 'YES_NO', category: 'SAFETY_CRITICAL', required: true, positiveConceptCodes: ['MK-SYM-053'], rationale: 'Bleeding in pregnancy is watched by a deterministic red-flag rule.' }),
    makeQuestion({ key: 'q.special.reduced_fetal_movement', kind: 'YES_NO', category: 'SAFETY_CRITICAL', required: true, rationale: 'Reduced movement is an obstetric emergency input.' }),
    makeQuestion({ key: 'q.special.trauma_mechanism', kind: 'YES_NO', category: 'SAFETY_CRITICAL', required: true, rationale: 'Mechanism determines whether trauma needs escalation.' }),
    makeQuestion({ key: 'q.special.self_harm_screen', kind: 'YES_NO', category: 'SAFETY_CRITICAL', required: true, positiveConceptCodes: ['MK-HIS-015'], privacyNoteKey: 'q.special.self_harm_screen.privacy', rationale: 'A structured intake must not skip the question a rushed consultation avoids; a positive answer triggers immediate human escalation.' }),
    makeQuestion({ key: 'q.history.pregnant', kind: 'YES_NO', category: 'SAFETY_CRITICAL', required: true, positiveConceptCodes: ['MK-CON-014'], rationale: 'Pregnancy status gates medication and testing decisions.' }),
    makeQuestion({ key: 'q.history.elderly_falls', kind: 'YES_NO', category: 'RELEVANT_HISTORY', required: false, minAgeYears: 65, rationale: 'Falls are the main injury mechanism in the elderly.' }),
  ],
  branches: [],
  escalation: [
    {
      key: 'ESC-SPECIAL-SELF-HARM',
      when: { answeredYes: 'q.special.self_harm_screen' },
      advisory: 'A self-harm risk statement was recorded. Immediate human escalation is required; this is never auto-resolved.',
    },
    {
      key: 'ESC-SPECIAL-PREGNANCY-BLEED',
      when: { answeredYes: 'q.special.vaginal_bleeding' },
      advisory: 'Vaginal bleeding in pregnancy was reported. Immediate human escalation is required.',
    },
  ],
};