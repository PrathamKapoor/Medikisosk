/**
 * Lexicon part 2: severity, negation, uncertainty and time markers.
 *
 * These are the words that change the *meaning* of an answer rather than its quantity, so they are
 * separated from the quantity tables. A reviewer checking a safety-relevant behaviour has to read
 * exactly these lists.
 */

import type { SeverityScale } from "./primitives";

/**
 * Severity expressions, most specific first.
 *
 * Order matters: "bahut bahut zyada" must be tested before "bahut zyada", otherwise a very severe
 * report is silently downgraded by the shorter match.
 */
export const SEVERITY_WORDS: readonly {
  readonly words: readonly string[];
  readonly severity: SeverityScale;
}[] = [
  {
    words: [
      "unbearable",
      "worst ever",
      "as bad as it could be",
      "bahut bahut zyada",
      "असहनीय",
    ],
    severity: "VERY_SEVERE",
  },
  {
    words: [
      "very severe",
      "extremely severe",
      "bahut zyada",
      "bahut tez",
      "बहुत ज़्यादा",
      "बहुत तेज़",
      "प्रचंड",
    ],
    severity: "VERY_SEVERE",
  },
  {
    words: ["severe", "intense", "tez", "teevr", "तेज़", "तीव्र", "गंभीर"],
    severity: "SEVERE",
  },
  { words: ["moderate", "medium", "madhyam", "मध्यम"], severity: "MODERATE" },
  {
    words: [
      "mild",
      "slight",
      "a little",
      "little",
      "thoda",
      "thodi",
      "हल्का",
      "थोड़ा",
    ],
    severity: "MILD",
  },
  {
    words: ["no pain", "no problem", "nothing at all", "दर्द नहीं", "कुछ नहीं"],
    severity: "NONE",
  },
];

/**
 * Negation words.
 *
 * A negation is itself a clinical finding — "no fever" is information — so it is detected and
 * preserved rather than used to discard the answer.
 */
export const NEGATION_WORDS: readonly string[] = [
  "no",
  "not",
  "none",
  "never",
  "without",
  "denies",
  "absent",
  "nil",
  "nahi",
  "nahin",
  "bilkul nahi",
  "koi nahi",
  "नहीं",
  "नही",
  "बिल्कुल नहीं",
  "नाही",
  "નથી",
  "ના",
  "இல்லை",
  "లేదు",
  "নেই",
];

/** Uncertainty markers. These lower confidence rather than changing the finding. */
export const UNCERTAINTY_WORDS: readonly string[] = [
  "maybe",
  "perhaps",
  "not sure",
  "unsure",
  "i think",
  "possibly",
  "sometimes",
  "dont know",
  "don't know",
  "no idea",
  "shayad",
  "pata nahi",
  "malum nahi",
  "lagta hai",
  "शायद",
  "पता नहीं",
  "लगता है",
  "माहीत नाही",
  "தெரியவில்லை",
  "తెలియదు",
  "জানি না",
];

/** Words marking a duration as approximate, so an imprecise report is not over-read. */
export const APPROXIMATION_WORDS: readonly string[] = [
  "about",
  "around",
  "approximately",
  "almost",
  "roughly",
  "nearly",
  "lagbhag",
  "takriban",
  "करीब",
  "लगभग",
];

/** Words placing an event in the past, combined with a duration ("3 days ago"). */
export const PAST_MARKER_WORDS: readonly string[] = [
  "ago",
  "pehle",
  "pahle",
  "before",
  "back",
  "पहले",
  "पूर्वी",
  "પહેલા",
];

/** Words indicating a confirmed, established diagnosis rather than a suspicion. */
export const CONFIRMATION_WORDS: readonly string[] = [
  "confirmed",
  "diagnosed",
  "definitely",
  "certainly",
  "pakka",
  "निश्चित",
  "निश्चितपणे",
];

/** Words indicating a likely but unconfirmed condition. */
export const PROBABILITY_WORDS: readonly string[] = [
  "probably",
  "likely",
  "most likely",
  "संभवतः",
  "बहुधा",
];
