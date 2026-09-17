/**
 * Symptom vocabulary — neurological and ophthalmic presentations.
 *
 * Codes are intentionally spaced so a symptom discovered during clinical review can be inserted
 * near its neighbours without renumbering. Renumbering is forbidden: stored evidence rows reference
 * these codes permanently.
 */

import type { ClinicalConcept } from '../concept';
import { symptom } from './symptoms-cardiorespiratory';

export const NEUROLOGICAL_SYMPTOMS: readonly ClinicalConcept[] = [
  symptom(
    'MK-SYM-030',
    'Headache',
    'NEUROLOGICAL',
    [
      'headache',
      'head pain',
      'migraine',
      'sir dard',
      'sar dard',
      'सिर दर्द',
      'डोके दुखणे',
      'માથું દુખવું',
      'தலைவலி',
      'తలనొప్పి',
      'মাথা ব্যথা',
    ],
    { pathways: ['PATH-HEADACHE'], redFlagRelevant: true },
  ),
  symptom(
    'MK-SYM-031',
    'Sudden severe headache',
    'NEUROLOGICAL',
    [
      'worst headache of my life',
      'sudden severe headache',
      'thunderclap headache',
      'headache started suddenly',
      'achanak tez sir dard',
      'अचानक तेज़ सिर दर्द',
    ],
    {
      pathways: ['PATH-HEADACHE'],
      redFlagRelevant: true,
      potentiallyEmergent: true,
      notes:
        'Distinct from ordinary headache: sudden maximal-onset headache is a specific deterministic red-flag input, so it must be recognisable as its own concept.',
    },
  ),
  symptom(
    'MK-SYM-032',
    'Neck stiffness',
    'NEUROLOGICAL',
    ['neck stiffness', 'stiff neck', 'cannot bend neck', 'gardan akadna', 'गर्दन अकड़ना', 'मान ताठणे'],
    { pathways: ['PATH-HEADACHE', 'PATH-FEVER'], redFlagRelevant: true, potentiallyEmergent: true },
  ),
  symptom(
    'MK-SYM-033',
    'Focal neurological deficit',
    'NEUROLOGICAL',
    [
      'weakness on one side',
      'facial droop',
      'slurred speech',
      'cannot move arm',
      'cannot move leg',
      'numbness on one side',
      'ek taraf kamzori',
      'bolne mein dikkat',
      'एक तरफ़ कमज़ोरी',
      'बोलने में दिक्कत',
    ],
    { redFlagRelevant: true, potentiallyEmergent: true },
  ),
  symptom(
    'MK-SYM-034',
    'Seizure',
    'NEUROLOGICAL',
    ['seizure', 'convulsion', 'jhatke', 'मिर्गी का दौरा', 'फिट येणे'],
    { redFlagRelevant: true, potentiallyEmergent: true },
  ),
  symptom(
    'MK-SYM-035',
    'Visual disturbance',
    'OPHTHALMIC',
    [
      'blurred vision',
      'vision loss',
      'double vision',
      'cannot see clearly',
      'dhundhla dikhna',
      'धुंधला दिखना',
      'अंधुक दिसणे',
    ],
    { pathways: ['PATH-HEADACHE'], redFlagRelevant: true },
  ),
  symptom(
    'MK-SYM-036',
    'Confusion',
    'NEUROLOGICAL',
    ['confusion', 'confused', 'disoriented', 'not making sense', 'भ्रम', 'गोंधळ'],
    { redFlagRelevant: true, potentiallyEmergent: true },
  ),
];