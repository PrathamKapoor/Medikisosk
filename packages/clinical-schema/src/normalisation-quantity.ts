/**
 * Deterministic quantity and duration parsing.
 *
 * Every parser in the normalisation family is total and side-effect free, and returns `undefined`
 * rather than guessing. That matters clinically: an invented onset duration is a fabricated clinical
 * fact, and a fabricated fact in a medical record is worse than a missing one.
 */

import type { Duration, DurationUnit } from './primitives';
import { DURATION_UNIT_WORDS, NUMBER_WORDS } from './normalisation-lexicon';
import { APPROXIMATION_WORDS } from './normalisation-lexicon-words';

/**
 * Split text into comparable tokens.
 *
 * Diacritics are stripped, and a digit adjacent to a letter is separated ("2din" becomes "2 din"),
 * which is how patients type and how recognisers often return Hindi-English code-mixing.
 */
export function tokenise(text: string): readonly string[] {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/(\d)([a-z\u0900-\u0DFF])/g, '$1 $2')
    .replace(/([a-z\u0900-\u0DFF])(\d)/g, '$1 $2')
    .split(/[^0-9a-z\u0900-\u0DFF.]+/i)
    .filter((token) => token.length > 0);
}

export function numberOf(token: string): number | undefined {
  const direct = Number.parseFloat(token);
  if (Number.isFinite(direct)) return direct;
  return NUMBER_WORDS[token];
}

/** True when a word or multi-word phrase occurs in the tokenised text. */
export function matchesPhrase(tokens: readonly string[], phrase: string): boolean {
  if (phrase.includes(' ')) return tokens.join(' ').includes(phrase);
  return tokens.includes(phrase);
}

/** Convert a duration to fractional days. Exported so trends and comparisons share one rule. */
export function durationInDays(duration: Duration): number {
  switch (duration.unit) {
    case 'MINUTES':
      return duration.value / 1440;
    case 'HOURS':
      return duration.value / 24;
    case 'DAYS':
      return duration.value;
    case 'WEEKS':
      return duration.value * 7;
    case 'MONTHS':
      return duration.value * 30.4375;
    case 'YEARS':
      return duration.value * 365.25;
  }
}

/**
 * Parse a duration such as "2 days", "do din", "teen mahine", "about a week".
 *
 * Where a unit appears without an explicit quantity ("din se"), the quantity is taken as one. That
 * is the only reading which does not invent information: it is what the patient said.
 */
export function parseDuration(text: string): Duration | undefined {
  const tokens = tokenise(text);

  for (let index = 0; index < tokens.length; index += 1) {
    const unitEntry = DURATION_UNIT_WORDS.find((candidate) =>
      candidate.words.includes(tokens[index] ?? ''),
    );
    if (!unitEntry) continue;

    let value = 1;
    let verbatimStart = index;
    for (let back = index - 1; back >= Math.max(0, index - 3); back -= 1) {
      const parsed = numberOf(tokens[back] ?? '');
      if (parsed !== undefined) {
        value = parsed;
        verbatimStart = back;
        break;
      }
    }

    const window = tokens.slice(Math.max(0, verbatimStart - 1), index + 1);
    const approximate = window.some((token) => APPROXIMATION_WORDS.includes(token));

    const unit: DurationUnit = unitEntry.unit;
    return {
      value,
      unit,
      verbatim: window.join(' '),
      approximate,
    };
  }

  return undefined;
}

/**
 * Parse a bare numeric quantity with an optional unit, used by vital and laboratory entry where the
 * unit is supplied separately by the device or the form.
 *
 * A number without a unit is returned *without* a unit, and the caller is required to supply one.
 * A quantity that silently acquires a default unit is how Fahrenheit readings become Celsius.
 */
export function parseQuantity(text: string): { readonly value: number; readonly unit?: string } | undefined {
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const value = Number.parseFloat(match[0]);
  if (!Number.isFinite(value)) return undefined;

  const after = text.slice((match.index ?? 0) + match[0].length).trim();
  const unitMatch = after.match(/^([a-zA-Z/%^0-9.]{1,16})/);
  const unit = unitMatch?.[1];
  return unit === undefined ? { value } : { value, unit };
}