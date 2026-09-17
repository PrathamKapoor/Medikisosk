/**
 * Headache and abdominal-pain pathways.
 *
 * Headache uses a neuro-oriented SOCRATES variant: sudden onset, visual change, neck stiffness and
 * focal deficit are all safety-critical. Abdominal pain asks about possible pregnancy in women of
 * reproductive age, because it changes the meaning of the pain and constrains what testing may be
 * ordered. That question carries a privacy note and is age-bounded.
 */

import type { InterviewPathway } from '../pathway-model';
import { makeQuestion } from './chest-pain';

export const HEADACHE_PATHWAY: InterviewPathway = {
  key: 'PATH-HEADACHE',
  version: '1.0.0',
  displayName: 'Headache',
  complaintCodes: ['MK-SYM-030', 'MK-SYM-031', 'MK-SYM-036'],
  entryWhen: { hasSymptomAny: ['MK-SYM-030', 'MK-SYM-031', 'MK-SYM-036'] },
  priorityRank: 3,
  completion: { socratesRequiredRatio: 0.6, maxQuestions: 16 },
  questions: [
    makeQuestion({ key: 'q.headache.sudden_severe', kind: 'YES_NO', category: 'SAFETY_CRITICAL', required: true, positiveConceptCodes: ['MK-SYM-031'], rationale: 'Sudden worst-ever headache is watched by a deterministic red-flag rule.' }),
    makeQuestion({ key: 'q.headache.vision_change', kind: 'YES_NO', category: 'SAFETY_CRITICAL', required: true, positiveConceptCodes: ['MK-SYM-035'], rationale: 'Visual change with headache raises acuity.' }),
    makeQuestion({ key: 'q.headache.neck_stiffness', kind: 'YES_NO', category: 'SAFETY_CRITICAL', required: true, positiveConceptCodes: ['MK-SYM-032'], rationale: 'Neck stiffness is part of meningitis and subarachnoid screening.' }),
    makeQuestion({ key: 'q.headache.neuro_deficit', kind: 'YES_NO', category: 'SAFETY_CRITICAL', required: true, positiveConceptCodes: ['MK-SYM-033'], rationale: 'Focal deficit with headache is a stroke-screen input.' }),
    makeQuestion({ key: 'q.headache.onset', kind: 'DURATION', category: 'CHIEF_COMPLAINT', required: true, socratesDimensions: ['ONSET'], rationale: 'First-ever versus recurrent headache changes the workup.' }),
    makeQuestion({ key: 'q.headache.character', kind: 'SINGLE_CHOICE', category: 'CHIEF_COMPLAINT', required: false, options: [{ key: 'q.headache.character.opt.throbbing' }, { key: 'q.headache.character.opt.dull' }, { key: 'q.headache.character.opt.band' }], socratesDimensions: ['CHARACTER'], rationale: 'Migraine and tension patterns differ in character.' }),
    makeQuestion({ key: 'q.headache.relief', kind: 'MULTI_CHOICE', category: 'CHIEF_COMPLAINT', required: false, options: [{ key: 'q.headache.relief.opt.rest' }, { key: 'q.headache.relief.opt.medication' }, { key: 'q.headache.relief.opt.dark_room' }], socratesDimensions: ['EXACERBATING_RELIEVING'], rationale: 'Relieving factors refine the pattern.' }),
  ],
  branches: [],
  escalation: [
    {
      key: 'ESC-HEADACHE-SEVERE',
      when: { answeredYes: 'q.headache.sudden_severe' },
      advisory: 'Sudden severe headache was reported. Urgent clinical review for subarachnoid risk is required.',
    },
  ],
};

export const ABDOMINAL_PATHWAY: InterviewPathway = {
  key: 'PATH-ABDOMINAL-PAIN',
  version: '1.0.0',
  displayName: 'Abdominal pain',
  complaintCodes: ['MK-SYM-040', 'MK-SYM-041', 'MK-SYM-044'],
  entryWhen: { hasSymptomAny: ['MK-SYM-040', 'MK-SYM-041', 'MK-SYM-044'] },
  priorityRank: 3,
  completion: { socratesRequiredRatio: 0.6, maxQuestions: 18 },
  questions: [
    makeQuestion({ key: 'q.abdominal.blood_in_stool', kind: 'YES_NO', category: 'SAFETY_CRITICAL', required: true, positiveConceptCodes: ['MK-SYM-046'], rationale: 'Rectal bleeding is watched by a deterministic red-flag rule.' }),
    makeQuestion({ key: 'q.abdominal.pregnancy_check', kind: 'YES_NO', category: 'SAFETY_CRITICAL', required: true, positiveConceptCodes: ['MK-CON-014'], minAgeYears: 12, maxAgeYears: 55, privacyNoteKey: 'q.abdominal.pregnancy_check.privacy', rationale: 'Possible pregnancy changes the meaning of abdominal pain and limits testing.' }),
    makeQuestion({ key: 'q.abdominal.site', kind: 'SINGLE_CHOICE', category: 'CHIEF_COMPLAINT', required: true, options: [{ key: 'q.abdominal.site.opt.upper' }, { key: 'q.abdominal.site.opt.lower' }, { key: 'q.abdominal.site.opt.left' }, { key: 'q.abdominal.site.opt.right' }, { key: 'q.abdominal.site.opt.diffuse' }], socratesDimensions: ['SITE'], rationale: 'Quadrant localises the likely organ system.' }),
    makeQuestion({ key: 'q.abdominal.onset', kind: 'DURATION', category: 'CHIEF_COMPLAINT', required: true, socratesDimensions: ['ONSET'], rationale: 'Acute versus chronic abdominal pain differ in urgency.' }),
    makeQuestion({ key: 'q.abdominal.vomiting', kind: 'YES_NO', category: 'CHIEF_COMPLAINT', required: false, positiveConceptCodes: ['MK-SYM-041'], rationale: 'Vomiting accompanies obstruction, infection and pregnancy.' }),
    makeQuestion({ key: 'q.abdominal.bowel_change', kind: 'YES_NO', category: 'CHIEF_COMPLAINT', required: false, positiveConceptCodes: ['MK-SYM-044'], rationale: 'Bowel change with pain points to enteric disease.' }),
    makeQuestion({ key: 'q.abdominal.urinary_symptoms', kind: 'YES_NO', category: 'CHIEF_COMPLAINT', required: false, positiveConceptCodes: ['MK-SYM-050'], rationale: 'Dysuria with pain suggests urinary tract infection.' }),
  ],
  branches: [],
  escalation: [
    {
      key: 'ESC-ABD-BLOOD',
      when: { answeredYes: 'q.abdominal.blood_in_stool' },
      advisory: 'Blood in stool was reported. Prompt clinical review for GI bleeding is required.',
    },
  ],
};