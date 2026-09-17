/**
 * Core locale identity and metadata for the MediKiosk clinical-intake kiosk.
 *
 * WHY BCP-47 tags (`en-IN`) instead of bare language codes (`en`):
 * Indian clinical deployments are region-specific (numbering, date order, drug
 * naming conventions differ by region), so the region subtag is carried from the
 * start. Adding a region later would be a breaking change for persisted consent
 * records that store the locale the patient actually read.
 */

export const LOCALE_CODES = [
  'en-IN',
  'hi-IN',
  'mr-IN',
  'gu-IN',
  'ta-IN',
  'te-IN',
  'bn-IN',
  'kn-IN',
] as const;

export type LocaleCode = (typeof LOCALE_CODES)[number];

/**
 * English (India) is the reference locale: it is the language the clinical
 * content was authored in, and it is the fallback for every other locale.
 */
export const DEFAULT_LOCALE: LocaleCode = 'en-IN';

export type Script =
  | 'LATIN'
  | 'DEVANAGARI'
  | 'GUJARATI'
  | 'TAMIL'
  | 'TELUGU'
  | 'BENGALI'
  | 'KANNADA';

export interface LocaleMeta {
  code: LocaleCode;
  englishName: string;
  nativeName: string;
  script: Script;
  /**
   * Typed as the literal `false` rather than `boolean`: none of the supported
   * scripts are RTL, and encoding that in the type means downstream layout code
   * cannot accidentally branch on a value that can never be true here.
   */
  rtl: false;
}

export const LOCALE_META: Record<LocaleCode, LocaleMeta> = {
  'en-IN': {
    code: 'en-IN',
    englishName: 'English (India)',
    nativeName: 'English',
    script: 'LATIN',
    rtl: false,
  },
  'hi-IN': {
    code: 'hi-IN',
    englishName: 'Hindi',
    nativeName: 'हिन्दी',
    script: 'DEVANAGARI',
    rtl: false,
  },
  'mr-IN': {
    code: 'mr-IN',
    englishName: 'Marathi',
    nativeName: 'मराठी',
    script: 'DEVANAGARI',
    rtl: false,
  },
  'gu-IN': {
    code: 'gu-IN',
    englishName: 'Gujarati',
    nativeName: 'ગુરાતી',
    script: 'GUJARATI',
    rtl: false,
  },
  'ta-IN': {
    code: 'ta-IN',
    englishName: 'Tamil',
    nativeName: 'தமிழ்',
    script: 'TAMIL',
    rtl: false,
  },
  'te-IN': {
    code: 'te-IN',
    englishName: 'Telugu',
    nativeName: 'తెలుగు',
    script: 'TELUGU',
    rtl: false,
  },
  'bn-IN': {
    code: 'bn-IN',
    englishName: 'Bengali',
    nativeName: 'বাংলা',
    script: 'BENGALI',
    rtl: false,
  },
  'kn-IN': {
    code: 'kn-IN',
    englishName: 'Kannada',
    nativeName: 'ಕನ್ನಡ',
    script: 'KANNADA',
    rtl: false,
  },
};

/**
 * Flat key/value bag using dot-path keys (for example `kiosk.consent.title`).
 *
 * WHY a flat map: keys are authored and read by humans in clinical review
 * spreadsheets, and a flat map makes "which keys are missing in the Marathi
 * catalogue?" a trivial set difference instead of a recursive walk.
 */
export type Catalogue = { [key: string]: string };

/**
 * Every locale other than English is a machine-drafted translation awaiting
 * review by a clinician who is a native speaker of that language.
 *
 * WHY this is exported as data rather than left to documentation: the kiosk UI
 * must render an honest "translation pending review" notice, and the safest way
 * to guarantee that is to make the UI read the fact from the same source of
 * truth the catalogues come from. Clinical wording that has not been reviewed
 * must never be presented as if it had been.
 */
export const PROVISIONAL_LOCALES: readonly LocaleCode[] = LOCALE_CODES.filter(
  (code): boolean => code !== DEFAULT_LOCALE,
);

/** Version of the catalogue content, bumped whenever any value changes. */
export const CATALOGUE_VERSION = '1.0.0';

/**
 * Hard flag consumed by the UI/boot code: while true, non-English catalogues
 * may be shown with a review notice but must not be treated as clinically
 * validated wording.
 */
export const CATALOGUE_REQUIRES_CLINICAL_REVIEW = true;