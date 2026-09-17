import type { Catalogue, LocaleCode } from "./types";
import { LOCALE_CODES } from "./types";
import { REGISTRATION_CATALOGUES } from "./registration";
import { INTERVIEW_CATALOGUES } from "./interview";

import { enIN } from "./locales/en-IN";
import { hiIN } from "./locales/hi-IN";
import { mrIN } from "./locales/mr-IN";
import { guIN } from "./locales/gu-IN";
import { taIN } from "./locales/ta-IN";
import { teIN } from "./locales/te-IN";
import { bnIN } from "./locales/bn-IN";
import { knIN } from "./locales/kn-IN";

/**
 * The complete set of catalogues keyed by locale.
 *
 * Typed as `Record<LocaleCode, Catalogue>` on purpose: adding a locale to
 * LOCALE_CODES without adding its catalogue becomes a compile error rather
 * than a silent runtime fallback to English at the bedside.
 */
export const CATALOGUES: Record<LocaleCode, Catalogue> = {
  "en-IN": {
    ...enIN,
    ...REGISTRATION_CATALOGUES["en-IN"],
    ...INTERVIEW_CATALOGUES["en-IN"],
  },
  "hi-IN": {
    ...hiIN,
    ...REGISTRATION_CATALOGUES["hi-IN"],
    ...INTERVIEW_CATALOGUES["hi-IN"],
  },
  "mr-IN": {
    ...mrIN,
    ...REGISTRATION_CATALOGUES["mr-IN"],
    ...INTERVIEW_CATALOGUES["mr-IN"],
  },
  "gu-IN": guIN,
  "ta-IN": taIN,
  "te-IN": teIN,
  "bn-IN": bnIN,
  "kn-IN": knIN,
};

/** Alias kept for call sites that talk about "supported" rather than "codes". */
export const SUPPORTED_LOCALES = LOCALE_CODES;
