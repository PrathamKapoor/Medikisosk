/**
 * Lexicon part 1: quantities, durations and date references.
 *
 * Patients do not speak structured clinical English. In an Indian OPD one utterance may carry three
 * languages and an implicit date:
 *
 *     "mere chest mein kal se pain hai, bahut zyada"
 *
 * These tables are data rather than conditions inside parsing code on purpose: adding a regional word
 * that patients actually use becomes a reviewable data change instead of a logic change.
 *
 * Indian-language forms are curated clinical content, not machine translation.
 */

import type { DurationUnit } from './primitives';

/** Number words, including the fractional quantities patients use ("dedh", "aadha"). */
export const NUMBER_WORDS: Readonly<Record<string, number>> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  half: 0.5, couple: 2, few: 3, several: 4,
  ek: 1, do: 2, teen: 3, char: 4, paanch: 5, panch: 5, chhe: 6, cheh: 6,
  saat: 7, aath: 8, nau: 9, das: 10,
  aadha: 0.5, adha: 0.5, aadhi: 0.5, dedh: 1.5, dhai: 2.5, savaa: 1.25,
  don: 2, tin: 3,
  'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'सात': 7, 'आठ': 8, 'दस': 10,
  'आधा': 0.5, 'डेढ़': 1.5, 'ढाई': 2.5,
  'दोन': 2,
  'બે': 2, 'ત્રણ': 3, 'એક': 1,
};

/** Duration units, including transliterated Indian-language forms. */
export const DURATION_UNIT_WORDS: readonly {
  readonly words: readonly string[];
  readonly unit: DurationUnit;
}[] = [
  { words: ['minute', 'minutes', 'min', 'mins', 'minit', 'मिनट'], unit: 'MINUTES' },
  {
    words: ['hour', 'hours', 'hr', 'hrs', 'ghanta', 'ghante', 'taas', 'घंटा', 'घंटे', 'तास', 'કલાક'],
    unit: 'HOURS',
  },
  { words: ['day', 'days', 'din', 'दिन', 'दिवस', 'நாள்'], unit: 'DAYS' },
  { words: ['week', 'weeks', 'wk', 'hafta', 'hafte', 'हफ्ता', 'हफ्ते', 'सप्ताह', 'आठवडा'], unit: 'WEEKS' },
  {
    words: ['month', 'months', 'mahina', 'mahine', 'maheena', 'महीना', 'महीने', 'મહિનો', 'மாதம்'],
    unit: 'MONTHS',
  },
  {
    words: ['year', 'years', 'yr', 'yrs', 'saal', 'sal', 'varsh', 'साल', 'वर्ष', 'वर्षे', 'વરસ', 'ஆண்டு'],
    unit: 'YEARS',
  },
];

/**
 * Relative date expressions with their offset in days from today.
 *
 * Recurring weekday expressions resolve to the most recent *past* occurrence, because a patient
 * reporting an onset does not mean a future date.
 */
export const RELATIVE_DATE_WORDS: readonly {
  readonly words: readonly string[];
  readonly dayOffset: number;
}[] = [
  { words: ['today', 'aaj', 'आज'], dayOffset: 0 },
  { words: ['yesterday', 'kal', 'कल'], dayOffset: -1 },
  { words: ['day before yesterday', 'parso', 'parson', 'परसों'], dayOffset: -2 },
  { words: ['last night', 'kal raat', 'कल रात'], dayOffset: -1 },
  { words: ['this morning', 'aaj subah', 'आज सुबह'], dayOffset: 0 },
  { words: ['last week', 'pichle hafte', 'पिछले हफ्ते'], dayOffset: -7 },
  { words: ['last month', 'pichle mahine', 'पिछले महीने'], dayOffset: -30 },
  { words: ['last year', 'pichle saal', 'पिछले साल'], dayOffset: -365 },
];

/**
 * Weekday names, for "since Monday" answers.
 *
 * Hindi "kal" is genuinely ambiguous between yesterday and tomorrow. It is resolved to the past in
 * RELATIVE_DATE_WORDS, which is both the correct default for an onset date and the safer reading.
 */
export const WEEKDAY_WORDS: readonly string[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
  'ravivar', 'somvar', 'mangalvar', 'budhvar', 'guruvar', 'shukravar', 'shanivar',
  'रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार',
];