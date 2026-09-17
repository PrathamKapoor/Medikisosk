import { CATALOGUES } from "./catalogue";
import {
  DEFAULT_LOCALE,
  LOCALE_CODES,
  type Catalogue,
  type LocaleCode,
} from "./types";

export type TranslationKey = string;

export interface TranslateOptions {
  /**
   * When true (the default) a key that is missing from the requested locale is
   * served from the English catalogue. This keeps the kiosk usable when a
   * translation has not landed yet, at the cost of mixing languages.
   */
  fallbackToEnglish?: boolean;
  /** Diagnostics hook: called for every key served by the English fallback. */
  onMissing?: (key: string, locale: LocaleCode) => void;
}

/**
 * Missing strings are rendered between these two brackets so that an absent
 * translation is visually obvious to whoever is standing at the kiosk, instead
 * of silently rendering as a blank button the patient cannot act on.
 */
const MISSING_OPEN = "⟦";
const MISSING_CLOSE = "⟧";

const PARAM_PATTERN = /\{\{(\w+)\}\}/g;

function markers(key: string): string {
  return `${MISSING_OPEN}${key}${MISSING_CLOSE}`;
}

function rawLookup(locale: LocaleCode, key: string): string | undefined {
  const catalogue: Catalogue | undefined = CATALOGUES[locale];
  if (!catalogue) {
    return undefined;
  }
  const value = catalogue[key];
  // A blank string is treated as missing: an empty button label is worse than a
  // visible key marker because nobody notices it during review.
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function formatNumber(
  value: number,
  locale: LocaleCode,
  cache: Map<string, Intl.NumberFormat>,
): string {
  try {
    let formatter = cache.get(locale);
    if (!formatter) {
      formatter = new Intl.NumberFormat(locale);
      cache.set(locale, formatter);
    }
    return formatter.format(value);
  } catch {
    // Intl data can be unavailable in minimal ICU builds; a plain number is
    // always better than throwing in the middle of a patient interview.
    return String(value);
  }
}

function interpolate(
  template: string,
  locale: LocaleCode,
  params: Record<string, string | number> | undefined,
  cache: Map<string, Intl.NumberFormat>,
): string {
  if (!params) {
    return template;
  }
  return template.replace(
    PARAM_PATTERN,
    (match: string, name: string): string => {
      const value = params[name];
      if (value === undefined) {
        // Leave the placeholder visible rather than printing "undefined".
        return match;
      }
      return typeof value === "number"
        ? formatNumber(value, locale, cache)
        : String(value);
    },
  );
}

/**
 * Builds a translate function bound to one locale.
 *
 * Resolution order: requested locale -> English -> `⟦key⟧`.
 * Never throws: a translation failure must not be able to abort a clinical
 * interview, so every failure mode degrades to a visibly-marked key.
 */
export function createTranslator(
  locale: LocaleCode,
  options: TranslateOptions = {},
): (key: string, params?: Record<string, string | number>) => string {
  const fallbackToEnglish = options.fallbackToEnglish !== false;
  const numberCache = new Map<string, Intl.NumberFormat>();

  return (key: string, params?: Record<string, string | number>): string => {
    if (typeof key !== "string" || key.length === 0) {
      return markers(String(key));
    }
    try {
      let template = rawLookup(locale, key);

      if (
        template === undefined &&
        locale !== DEFAULT_LOCALE &&
        fallbackToEnglish
      ) {
        if (options.onMissing) {
          try {
            options.onMissing(key, locale);
          } catch {
            // A diagnostics hook must never break the translation path.
          }
        }
        template = rawLookup(DEFAULT_LOCALE, key);
      }

      if (template === undefined) {
        return markers(key);
      }
      return interpolate(template, locale, params, numberCache);
    } catch {
      return markers(key);
    }
  };
}

/** True when the locale defines a non-empty value for the key. */
export function hasKey(locale: LocaleCode, key: string): boolean {
  return rawLookup(locale, key) !== undefined;
}

function keysOf(locale: LocaleCode): string[] {
  const catalogue: Catalogue | undefined = CATALOGUES[locale];
  return catalogue ? Object.keys(catalogue) : [];
}

/**
 * Every locale except English is machine-drafted and awaits native review.
 * Duplicated here (rather than imported from types.ts) to keep this module's
 * import graph one level deep and acyclic.
 */
const PROVISIONAL_LOCALES: readonly LocaleCode[] = LOCALE_CODES.filter(
  (code): boolean => code !== DEFAULT_LOCALE,
);

/** Keys defined in English but absent (or blank) in the given locale. */
export function missingKeys(locale: LocaleCode): readonly string[] {
  const english = keysOf(DEFAULT_LOCALE);
  const missing = english.filter(
    (key): boolean => rawLookup(locale, key) === undefined,
  );
  const extras = keysOf(locale).filter(
    (key): boolean => !english.includes(key),
  );
  // Extras are appended so a single call answers "what is wrong with this
  // locale?", but they are reported by extraKeys() with a clearer name.
  return [...missing, ...extras].sort();
}

/** Keys defined in the given locale but not in English (authoring mistakes). */
export function extraKeys(locale: LocaleCode): readonly string[] {
  const english = new Set(keysOf(DEFAULT_LOCALE));
  return [...new Set(keysOf(locale))]
    .filter((key): boolean => !english.has(key))
    .sort();
}

export interface CatalogueStats {
  locale: LocaleCode;
  keyCount: number;
  missing: number;
  extra: number;
  provisional: boolean;
}

/**
 * Per-locale completeness summary, intended for CI output and for the
 * "translation pending review" banner on the kiosk.
 */
export function catalogueStats(): readonly CatalogueStats[] {
  const provisional = new Set<LocaleCode>(PROVISIONAL_LOCALES);
  return LOCALE_CODES.map((locale): CatalogueStats => ({
    locale,
    keyCount: keysOf(locale).length,
    missing: missingKeys(locale).length - extraKeys(locale).length,
    extra: extraKeys(locale).length,
    provisional: provisional.has(locale),
  }));
}

/**
 * None of the eight supported scripts are RTL. The function exists so callers
 * have a single place to ask the question once an RTL locality is added.
 */
export function isRtl(_locale: LocaleCode): false {
  return false;
}
