/**
 * General history, medication, allergy and review-of-systems questions.
 *
 * This pathway always applies (entryWhen: always). Three design points matter:
 *
 * 1. Medication and allergy questions are required: a patient can never complete intake without
 *    being asked about medications and allergies.
 * 2. Smoking, alcohol and tobacco chewing are three separate questions. A combined question
 *    reliably loses tobacco chewing, a distinct and common Indian exposure.
 * 3. Allergy detail is asked only when the patient reported an allergy, as a branch.
 */

import type { InterviewPathway } from '../pathway-model';
import { makeQuestion } from './chest-pain';

export const HISTORY_GENERAL_PATHWAY: InterviewPathway = {
  key: 'PATH-HISTORY-GENERAL',
  version: '1.0.0',
  displayName: 'General history',
  complaintCodes: [],
  entryWhen: { always: true },
  priorityRank: 50,
  completion: { socratesRequiredRatio: 0, maxQuestions: 40 },
  questions: [
    makeQuestion({
      key: 'q.history.pmh',
      kind: 'MULTI_CHOICE',
      category: 'RELEVANT_HISTORY',
      required: false,
      options: [
        { key: 'q.history.pmh.opt.diabetes', conceptCodes: ['MK-CON-001'] },
        { key: 'q.history.pmh.opt.hypertension', conceptCodes: ['MK-CON-003'] },
        { key: 'q.history.pmh.opt.heart', conceptCodes: ['MK-CON-004'] },
        { key: 'q.history.pmh.opt.asthma', conceptCodes: ['MK-CON-006'] },
        { key: 'q.history.pmh.opt.tb', conceptCodes: ['MK-CON-008'] },
      ],
      rationale: 'Past medical history determines which current symptoms matter most.',
    }),
    makeQuestion({
      key: 'q.history.smoking',
      kind: 'SINGLE_CHOICE',
      category: 'CONTEXTUAL',
      required: false,
      options: [
        { key: 'q.history.smoking.opt.never', conceptCodes: ['MK-HIS-001'] },
        { key: 'q.history.smoking.opt.current', conceptCodes: ['MK-HIS-001'] },
        { key: 'q.history.smoking.opt.ex' },
      ],
      rationale: 'Smoking is asked separately from chewing because the risks differ.',
    }),
    makeQuestion({
      key: 'q.history.tobacco_chewing',
      kind: 'SINGLE_CHOICE',
      category: 'CONTEXTUAL',
      required: false,
      options: [
        { key: 'q.history.tobacco_chewing.opt.never', conceptCodes: ['MK-HIS-002'] },
        { key: 'q.history.tobacco_chewing.opt.current', conceptCodes: ['MK-HIS-002'] },
        { key: 'q.history.tobacco_chewing.opt.ex' },
      ],
      rationale: 'Chewing gets its own question: a combined question reliably loses it.',
    }),
    makeQuestion({
      key: 'q.history.medications',
      kind: 'FREE_TEXT',
      category: 'MEDICATION_ALLERGY',
      required: true,
      rationale:
        'A patient must be asked about current medications; a record that never asked can never reconcile against a prescription.',
    }),
    makeQuestion({
      key: 'q.history.allergies',
      kind: 'YES_NO',
      category: 'MEDICATION_ALLERGY',
      required: true,
      positiveConceptCodes: ['MK-CON-018'],
      rationale:
        'A patient must be asked about allergies; "not asked" is not "no allergies".',
    }),
    makeQuestion({
      key: 'q.history.allergies_detail',
      kind: 'FREE_TEXT',
      category: 'MEDICATION_ALLERGY',
      required: false,
      rationale: 'Allergen and reaction details, asked only when an allergy was reported.',
    }),
    makeQuestion({
      key: 'q.history.ros',
      kind: 'MULTI_CHOICE',
      category: 'COMPLETENESS',
      required: false,
      options: [
        { key: 'q.history.ros.opt.fever', conceptCodes: ['MK-SYM-020'] },
        { key: 'q.history.ros.opt.weight_loss', conceptCodes: ['MK-SYM-024'] },
        { key: 'q.history.ros.opt.cough', conceptCodes: ['MK-SYM-007'] },
        { key: 'q.history.ros.opt.breathlessness', conceptCodes: ['MK-SYM-002'] },
        { key: 'q.history.ros.opt.none' },
      ],
      rationale: 'A short review of systems catches complaints the patient did not volunteer.',
    }),
    makeQuestion({
      key: 'q.history.notes',
      kind: 'FREE_TEXT',
      category: 'COMPLETENESS',
      required: false,
      rationale: 'Anything else the patient wants to add, in their own words.',
    }),
  ],
  branches: [
    {
      key: 'BR-ALLERGY-DETAIL',
      when: { answeredYes: 'q.history.allergies' },
      questionKeys: ['q.history.allergies_detail'],
      description: 'Allergy details are asked only when the patient reported an allergy.',
    },
  ],
  escalation: [],
};