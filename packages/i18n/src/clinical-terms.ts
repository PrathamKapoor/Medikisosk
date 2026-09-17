import { DEFAULT_LOCALE, type LocaleCode } from './types';

/**
 * Controlled clinical terminology.
 *
 * REVIEW STATUS - READ BEFORE CLINICAL USE
 * ----------------------------------------
 * The non-English strings in this file are MACHINE-DRAFTED. Every term that
 * carries a non-English translation is therefore marked `PROVISIONAL`, and a
 * term only becomes `CURATED` once a clinician who is a fluent native speaker
 * of that language has reviewed it against the English source concept and
 * signed off (`reviewedBy`). Nothing in this file is claimed to be clinically
 * validated: clinical terminology requires review by a clinician fluent in that
 * language before clinical use.
 *
 * WHY a separate module from the UI catalogues: UI strings (buttons, prompts)
 * can be roughly paraphrased without harming anyone. Terminology attached to a
 * coded concept - a symptom, a vital sign, a lab analyte - must stay stable
 * across sites and visits, because it is what gets written into the record and
 * compared against previous encounters. Keeping the two apart stops a UI copy
 * tweak from silently changing a clinical concept label.
 *
 * `conceptCode` is the MediKiosk concept identifier. It is deliberately not
 * derived from the English label so that relabelling English (for example
 * "chest pain" -> "chest discomfort") does not re-identify the concept.
 */
export type ClinicalTermReviewStatus = 'CURATED' | 'PROVISIONAL' | 'UNREVIEWED';

export interface ClinicalTerm {
  /** Stable internal key, e.g. `chest_pain`. Never localised. */
  key: string;
  /** Concept identifier used by the clinical schema, e.g. `MK-SYM-001`. */
  conceptCode: string;
  /** Authoritative English label (the source of truth for translation). */
  english: string;
  /** Translated labels. A locale may legitimately be absent (untranslated). */
  translations: Partial<Record<LocaleCode, string>>;
  /** Review state of the term as a whole; see the file header. */
  reviewStatus: ClinicalTermReviewStatus;
  /** Name/role of the reviewing clinician, once review has happened. */
  reviewedBy?: string;
}

