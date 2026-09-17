import { CATALOGUES } from "./catalogue";
import { missingKeys } from "./translate";
import {
  DEFAULT_LOCALE,
  LOCALE_CODES,
  PROVISIONAL_LOCALES,
  type Catalogue,
  type LocaleCode,
} from "./types";
import { isRegistrationLocale } from "./registration";

export interface VerifyResult {
  ok: boolean;
  report: readonly string[];
}

/**
 * Keys where an identical English value is almost certainly a translation that
 * was never done. Deliberately a *sample* rather than the whole catalogue:
 * some strings are legitimately identical across languages (drug names, the
 * acronym "SOCRATES", "OTP"), and flagging those would train reviewers to
 * ignore the warning.
 */
const HIGH_VISIBILITY_KEYS: readonly string[] = [
  "common.continue",
  "common.back",
  "common.yes",
  "common.no",
  "kiosk.welcome.title",
  "kiosk.language.title",
  "kiosk.listening",
  "consent.title",
  "consent.accept_all",
  "severity.mild",
  "severity.severe",
  "triage.red.heading",
  "triage.go_to_counter",
  "document.type.prescription",
  "auth.login.title",
  "error.try_again",
  "q.chest_pain.character",
  "q.chest_pain.relief",
];

const CHEST_PAIN_PREFIX = "q.chest_pain.";

function lookup(locale: LocaleCode, key: string): string | undefined {
  const catalogue: Catalogue | undefined = CATALOGUES[locale];
  if (!catalogue) {
    return undefined;
  }
  const value = catalogue[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Full integrity check across every catalogue.
 *
 * HARD failures (make `ok` false) — these would break the kiosk or, worse, let
 * an unreviewed blank reach a patient:
 *   - a locale missing a key that English defines
 *   - an empty or non-string value
 *   - a chest-pain pathway key missing (the demo-critical pathway)
 *
 * SOFT failures (reported, do not flip `ok`) — these need a human judgement
 * call and must not block a build:
 *   - a high-visibility value identical to English, i.e. probably untranslated
 */
export function verifyAllLocales(): VerifyResult {
  const report: string[] = [];
  let ok = true;

  const fail = (message: string): void => {
    ok = false;
    report.push(`[FAIL] ${message}`);
  };

  const englishKeys = Object.keys(CATALOGUES[DEFAULT_LOCALE] ?? {});

  report.push(
    `[INFO] catalogue checking ${LOCALE_CODES.length} locales against ${englishKeys.length} English keys`,
  );

  for (const locale of LOCALE_CODES) {
    const catalogue: Catalogue | undefined = CATALOGUES[locale];
    if (!catalogue) {
      fail(`locale ${locale} has no catalogue registered`);
      continue;
    }

    const provisional = PROVISIONAL_LOCALES.includes(locale);
    const keys = Object.keys(catalogue);

    // --- hard check: completeness against English -------------------------
    // Registration/interview are intentionally unavailable without a full
    // consent-language flow, so their keys are optional for locales that only
    // carry the base (browseable) catalogue.
    const missing = missingKeys(locale).filter(
      (key) =>
        isRegistrationLocale(locale) ||
        (!key.startsWith("registration.") && !key.startsWith("interview.")),
    );
    if (missing.length > 0) {
      fail(
        `locale ${locale} is missing ${missing.length} key(s): ${missing.join(", ")}`,
      );
    }

    // --- hard check: value shape ------------------------------------------
    const invalid: string[] = [];
    for (const key of keys) {
      const value = catalogue[key];
      if (typeof value !== "string") {
        invalid.push(`${key} (not a string)`);
      } else if (value.length === 0) {
        invalid.push(`${key} (empty)`);
      } else if (value.trim().length === 0) {
        invalid.push(`${key} (whitespace only)`);
      }
    }
    if (invalid.length > 0) {
      fail(
        `locale ${locale} has ${invalid.length} invalid value(s): ${invalid.join(", ")}`,
      );
    }

    // --- hard check: demo-critical chest-pain pathway ---------------------
    const chestPainKeys = englishKeys.filter((key): boolean =>
      key.startsWith(CHEST_PAIN_PREFIX),
    );
    const chestPainMissing = chestPainKeys.filter(
      (key): boolean => lookup(locale, key) === undefined,
    );
    if (chestPainMissing.length > 0) {
      fail(
        `locale ${locale} is missing ${chestPainMissing.length} chest-pain pathway key(s): ${chestPainMissing.join(", ")}`,
      );
    } else {
      report.push(
        `[PASS] ${locale}: all ${chestPainKeys.length} chest-pain pathway keys present`,
      );
    }

    // --- soft check: probably-untranslated high-visibility strings --------
    if (locale !== DEFAULT_LOCALE) {
      const untranslated: string[] = [];
      for (const key of HIGH_VISIBILITY_KEYS) {
        const own = lookup(locale, key);
        const english = lookup(DEFAULT_LOCALE, key);
        if (own !== undefined && english !== undefined && own === english) {
          untranslated.push(key);
        }
      }
      if (untranslated.length > 0) {
        report.push(
          `[WARN] ${locale}: ${untranslated.length} high-visibility key(s) are identical to English and may be untranslated: ${untranslated.join(", ")}`,
        );
      }
    }

    report.push(
      `[INFO] ${locale}: ${keys.length} keys, missing ${missing.length}, provisional ${provisional ? "yes" : "no"}`,
    );
  }

  report.push(
    ok
      ? "[PASS] all locales verified (non-English catalogues remain PROVISIONAL pending native clinical review)"
      : "[FAIL] verification failed",
  );

  return { ok, report };
}
