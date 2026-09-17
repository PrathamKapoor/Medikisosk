/**
 * Deterministic parsing of dates, severity, negation and certainty from patient language.
 */

import type { Certainty, IsoDate } from "@medikiosk/shared-types";
import type { SeverityScale } from "./primitives";
import { RELATIVE_DATE_WORDS, WEEKDAY_WORDS } from "./normalisation-lexicon";
import {
  CONFIRMATION_WORDS,
  NEGATION_WORDS,
  PAST_MARKER_WORDS,
  PROBABILITY_WORDS,
  SEVERITY_WORDS,
  UNCERTAINTY_WORDS,
} from "./normalisation-lexicon-words";
import {
  durationInDays,
  matchesPhrase,
  parseDuration,
  tokenise,
} from "./normalisation-quantity";

function offsetDate(now: Date, dayOffset: number): IsoDate {
  const shifted = new Date(now.getTime() + dayOffset * 86_400_000);
  return shifted.toISOString().slice(0, 10) as IsoDate;
}

/**
 * Resolve a relative date reference.
 *
 * Handles explicit relative words ("yesterday", "aaj", "pichle hafte"), weekday names, and
 * duration-plus-past-marker constructions such as "3 days ago" / "teen din pehle".
 *
 * Hindi "kal" is genuinely ambiguous between yesterday and tomorrow and is resolved to the past,
 * which is both the correct default for a symptom onset and the safer reading for an intake.
 */
export function parseRelativeDate(
  text: string,
  now: Date,
): IsoDate | undefined {
  const tokens = tokenise(text);

  for (const candidate of RELATIVE_DATE_WORDS) {
    for (const word of candidate.words) {
      if (matchesPhrase(tokens, word))
        return offsetDate(now, candidate.dayOffset);
    }
  }

  for (const token of tokens) {
    const weekdayIndex = WEEKDAY_WORDS.indexOf(token);
    if (weekdayIndex === -1) continue;
    const currentIndex = now.getUTCDay();
    let delta = currentIndex - (weekdayIndex % 7);
    if (delta <= 0) delta += 7;
    return offsetDate(now, -delta);
  }

  const duration = parseDuration(text);
  if (duration && tokens.some((token) => PAST_MARKER_WORDS.includes(token))) {
    return offsetDate(now, -Math.max(1, Math.round(durationInDays(duration))));
  }

  return undefined;
}

/**
 * Severity from the patient's wording.
 *
 * Returns undefined when severity was not characterised, so the interview asks rather than recording
 * a severity that nobody stated.
 */
export function parseSeverity(text: string): SeverityScale | undefined {
  const tokens = tokenise(text);
  for (const candidate of SEVERITY_WORDS) {
    for (const word of candidate.words) {
      if (matchesPhrase(tokens, word)) return candidate.severity;
    }
  }
  return undefined;
}

export function detectNegation(text: string): boolean {
  const tokens = tokenise(text);
  return NEGATION_WORDS.some((word) => matchesPhrase(tokens, word));
}

export function detectUncertainty(text: string): boolean {
  const tokens = tokenise(text);
  return UNCERTAINTY_WORDS.some((word) => matchesPhrase(tokens, word));
}

/**
 * Certainty from the patient's own phrasing.
 *
 * `NEGATED` is a real clinical finding and is preserved as such, which is why it is a distinct value
 * rather than a boolean: every consumer is thereby forced to handle a denial explicitly instead of
 * silently treating it as "no data".
 */
export function parseCertainty(text: string): Certainty {
  if (detectNegation(text)) return "NEGATED";
  const tokens = tokenise(text);
  if (CONFIRMATION_WORDS.some((word) => matchesPhrase(tokens, word)))
    return "CONFIRMED";
  if (PROBABILITY_WORDS.some((word) => matchesPhrase(tokens, word)))
    return "PROBABLE";
  if (detectUncertainty(text)) return "SUSPECTED";
  return "UNKNOWN";
}

/**
 * Best-effort spoken-language identification from script.
 *
 * A heuristic, and recorded as one. It decides which localised wording to *offer*, never what a
 * symptom means: concept matching deliberately spans every language so that a misidentified language
 * cannot cause a clinical term to be missed.
 */
export function detectScriptLanguage(text: string): string {
  if (/[\u0B80-\u0BFF]/.test(text)) return "ta-IN";
  if (/[\u0C00-\u0C7F]/.test(text)) return "te-IN";
  if (/[\u0980-\u09FF]/.test(text)) return "bn-IN";
  if (/[\u0C80-\u0CFF]/.test(text)) return "kn-IN";
  if (/[\u0A80-\u0AFF]/.test(text)) return "gu-IN";
  if (/[\u0900-\u097F]/.test(text)) return "hi-IN";
  return "en-IN";
}

/** True when the text mixes an Indic script with Latin words: genuine code-mixing. */
export function isCodeMixed(text: string): boolean {
  const hasIndic =
    /(?:\p{Script=Devanagari}|\p{Script=Bengali}|\p{Script=Gurmukhi}|\p{Script=Gujarati}|\p{Script=Oriya}|\p{Script=Tamil}|\p{Script=Telugu}|\p{Script=Kannada})/u.test(
      text,
    );
  return hasIndic && /[a-z]{3,}/i.test(text);
}
