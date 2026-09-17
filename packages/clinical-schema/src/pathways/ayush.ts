/**
 * AYUSH Dashavidha Pariksha pathway.
 *
 * Gated by the `ayush_enabled` feature flag at the service layer, not here, because feature
 * availability is a deployment decision and must not be baked into clinical content. The same
 * consent, evidence, verification and audit machinery applies; AYUSH data is never second-class.
 */

import type { InterviewPathway } from '../pathway-model';
import { makeQuestion } from './chest-pain';

export const AYUSH_PATHWAY: InterviewPathway = {
  key: 'PATH-AYUSH-DASHAVIDHA',
  version: '1.0.0',
  displayName: 'AYUSH Dashavidha Pariksha',
  complaintCodes: [],
  entryWhen: {
    any: [{ hasSymptom: 'MK-SYM-040' }, { hasCondition: 'MK-CON-001' }, { hasCondition: 'MK-CON-003' }],
  },
  priorityRank: 60,
  completion: { socratesRequiredRatio: 0, maxQuestions: 30 },
  questions: [
    makeQuestion({
      key: 'q.ayush.prakriti',
      kind: 'SINGLE_CHOICE',
      category: 'CONTEXTUAL',
      required: false,
      options: [
        { key: 'q.ayush.prakriti.opt.vata' },
        { key: 'q.ayush.prakriti.opt.pitta' },
        { key: 'q.ayush.prakriti.opt.kapha' },
      ],
      rationale: 'Constitutional type, recorded as reported; the system does not determine Prakriti.',
    }),
    makeQuestion({
      key: 'q.ayush.vikriti',
      kind: 'SINGLE_CHOICE',
      category: 'CONTEXTUAL',
      required: false,
      options: [
        { key: 'q.ayush.vikriti.opt.vata' },
        { key: 'q.ayush.vikriti.opt.pitta' },
        { key: 'q.ayush.vikriti.opt.kapha' },
      ],
      rationale: 'Current imbalance, recorded as reported.',
    }),
    makeQuestion({
      key: 'q.ayush.ahara_shakti',
      kind: 'SINGLE_CHOICE',
      category: 'CONTEXTUAL',
      required: false,
      options: [
        { key: 'q.ayush.ahara_shakti.opt.low' },
        { key: 'q.ayush.ahara_shakti.opt.moderate' },
        { key: 'q.ayush.ahara_shakti.opt.high' },
      ],
      rationale: 'Digestive capacity as assessed.',
    }),
    makeQuestion({
      key: 'q.ayush.vyayama_shakti',
      kind: 'SINGLE_CHOICE',
      category: 'CONTEXTUAL',
      required: false,
      options: [
        { key: 'q.ayush.vyayama_shakti.opt.low' },
        { key: 'q.ayush.vyayama_shakti.opt.moderate' },
        { key: 'q.ayush.vyayama_shakti.opt.high' },
      ],
      rationale: 'Exercise endurance as assessed.',
    }),
    makeQuestion({
      key: 'q.ayush.ahara',
      kind: 'FREE_TEXT',
      category: 'CONTEXTUAL',
      required: false,
      rationale: 'Diet pattern for the AYUSH assessment.',
    }),
    makeQuestion({
      key: 'q.ayush.vihara',
      kind: 'FREE_TEXT',
      category: 'CONTEXTUAL',
      required: false,
      rationale: 'Lifestyle pattern for the AYUSH assessment.',
    }),
  ],
  branches: [],
  escalation: [],
};