export const CLINICAL_TERMS: readonly ClinicalTerm[] = [
  {
    key: 'chest_pain',
    conceptCode: 'MK-SYM-001',
    english: 'Chest pain',
    reviewStatus: 'PROVISIONAL',
    translations: {
      'hi-IN': 'सीने में दर्द',
      'mr-IN': 'छातीत दुखणे',
      'gu-IN': 'છાતીમાં દુખાવો',
      'ta-IN': 'மார்பு வலி',
      'te-IN': 'ఛాతీ నొప్పి',
      'bn-IN': 'বুকে ব্যথা',
      'kn-IN': 'ಎದೆ ನೋವು',
    },
  },
  {
    key: 'shortness_of_breath',
    conceptCode: 'MK-SYM-002',
    english: 'Shortness of breath',
    reviewStatus: 'PROVISIONAL',
    translations: {
      'hi-IN': 'साँस फूलना',
      'mr-IN': 'श्वास लागणे',
      'gu-IN': 'શ્વાસ ચઢવો',
      'ta-IN': 'மூச்சுத் திணறல்',
      'te-IN': 'ఆయాసం',
      'bn-IN': 'শ্বাসকষ্ট',
      'kn-IN': 'ಉಸಿರಾಟದ ತೊಂದರೆ',
    },
  },
  {
    key: 'fever',
    conceptCode: 'MK-SYM-020',
    english: 'Fever',
    reviewStatus: 'PROVISIONAL',
    translations: {
      'hi-IN': 'बुखार',
      'mr-IN': 'ताप',
      'gu-IN': 'તાવ',
      'ta-IN': 'காய்ச்சல்',
      'te-IN': 'జ్వరం',
      'bn-IN': 'জ্বর',
      'kn-IN': 'ಜ್ವರ',
    },
  },
  {
    key: 'cough',
    conceptCode: 'MK-SYM-007',
    english: 'Cough',
    reviewStatus: 'PROVISIONAL',
    translations: {
      'hi-IN': 'खाँसी',
      'mr-IN': 'खोकला',
      'gu-IN': 'ઉધરસ',
      'ta-IN': 'இருமல்',
      'te-IN': 'దగ్గు',
      'bn-IN': 'কাশি',
      'kn-IN': 'ಕೆಮ್ಮು',
    },
  },
  {
    key: 'headache',
    conceptCode: 'MK-SYM-030',
    english: 'Headache',
    reviewStatus: 'PROVISIONAL',
    translations: {
      'hi-IN': 'सिरदर्द',
      'mr-IN': 'डोकेदुखी',
      'gu-IN': 'માથાનો દુખાવો',
      'ta-IN': 'தலைவலி',
      'te-IN': 'తలనొప్పి',
      'bn-IN': 'মাথাব্যথা',
      'kn-IN': 'ತಲೆನೋವು',
    },
  },
  {
    key: 'abdominal_pain',
    conceptCode: 'MK-SYM-040',
    english: 'Abdominal pain',
    reviewStatus: 'PROVISIONAL',
    translations: {
      'hi-IN': 'पेट दर्द',
      'mr-IN': 'पोटदुखी',
      'gu-IN': 'પેટમાં દુખાવો',
      'ta-IN': 'வயிற்று வலி',
      'te-IN': 'కడుపు నొప్పి',
      'bn-IN': 'পেটে ব্যথা',
      'kn-IN': 'ಹೊಟ್ಟೆ ನೋವು',
    },
  },
  {
    key: 'blood_pressure',
    conceptCode: 'MK-VIT-001',
    english: 'Blood pressure',
    reviewStatus: 'PROVISIONAL',
    translations: {
      'hi-IN': 'रक्तचाप',
      'mr-IN': 'रक्तदाब',
      'gu-IN': 'રક્તદબાણ',
      'ta-IN': 'இரத்த அழுத்தம்',
      'te-IN': 'రక్తపోటు',
      'bn-IN': 'রক্তচাপ',
      'kn-IN': 'ರಕ್ತದೊತ್ತಡ',
    },
  },
  {
    key: 'pulse',
    conceptCode: 'MK-VIT-002',
    english: 'Pulse',
    reviewStatus: 'PROVISIONAL',
    translations: {
      'hi-IN': 'नाड़ी',
      'mr-IN': 'नाडी',
      'gu-IN': 'નાડી',
      'ta-IN': 'நாடித்துடிப்பு',
      'te-IN': 'నాడి',
      'bn-IN': 'নাড়ি',
      'kn-IN': 'ನಾಡಿ',
    },
  },
  {
    key: 'temperature',
    conceptCode: 'MK-VIT-003',
    english: 'Temperature',
    reviewStatus: 'PROVISIONAL',
    translations: {
      'hi-IN': 'तापमान',
      'mr-IN': 'तापमान',
      'gu-IN': 'તાપમાન',
      'ta-IN': 'வெப்பநிலை',
      'te-IN': 'ఉష్ణోగ్రత',
      'bn-IN': 'তাপমাত্রা',
      'kn-IN': 'ತಾಪಮಾನ',
    },
  },
  {
    key: 'oxygen_saturation',
    conceptCode: 'MK-VIT-004',
    english: 'Oxygen saturation',
    reviewStatus: 'PROVISIONAL',
    translations: {
      'hi-IN': 'ऑक्सीजन संतृप्ति',
      'mr-IN': 'ऑक्सिजन संपृक्तता',
      'gu-IN': 'ઓક્સિજન સંતૃપ્તિ',
      'ta-IN': 'ஆக்சிஜன் செறிவு',
      'te-IN': 'ఆక్సిజన్ సంతృప్తత',
      'bn-IN': 'অক্সিজেন সম্পৃক্তি',
      'kn-IN': 'ಆಮ್ಲಜನಕ ಸ್ಯಾಚುರೇಶನ್',
    },
  },
  {
    key: 'haemoglobin',
    conceptCode: 'MK-LAB-001',
    english: 'Haemoglobin',
    reviewStatus: 'PROVISIONAL',
    translations: {
      'hi-IN': 'हीमोग्लोबिन',
      'mr-IN': 'हिमोग्लोबिन',
      'gu-IN': 'હિમોગ્લોબિન',
      'ta-IN': 'ஹீமோகுளோபின்',
      'te-IN': 'హిమోగ్లోబిన్',
      'bn-IN': 'হিমোগ্লোবিন',
      'kn-IN': 'ಹಿಮೋಗ್ಲೋಬಿನ್',
    },
  },
  {
    key: 'fasting_glucose',
    conceptCode: 'MK-LAB-002',
    english: 'Fasting glucose',
    reviewStatus: 'PROVISIONAL',
    translations: {
      'hi-IN': 'उपवास ग्लूकोज़',
      'mr-IN': 'उपाशी ग्लुकोज',
      'gu-IN': 'ઉપવાસ ગ્લુકોઝ',
      'ta-IN': 'வெறும் வயிற்று குளுக்கோஸ்',
      'te-IN': 'ఉపవాస గ్లూకోజ్',
      'bn-IN': 'উপবাস গ্লুকোজ',
      'kn-IN': 'ಉಪವಾಸ ಗ್ಲೂಕೋಸ್',
    },
  },
];

const BY_CODE = new Map<string, ClinicalTerm>(
  CLINICAL_TERMS.map((term): [string, ClinicalTerm] => [term.conceptCode, term]),
);

const BY_KEY = new Map<string, ClinicalTerm>(
  CLINICAL_TERMS.map((term): [string, ClinicalTerm] => [term.key, term]),
);

/** Looks a term up by concept code, then, failing that, by internal key. */
export function clinicalTermFor(conceptCode: string): ClinicalTerm | undefined {
  return BY_CODE.get(conceptCode) ?? BY_KEY.get(conceptCode);
}

/**
 * Label for a concept in one locale.
 *
 * Falls back to the English source label (never to an empty string and never to
 * a guess) so a clinician always sees something recognisable rather than an
 * unexplained code on the chart.
 */
export function clinicalTermLabel(
  conceptCode: string,
  locale: LocaleCode,
  fallbackEnglish = true,
): string {
  const term = clinicalTermFor(conceptCode);
  if (!term) {
    return conceptCode;
  }
  const translated = term.translations[locale];
  if (typeof translated === 'string' && translated.length > 0) {
    return translated;
  }
  return fallbackEnglish ? term.english : conceptCode;
}

/** True when the requested locale has its own (still provisional) label. */
export function hasClinicalTranslation(conceptCode: string, locale: LocaleCode): boolean {
  if (locale === DEFAULT_LOCALE) {
    return clinicalTermFor(conceptCode) !== undefined;
  }
  const term = clinicalTermFor(conceptCode);
  return typeof term?.translations[locale] === 'string';
}