/**
 * Personal, social and family history vocabulary.
 *
 * These are the "contextual history" facts that the interview asks last, after safety-critical
 * information and complaint characterisation, because they matter for chronic-disease management
 * and risk stratification but rarely change what happens in the next five minutes.
 *
 * Two of these are deliberately given their own question wording rather than a generic yes/no:
 * tobacco *chewing* (gutkha, khaini, paan masala) and alcohol are asked separately from smoking,
 * because they carry different risks and a combined question reliably loses one of them.
 */

import type { ClinicalConcept } from '../concept';

export const SMOKING_STATUSES = [
  'NEVER',
  'CURRENT',
  'EX_SMOKER',
  'UNKNOWN',
] as const;
export type SmokingStatus = (typeof SMOKING_STATUSES)[number];

export const ALCOHOL_STATUSES = ['NEVER', 'CURRENT', 'EX_DRINKER', 'UNKNOWN'] as const;
export type AlcoholStatus = (typeof ALCOHOL_STATUSES)[number];

export const TOBACCO_CHEWING_STATUSES = ['NEVER', 'CURRENT', 'EX_USER', 'UNKNOWN'] as const;
export type TobaccoChewingStatus = (typeof TOBACCO_CHEWING_STATUSES)[number];

export const FAMILY_RELATIONS = [
  'MOTHER',
  'FATHER',
  'SIBLING',
  'CHILD',
  'GRANDPARENT',
  'OTHER',
  'UNKNOWN',
] as const;
export type FamilyRelation = (typeof FAMILY_RELATIONS)[number];

/** Frequency bands for dietary and activity history. Coarse on purpose: reliably extractable. */
export const FREQUENCY_BANDS = ['NONE', 'RARE', 'SOMETIMES', 'MOST_DAYS', 'DAILY', 'UNKNOWN'] as const;
export type FrequencyBand = (typeof FREQUENCY_BANDS)[number];

function historyFact(
  code: string,
  display: string,
  synonyms: readonly string[],
  notes?: string,
): ClinicalConcept {
  return {
    code,
    category: 'HISTORY_FACT',
    display,
    synonyms: [...synonyms],
    standardCoding: [],
    pathways: [],
    redFlagRelevant: false,
    potentiallyEmergent: false,
    ...(notes === undefined ? {} : { notes }),
  };
}

export const HISTORY_FACT_CONCEPTS: readonly ClinicalConcept[] = [
  historyFact(
    'MK-HIS-001',
    'Cigarette smoking',
    ['smoking', 'smoker', 'cigarette', 'beedi', 'bidi', 'धूम्रपान', 'सिगरेट'],
    'Asked separately from tobacco chewing because the associated risks differ.',
  ),
  historyFact(
    'MK-HIS-002',
    'Tobacco chewing',
    ['tobacco chewing', 'gutkha', 'khaini', 'paan masala', 'zarda', 'तंबाकू चबाना', 'तंबाखू चघळणे'],
    'Given its own question: a combined smoking question reliably loses chewing, which is a distinct and common Indian exposure.',
  ),
  historyFact('MK-HIS-003', 'Alcohol use', ['alcohol', 'drinking', 'liquor', 'sharab', 'शराब', 'दारू'], 'Asked separately from smoking.'),
  historyFact('MK-HIS-004', 'Diet pattern', ['diet', 'food habit', 'vegetarian', 'non vegetarian', 'khana', 'आहार', 'खान-पान']),
  historyFact('MK-HIS-005', 'Physical activity', ['exercise', 'physical activity', 'walking', 'workout', 'vyayam', 'व्यायाम']),
  historyFact('MK-HIS-006', 'Sleep quality', ['sleep', 'sleep disturbance', 'insomnia', 'neend', 'नींद', 'झोप']),
  historyFact('MK-HIS-007', 'Salt intake', ['salt intake', 'namak', 'नमक'], 'Relevant to hypertension management.'),
  historyFact('MK-HIS-008', 'Menstrual history', ['menstrual history', 'periods', 'last menstrual period', 'lmp', 'maahwari', 'माहवारी', 'मासिक पाळी']),
  historyFact('MK-HIS-009', 'Occupational exposure', ['occupational exposure', 'work exposure', 'factory work', 'dust exposure', 'kaam ki jagah']),
  historyFact('MK-HIS-010', 'Recent travel', ['recent travel', 'travel history', 'ghoomna', 'यात्रा']),
  historyFact('MK-HIS-011', 'Immunisation status', ['immunisation', 'immunization', 'vaccination', 'teeka', 'टीकाकरण']),
  historyFact('MK-HIS-012', 'Recent hospitalisation', ['recent hospitalisation', 'recent hospitalization', 'admitted recently', 'admission', 'अस्पताल में भर्ती']),
  historyFact('MK-HIS-013', 'Previous surgery', ['previous surgery', 'operation', 'operative history', 'shalya chikitsa', 'ऑपरेशन', 'शस्त्रक्रिया']),
  historyFact('MK-HIS-014', 'Blood transfusion history', ['blood transfusion', 'transfusion history', 'khoon chadha', 'रक्त संचारण']),
  historyFact('MK-HIS-015', 'Self-harm risk statement', ['wants to harm self', 'suicidal', 'self harm', 'end my life', 'जीना नहीं चाहता', 'आत्महत्या'], 'Any positive response triggers immediate human escalation. Never auto-resolved.'),
];

/**
 * Red-flag relevance for history facts.
 *
 * Kept as data rather than as code branches so that adding a newly recognised risk factor is a
 * vocabulary change plus a rule change, both reviewable, rather than a logic change.
 */
export const HISTORY_FACT_RED_FLAG_CODES: readonly string[] = [
  'MK-HIS-001',
  'MK-HIS-002',
  'MK-HIS-003',
  'MK-HIS-015',
];