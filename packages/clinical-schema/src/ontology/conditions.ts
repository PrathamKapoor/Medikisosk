/**
 * Condition / diagnosis vocabulary.
 *
 * Used for past medical history, family history, and document-derived diagnoses. ICD-10 codes are
 * recorded only where the mapping is unambiguous. Where the concept is coarser than an ICD-10
 * category (for example "chronic kidney disease" without a stage), no code is claimed, because a
 * coarse concept mapped onto a specific code would misrepresent the patient's record to any
 * downstream system that trusts the coding.
 */

import type { ClinicalConcept } from '../concept';

const ICD10 = 'http://hl7.org/fhir/sid/icd-10';

function condition(
  code: string,
  display: string,
  synonyms: readonly string[],
  icd10?: { code: string; display: string },
  extra: Partial<ClinicalConcept> = {},
): ClinicalConcept {
  return {
    code,
    category: 'CONDITION',
    display,
    synonyms: [...synonyms],
    standardCoding: icd10 ? [{ system: ICD10, code: icd10.code, display: icd10.display }] : [],
    pathways: [],
    redFlagRelevant: false,
    potentiallyEmergent: false,
    ...extra,
  };
}

export const CONDITION_CONCEPTS: readonly ClinicalConcept[] = [
  condition(
    'MK-CON-001',
    'Type 2 diabetes mellitus',
    ['type 2 diabetes', 'diabetes', 'dm2', 'sugar ki bimari', 'madhumeh', 'मधुमेह', 'शुगर की बीमारी'],
    { code: 'E11', display: 'Type 2 diabetes mellitus' },
    { pathways: ['PATH-CHRONIC-DISEASE'], redFlagRelevant: true },
  ),
  condition(
    'MK-CON-002',
    'Type 1 diabetes mellitus',
    ['type 1 diabetes', 'dm1', 'insulin dependent diabetes'],
    { code: 'E10', display: 'Type 1 diabetes mellitus' },
    { pathways: ['PATH-CHRONIC-DISEASE'], redFlagRelevant: true },
  ),
  condition(
    'MK-CON-003',
    'Hypertension',
    ['hypertension', 'high blood pressure', 'high bp', 'bp ki bimari', 'raktachaap', 'उच्च रक्तदाब', 'उच्च रक्तचाप'],
    { code: 'I10', display: 'Essential (primary) hypertension' },
    { pathways: ['PATH-CHRONIC-DISEASE'], redFlagRelevant: true },
  ),
  condition(
    'MK-CON-004',
    'Ischaemic heart disease',
    ['ischaemic heart disease', 'ischemic heart disease', 'coronary artery disease', 'cad', 'ihd', 'heart attack previously', 'dil ki bimari', 'हृदय रोग'],
    { code: 'I25', display: 'Chronic ischaemic heart disease' },
    { pathways: ['PATH-CHEST-PAIN'], redFlagRelevant: true },
  ),
  condition(
    'MK-CON-005',
    'Heart failure',
    ['heart failure', 'congestive cardiac failure', 'ccf', 'chf', 'dil ki kamzori'],
    { code: 'I50', display: 'Heart failure' },
    { pathways: ['PATH-CHEST-PAIN', 'PATH-RESPIRATORY'], redFlagRelevant: true },
  ),
  condition(
    'MK-CON-006',
    'Asthma',
    ['asthma', 'bronchial asthma', 'dama', 'दमा', 'श्वासाचा त्रास'],
    { code: 'J45', display: 'Asthma' },
    { pathways: ['PATH-RESPIRATORY'], redFlagRelevant: true },
  ),
  condition(
    'MK-CON-007',
    'Chronic obstructive pulmonary disease',
    ['chronic obstructive pulmonary disease', 'copd', 'chronic bronchitis', 'emphysema'],
    { code: 'J44', display: 'Other chronic obstructive pulmonary disease' },
    { pathways: ['PATH-RESPIRATORY'], redFlagRelevant: true },
  ),
  condition(
    'MK-CON-008',
    'Tuberculosis',
    ['tuberculosis', 'kshay rog', 'क्षय रोग', 'टीबी'],
    { code: 'A15', display: 'Respiratory tuberculosis' },
    { pathways: ['PATH-RESPIRATORY', 'PATH-FEVER'], redFlagRelevant: true },
  ),
  condition(
    'MK-CON-009',
    'Chronic kidney disease',
    ['chronic kidney disease', 'ckd', 'kidney failure', 'renal failure', 'gurda ki bimari', 'गुर्दे की बीमारी'],
    undefined,
    { pathways: ['PATH-CHRONIC-DISEASE'], redFlagRelevant: true },
  ),
  condition(
    'MK-CON-010',
    'Cerebrovascular accident',
    ['stroke', 'cerebrovascular accident', 'brain stroke', 'paralysis', 'lakwa', 'लकवा'],
    { code: 'I64', display: 'Stroke, not specified as haemorrhage or infarction' },
    { redFlagRelevant: true, potentiallyEmergent: true },
  ),
  condition(
    'MK-CON-011',
    'Epilepsy',
    ['epilepsy', 'seizure disorder', 'fits', 'mirgi', 'मिर्गी'],
    { code: 'G40', display: 'Epilepsy' },
    { redFlagRelevant: true },
  ),
  condition(
    'MK-CON-012',
    'Hypothyroidism',
    ['hypothyroidism', 'underactive thyroid', 'thyroid problem', 'थायरॉइड की समस्या'],
    { code: 'E03', display: 'Other hypothyroidism' },
    {},
  ),
  condition(
    'MK-CON-013',
    'Anaemia',
    ['anaemia', 'anemia', 'low haemoglobin', 'khoon ki kami', 'खून की कमी', 'रक्तक्षय'],
    { code: 'D64', display: 'Other anaemia' },
    {},
  ),
  condition(
    'MK-CON-014',
    'Currently pregnant',
    ['pregnant', 'pregnancy', 'garbhvati', 'गर्भवती', 'गर्भवती आहे'],
    { code: 'Z33', display: 'Pregnant state, incidental' },
    { pathways: ['PATH-SPECIAL-POPULATIONS'], redFlagRelevant: true, potentiallyEmergent: true },
  ),
  condition(
    'MK-CON-015',
    'Malignancy',
    ['cancer', 'malignancy', 'carcinoma', 'tumour', 'kainkari', 'कैंसर'],
    { code: 'C80', display: 'Malignant neoplasm without specification of site' },
    { redFlagRelevant: true },
  ),
  condition(
    'MK-CON-016',
    'Chronic liver disease',
    ['chronic liver disease', 'cirrhosis', 'liver problem', 'jigar ki bimari', 'जिगर की बीमारी'],
    { code: 'K74', display: 'Fibrosis and cirrhosis of liver' },
    { redFlagRelevant: true },
  ),
  condition(
    'MK-CON-017',
    'Known drug allergy',
    ['drug allergy', 'allergic to medicine', 'dawai se allergy', 'दवा से एलर्जी'],
    { code: 'Z88', display: 'Allergy status to drugs, medicaments and biological substances' },
    { redFlagRelevant: true },
  ),
  condition(
    'MK-CON-018',
    'Obesity',
    ['obesity', 'overweight', 'motaapa', 'मोटापा', 'स्थूलता'],
    { code: 'E66', display: 'Obesity' },
    { pathways: ['PATH-CHRONIC-DISEASE'] },
  ),
];