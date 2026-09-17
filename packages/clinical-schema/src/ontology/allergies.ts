/**
 * Allergy vocabulary.
 *
 * Allergies are the most safety-critical piece of history a kiosk can capture and the easiest to
 * get wrong, because "no known allergies" and "the patient was never asked" are completely
 * different clinical facts.
 *
 * Therefore: this file defines only what an allergen *is*. The distinction between DENIED and
 * NOT_ASKED is modelled at the record level (`AllergyStatus`) and is never collapsed into a
 * boolean. "No known allergies" is an explicitly recorded and confirmed fact, not a default.
 */

import type { ClinicalConcept } from '../concept';

export const ALLERGY_CATEGORIES = ['DRUG', 'FOOD', 'ENVIRONMENTAL', 'OTHER'] as const;
export type AllergyCategory = (typeof ALLERGY_CATEGORIES)[number];

export const ALLERGY_CATEGORY_LABELS: Record<AllergyCategory, string> = {
  DRUG: 'Medicine',
  FOOD: 'Food',
  ENVIRONMENTAL: 'Environmental',
  OTHER: 'Other',
};

/**
 * The state of allergy knowledge for a patient.
 *
 * `NOT_ASKED` is deliberately first-class. Any consumer that needs to know whether it is safe to
 * assume no allergy must check for `CONFIRMED_NO_KNOWN_ALLERGIES` specifically; treating
 * `NOT_ASKED` as safe is precisely the error this enum exists to make impossible.
 */
export const ALLERGY_STATUSES = [
  'NOT_ASKED',
  'CONFIRMED_NO_KNOWN_ALLERGIES',
  'HAS_ALLERGIES',
  'PATIENT_UNSURE',
  'PATIENT_DECLINED',
] as const;
export type AllergyStatus = (typeof ALLERGY_STATUSES)[number];

export const ALLERGY_STATUS_LABELS: Record<AllergyStatus, string> = {
  NOT_ASKED: 'Not asked',
  CONFIRMED_NO_KNOWN_ALLERGIES: 'No known allergies',
  HAS_ALLERGIES: 'Allergies recorded',
  PATIENT_UNSURE: 'Patient unsure',
  PATIENT_DECLINED: 'Patient declined to answer',
};

/** Reaction severity, kept separate from the presence of the allergy itself. */
export const REACTION_SEVERITIES = ['MILD', 'MODERATE', 'SEVERE', 'ANAPHYLAXIS', 'UNKNOWN'] as const;
export type ReactionSeverity = (typeof REACTION_SEVERITIES)[number];

function allergy(
  code: string,
  display: string,
  category: AllergyCategory,
  synonyms: readonly string[],
  extra: Partial<ClinicalConcept> = {},
): ClinicalConcept {
  return {
    code,
    category: 'ALLERGY',
    display,
    synonyms: [...synonyms],
    standardCoding: [],
    pathways: [],
    redFlagRelevant: false,
    potentiallyEmergent: false,
    notes: `Allergy category: ${category}.`,
    ...extra,
  };
}

export const ALLERGY_CONCEPTS: readonly ClinicalConcept[] = [
  allergy('MK-ALG-001', 'Penicillin', 'DRUG', ['penicillin', 'penicillin allergy', 'पेनिसिलिन'], { redFlagRelevant: true }),
  allergy('MK-ALG-002', 'Sulfa drugs', 'DRUG', ['sulfa', 'sulphonamide', 'sulfamethoxazole', 'cotrimoxazole allergy'], { redFlagRelevant: true }),
  allergy('MK-ALG-003', 'Aspirin or NSAID', 'DRUG', ['aspirin allergy', 'nsaid allergy', 'ibuprofen allergy', 'diclofenac allergy'], { redFlagRelevant: true }),
  allergy('MK-ALG-004', 'Cephalosporins', 'DRUG', ['cephalosporin', 'ceftriaxone allergy', 'cefixime allergy'], { redFlagRelevant: true }),
  allergy('MK-ALG-005', 'Quinolones', 'DRUG', ['quinolone', 'ciprofloxacin allergy', 'levofloxacin allergy'], { redFlagRelevant: true }),
  allergy('MK-ALG-006', 'Iodine contrast', 'DRUG', ['iodine contrast', 'contrast dye allergy', 'radiocontrast allergy'], { redFlagRelevant: true }),
  allergy('MK-ALG-007', 'Peanut', 'FOOD', ['peanut', 'groundnut', 'moongphali', 'मूंगफली'], { redFlagRelevant: true }),
  allergy('MK-ALG-008', 'Tree nuts', 'FOOD', ['tree nuts', 'cashew', 'almond', 'walnut', 'kaju', 'बादाम'], { redFlagRelevant: true }),
  allergy('MK-ALG-009', 'Seafood or shellfish', 'FOOD', ['seafood', 'shellfish', 'fish allergy', 'prawn', 'machhli'], { redFlagRelevant: true }),
  allergy('MK-ALG-010', 'Egg', 'FOOD', ['egg allergy', 'anda', 'अंडा'], { redFlagRelevant: true }),
  allergy('MK-ALG-011', 'Milk protein', 'FOOD', ['milk allergy', 'dairy allergy', 'doodh', 'दूध'], { redFlagRelevant: true }),
  allergy('MK-ALG-012', 'Soy', 'FOOD', ['soy allergy', 'soya'], {}),
  allergy('MK-ALG-013', 'Wheat or gluten', 'FOOD', ['wheat allergy', 'gluten allergy', 'gehun', 'गेहूं'], {}),
  allergy('MK-ALG-014', 'House dust mite', 'ENVIRONMENTAL', ['dust allergy', 'house dust mite', 'dhool se allergy', 'धूल से एलर्जी'], {}),
  allergy('MK-ALG-015', 'Pollen', 'ENVIRONMENTAL', ['pollen allergy', 'seasonal allergy', 'parag'], {}),
  allergy('MK-ALG-016', 'Mould', 'ENVIRONMENTAL', ['mould allergy', 'mold allergy', 'fungal allergy'], {}),
  allergy('MK-ALG-017', 'Insect sting', 'ENVIRONMENTAL', ['insect sting', 'bee sting', 'wasp sting'], { redFlagRelevant: true }),
  allergy('MK-ALG-018', 'Latex', 'OTHER', ['latex allergy', 'rubber allergy'], { redFlagRelevant: true }),
];

/**
 * Cross-reactivity warnings.
 *
 * When a class allergy is recorded, a related prescription is surfaced for human review rather than
 * silently ignored. This is a warning only: MediKiosk never changes a prescription, because
 * autonomous prescribing is outside its scope.
 */
export const CROSS_REACTIVITY_NOTES: readonly {
  readonly allergenCode: string;
  readonly relatedMedicationCodes: readonly string[];
  readonly note: string;
}[] = [
  {
    allergenCode: 'MK-ALG-001',
    relatedMedicationCodes: ['MK-MED-020', 'MK-MED-021', 'MK-MED-022', 'MK-MED-023'],
    note: 'Recorded penicillin allergy: penicillins and cephalosporins may cross-react. Review before prescribing.',
  },
  {
    allergenCode: 'MK-ALG-002',
    relatedMedicationCodes: ['MK-MED-025'],
    note: 'Recorded sulfonamide allergy: cotrimoxazole contains a sulfonamide. Review before prescribing.',
  },
  {
    allergenCode: 'MK-ALG-003',
    relatedMedicationCodes: ['MK-MED-012', 'MK-MED-018', 'MK-MED-019'],
    note: 'Recorded aspirin or NSAID allergy: aspirin and other NSAIDs are related. Review before prescribing.',
  },
];