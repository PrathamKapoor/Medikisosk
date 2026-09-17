/**
 * The complete MediKiosk clinical vocabulary, assembled into one index.
 *
 * The index is built once at module load. Any duplicate concept code is a hard failure rather than
 * a warning, because two concepts sharing a code would make evidence ambiguous, and evidence
 * ambiguity is exactly what the provenance layer exists to prevent.
 */

import type { ClinicalConcept } from '../concept';
import { buildConceptIndex, type ConceptIndex } from '../concept-index';
import { CARDIO_RESPIRATORY_SYMPTOMS } from './symptoms-cardiorespiratory';
import { RESPIRATORY_AND_SYSTEMIC_SYMPTOMS } from './symptoms-respiratory-systemic';
import { NEUROLOGICAL_SYMPTOMS } from './symptoms-neurological';
import { GI_GU_SYMPTOMS } from './symptoms-gi-gu';
import { CONDITION_CONCEPTS } from './conditions';
import { MEDICATION_CONCEPTS } from './medications';
import { ALLERGY_CONCEPTS } from './allergies';
import { HISTORY_FACT_CONCEPTS } from './history-facts';
import { AYUSH_CONCEPTS } from './ayush';
import { VITAL_DEFINITIONS } from './vitals';
import { LAB_TEST_DEFINITIONS } from './labs';

export * from './symptoms-cardiorespiratory';
export * from './symptoms-respiratory-systemic';
export * from './symptoms-neurological';
export * from './symptoms-gi-gu';
export * from './conditions';
export * from './medications';
export * from './allergies';
export * from './history-facts';
export * from './ayush';
export * from './vitals';
export * from './labs';

export const ALL_SYMPTOM_CONCEPTS: readonly ClinicalConcept[] = [
  ...CARDIO_RESPIRATORY_SYMPTOMS,
  ...RESPIRATORY_AND_SYSTEMIC_SYMPTOMS,
  ...NEUROLOGICAL_SYMPTOMS,
  ...GI_GU_SYMPTOMS,
];

/**
 * Concepts that participate in matching, in a stable order.
 *
 * Vitals and laboratory tests are included even though they are usually entered rather than
 * spoken: a patient does say "my sugar was 300 last week", and an uploaded report contains the
 * test name in prose. Matching them here means one matcher serves both paths.
 */
export const ALL_CONCEPTS: readonly ClinicalConcept[] = [
  ...ALL_SYMPTOM_CONCEPTS,
  ...CONDITION_CONCEPTS,
  ...MEDICATION_CONCEPTS,
  ...ALLERGY_CONCEPTS,
  ...HISTORY_FACT_CONCEPTS,
  ...AYUSH_CONCEPTS,
  ...VITAL_DEFINITIONS.map(
    (vital): ClinicalConcept => ({
      code: vital.code,
      category: 'VITAL',
      display: vital.display,
      synonyms: [...vital.aliases],
      standardCoding: [],
      pathways: [],
      redFlagRelevant: true,
      potentiallyEmergent: false,
    }),
  ),
  ...LAB_TEST_DEFINITIONS.map(
    (lab): ClinicalConcept => ({
      code: lab.code,
      category: 'LAB_TEST',
      display: lab.display,
      synonyms: [...lab.aliases],
      standardCoding: lab.standardCoding ? [...lab.standardCoding] : [],
      pathways: [],
      redFlagRelevant: true,
      potentiallyEmergent: false,
    }),
  ),
];

export const CONCEPT_INDEX: ConceptIndex = buildConceptIndex(ALL_CONCEPTS);

/** Every concept code the safety vocabulary expects a rule set to be able to reference. */
export const RED_FLAG_RELEVANT_CONCEPT_CODES: readonly string[] = ALL_CONCEPTS.filter(
  (concept) => concept.redFlagRelevant,
).map((concept) => concept.code);

/** Complaint codes that may open an interview pathway. */
export const COMPLAINT_CONCEPT_CODES: readonly string[] = ALL_CONCEPTS.filter(
  (concept) => concept.category === 'SYMPTOM',
).map((concept) => concept.code);

/**
 * Concepts a patient is most likely to open with.
 *
 * Ordered by clinical consequence, not by frequency, because the chief-complaint picker is the
 * first thing a patient sees and the ordering is a safety decision. Chest pain and breathlessness
 * come first so that the highest-acuity presentation is one tap away.
 */
export const CHIEF_COMPLAINT_STARTER_CODES: readonly string[] = [
  'MK-SYM-001',
  'MK-SYM-002',
  'MK-SYM-020',
  'MK-SYM-007',
  'MK-SYM-030',
  'MK-SYM-040',
];