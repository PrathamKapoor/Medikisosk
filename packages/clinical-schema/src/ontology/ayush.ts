/**
 * AYUSH vocabulary — Dashavidha Pariksha and the Ahara / Vihara assessment.
 *
 * The AYUSH mode is a real, structured workflow, not a free-text notes box. Everything the patient
 * reports is captured as structured concepts carrying the same consent, evidence, verification and
 * audit treatment as the allopathic intake. That is what makes an AYUSH consult interoperable and
 * reviewable rather than merely recorded.
 *
 * Clinical honesty note: the ten Dashavidha Pariksha items and their assessment options below follow
 * the classical description of the examination. The option sets are a curated starter set and
 * require review by a qualified AYUSH practitioner before clinical use. The system records what the
 * patient or practitioner reports; it does not itself determine Prakriti.
 */

import type { ClinicalConcept } from '../concept';

/** The ten Dashavidha Pariksha items. */
export const DASHAVIDHA_ITEMS = [
  'PRAKRITI',
  'VIKRITI',
  'SARA',
  'SAMHANANA',
  'PRAMANA',
  'SATMYA',
  'SATTVA',
  'AHARA_SHAKTI',
  'VYAYAMA_SHAKTI',
  'VAYA',
] as const;

export type DashavidhaItem = (typeof DASHAVIDHA_ITEMS)[number];

export const DASHAVIDHA_LABELS: Record<DashavidhaItem, { name: string; meaning: string }> = {
  PRAKRITI: {
    name: 'Prakriti',
    meaning: 'Constitutional type — the individual\u2019s inherent physical and psychological make-up.',
  },
  VIKRITI: {
    name: 'Vikriti',
    meaning: 'Current imbalance — the deviation from the individual\u2019s own constitution.',
  },
  SARA: {
    name: 'Sara',
    meaning: 'Quality of tissues — the relative excellence of the body\u2019s dhatus.',
  },
  SAMHANANA: {
    name: 'Samhanana',
    meaning: 'Compactness of the body — musculo-skeletal build and stability.',
  },
  PRAMANA: {
    name: 'Pramana',
    meaning: 'Anthropometric measurement — body proportions against reference measures.',
  },
  SATMYA: {
    name: 'Satmya',
    meaning: 'Homologation — what the individual tolerates and habituates to.',
  },
  SATTVA: {
    name: 'Sattva',
    meaning: 'Mental strength and emotional resilience.',
  },
  AHARA_SHAKTI: {
    name: 'Ahara Shakti',
    meaning: 'Power of intake — appetite, quantity and digestive capacity.',
  },
  VYAYAMA_SHAKTI: {
    name: 'Vyayama Shakti',
    meaning: 'Power of exercise — physical endurance.',
  },
  VAYA: {
    name: 'Vaya',
    meaning: 'Age — the life stage of the individual.',
  },
};

/**
 * Tridosha constitution options.
 *
 * Prakriti is recorded as a description of the constitutional assessment, with the dual and
 * tridoshic types represented explicitly, because collapsing them into a single dominant dosha
 * would misrepresent the assessment.
 */
export const PRAKRITI_OPTIONS = [
  'VATA',
  'PITTA',
  'KAPHA',
  'VATA_PITTA',
  'PITTA_KAPHA',
  'VATA_KAPHA',
  'TRIDOSHIC',
  'UNKNOWN',
] as const;

export type PrakritiOption = (typeof PRAKRITI_OPTIONS)[number];

export const VIKRITI_OPTIONS = [
  'VATA_AGGRAVATED',
  'PITTA_AGGRAVATED',
  'KAPHA_AGGRAVATED',
  'MIXED',
  'BALANCED',
  'UNKNOWN',
] as const;

export type VikritiOption = (typeof VIKRITI_OPTIONS)[number];

/** Coarse graded options used by the assessment-based items (Sara, Satmya, Sattva and others). */
export const GRADED_OPTIONS = ['LOW', 'MODERATE', 'HIGH', 'UNKNOWN'] as const;
export type GradedOption = (typeof GRADED_OPTIONS)[number];

export const AGE_STAGE_OPTIONS = ['CHILDHOOD', 'ADOLESCENCE', 'ADULTHOOD', 'MIDDLE_AGE', 'OLD_AGE'] as const;
export type AgeStageOption = (typeof AGE_STAGE_OPTIONS)[number];

function ayush(
  code: string,
  display: string,
  synonyms: readonly string[],
  pathways: readonly string[] = [],
): ClinicalConcept {
  return {
    code,
    category: 'AYUSH',
    display,
    synonyms: [...synonyms],
    standardCoding: [],
    pathways: [...pathways],
    redFlagRelevant: false,
    potentiallyEmergent: false,
  };
}

export const AYUSH_CONCEPTS: readonly ClinicalConcept[] = [
  ayush('MK-AYU-001', 'Prakriti assessment recorded', ['prakriti', 'prakruti', 'constitution', 'प्रकृति'], ['PATH-AYUSH-DASHAVIDHA']),
  ayush('MK-AYU-002', 'Vikriti assessment recorded', ['vikriti', 'vikruti', 'imbalance', 'विकृति'], ['PATH-AYUSH-DASHAVIDHA']),
  ayush('MK-AYU-003', 'Sara assessment recorded', ['sara', 'tissue quality', 'सार'], ['PATH-AYUSH-DASHAVIDHA']),
  ayush('MK-AYU-004', 'Samhanana assessment recorded', ['samhanana', 'body build', 'संहनन'], ['PATH-AYUSH-DASHAVIDHA']),
  ayush('MK-AYU-005', 'Pramana assessment recorded', ['pramana', 'anthropometry', 'प्रमाण'], ['PATH-AYUSH-DASHAVIDHA']),
  ayush('MK-AYU-006', 'Satmya assessment recorded', ['satmya', 'tolerance', 'सात्म्य'], ['PATH-AYUSH-DASHAVIDHA']),
  ayush('MK-AYU-007', 'Sattva assessment recorded', ['sattva', 'mental strength', 'सत्त्व'], ['PATH-AYUSH-DASHAVIDHA']),
  ayush('MK-AYU-008', 'Ahara Shakti assessment recorded', ['ahara shakti', 'appetite', 'digestion', 'आहार शक्ति'], ['PATH-AYUSH-DASHAVIDHA']),
  ayush('MK-AYU-009', 'Vyayama Shakti assessment recorded', ['vyayama shakti', 'exercise capacity', 'व्यायाम शक्ति'], ['PATH-AYUSH-DASHAVIDHA']),
  ayush('MK-AYU-010', 'Vaya assessment recorded', ['vaya', 'age stage', 'वय'], ['PATH-AYUSH-DASHAVIDHA']),
  ayush('MK-AYU-020', 'Ahara (diet) pattern recorded', ['ahara', 'diet pattern', 'आहार'], ['PATH-AYUSH-DASHAVIDHA']),
  ayush('MK-AYU-021', 'Vihara (lifestyle) pattern recorded', ['vihara', 'lifestyle', 'daily routine', 'विहार'], ['PATH-AYUSH-DASHAVIDHA']),
  ayush('MK-AYU-022', 'Nidra (sleep) pattern recorded', ['nidra', 'sleep pattern', 'निद्रा'], ['PATH-AYUSH-DASHAVIDHA']),
  ayush('MK-AYU-023', 'Agni (digestive fire) recorded', ['agni', 'digestive fire', 'अग्नि'], ['PATH-AYUSH-DASHAVIDHA']),
];