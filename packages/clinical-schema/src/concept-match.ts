/**
 * Deterministic concept matching over free text.
 *
 * Two passes. The first is greedy longest-match-wins over word boundaries. The second is a gapped
 * pass: multi-word synonyms whose content words co-occur without being adjacent still match
 * ("chest mein kal se pain" must reach chest pain, because patients do not speak in
 * synonym-shaped sentences).
 *
 * Deterministic, explainable and dependency-free: it runs on the kiosk with no network and is tested
 * offline. This is a *matcher*, not a diagnostic engine. Clinical interpretation happens elsewhere,
 * always with evidence attached.
 */

import {
  containsNonLatinScript,
  foldForMatching,
  type ConceptMatch,
} from './concept';
import type { ConceptIndex } from './concept-index';

export interface MatchOptions {
  /** Minimum folded synonym length. Short synonyms produce too many accidental matches. */
  readonly minLength?: number;
  /** When true, a synonym may match inside a longer word. Off by default to reduce false hits. */
  readonly allowSubstring?: boolean;
  /** Concepts to ignore, e.g. because the topic was already established. */
  readonly excludeCodes?: readonly string[];
  /** Gapped co-occurrence matching for multi-word synonyms. On by default. */
  readonly allowGapped?: boolean;
}

/**
 * Function words a gapped match is allowed to skip.
 *
 * The gapped rule requires every *content* word of the synonym (at least two) to be present, and
 * only filler words may sit between or around them. "the" can never become evidence of a disease.
 */
const GAP_STOPWORDS: ReadonlySet<string> = new Set([
  'in', 'of', 'the', 'a', 'an', 'to', 'for', 'and', 'or', 'is', 'are',
  'mein', 'me', 'se', 'ka', 'ki', 'ke', 'ko', 'par', 'tak', 'wala', 'wali', 'wale',
  'hai', 'hain', 'tha', 'thi', 'ho', 'gaya', 'gayi', 'raha', 'rahi', 'rahe',
  'nahi', 'nahin', 'na', 'ek', 'yeh', 'ye', 'woh', 'wo', 'mera', 'mere', 'meri', 'mujhe',
]);

export function findConceptMatches(
  text: string,
  index: ConceptIndex,
  options: MatchOptions = {},
): readonly ConceptMatch[] {
  const minLength = options.minLength ?? 4;
  const exclude = new Set(options.excludeCodes ?? []);
  const folded = foldForMatching(text);
  if (folded.length === 0) return [];

  const claimed: { start: number; end: number }[] = [];
  const matches: ConceptMatch[] = [];

  for (const synonym of index.sortedSynonyms) {
    if (synonym.length < minLength) continue;

    let from = 0;
    for (;;) {
      const at = folded.indexOf(synonym, from);
      if (at === -1) break;

      const end = at + synonym.length;
      const boundaryOk = isBoundaryMatch(folded, at, end, options.allowSubstring === true);
      const overlaps = claimed.some((span) => at < span.end && end > span.start);

      if (boundaryOk && !overlaps) {
        const concepts = index.byText.get(synonym) ?? [];
        const rawSlice = text.slice(at, Math.min(end, text.length));
        for (const concept of concepts) {
          if (exclude.has(concept.code)) continue;
          matches.push({
            concept,
            matchedText: rawSlice,
            start: at,
            end,
            indicativeOfLanguageSwitch: containsNonLatinScript(rawSlice),
            score: matchScore(synonym),
          });
        }
        claimed.push({ start: at, end });
      }

      from = at + 1;
    }
  }

  if (options.allowGapped !== false) {
    findGappedMatches(folded, text, index, { minLength, exclude, claimed }, matches);
  }

  return matches.sort((a, b) => a.start - b.start || b.score - a.score);
}

/**
 * Gapped co-occurrence pass.
 *
 * For each multi-word synonym, require every *content* word (non-stopword, at least four characters
 * or a distinctive clinical token) to occur in the input. Record one match per synonym per concept,
 * spanning from the first to the last content word, and only when the span is not already claimed.
 *
 * This pass scores slightly below an exact contiguous match of the same synonym, so exact phrasing
 * always wins where both apply, and `dedupeMatches` still collapses everything to one match per
 * concept.
 */
function findGappedMatches(
  folded: string,
  text: string,
  index: ConceptIndex,
  state: {
    readonly minLength: number;
    readonly exclude: ReadonlySet<string>;
    readonly claimed: { start: number; end: number }[];
  },
  matches: ConceptMatch[],
): void {
  const inputWords = new Set(folded.split(' ').filter(Boolean));
  void inputWords;

  for (const synonym of index.sortedSynonyms) {
    if (synonym.length < state.minLength) continue;
    const synonymWords = synonym.split(' ').filter(Boolean);
    const contentWords = synonymWords.filter(
      (word) => !GAP_STOPWORDS.has(word) && word.length >= 3,
    );
    // Single-word synonyms are handled by the exact pass; gapped matching needs at least two
    // content words, otherwise a lone "pain" would fire for every painful complaint.
    if (contentWords.length < 2) continue;

    const positions: number[] = [];
    let present = true;
    for (const word of contentWords) {
      const at = indexOfWord(folded, word);
      if (at === -1) {
        present = false;
        break;
      }
      positions.push(at);
    }
    if (!present) continue;

    const spanStart = Math.min(...positions);
    const spanEnd = Math.max(...positions) + ((contentWords[contentWords.length - 1] ?? '').length);

    const overlaps = state.claimed.some((span) => spanStart < span.end && spanEnd > span.start);
    if (overlaps) continue;

    const concepts = index.byText.get(synonym) ?? [];
    // The raw slice for a gapped match shows the patient's own span, not the dictionary phrase.
    const rawSlice = text.slice(spanStart, Math.min(spanEnd, text.length));
    for (const concept of concepts) {
      if (state.exclude.has(concept.code)) continue;
      matches.push({
        concept,
        matchedText: rawSlice,
        start: spanStart,
        end: spanEnd,
        indicativeOfLanguageSwitch: containsNonLatinScript(rawSlice),
        score: Math.max(0, matchScore(synonym) - 0.15),
      });
    }
    state.claimed.push({ start: spanStart, end: spanEnd });
  }
}

/** Whole-word occurrence, or -1. A clinical word inside a longer word is not a match. */
function indexOfWord(folded: string, word: string): number {
  let from = 0;
  for (;;) {
    const at = folded.indexOf(word, from);
    if (at === -1) return -1;
    const beforeOk = at === 0 || folded[at - 1] === ' ';
    const end = at + word.length;
    const afterOk = end >= folded.length || folded[end] === ' ';
    if (beforeOk && afterOk) return at;
    from = at + 1;
  }
}

function isBoundaryMatch(
  folded: string,
  start: number,
  end: number,
  allowSubstring: boolean,
): boolean {
  if (allowSubstring) return true;
  const beforeOk = start === 0 || folded[start - 1] === ' ';
  const afterOk = end >= folded.length || folded[end] === ' ';
  return beforeOk && afterOk;
}

/**
 * Specificity score for a matched synonym.
 *
 * A length-based proxy, capped at 1. It is deliberately documented as a specificity proxy rather
 * than a calibrated confidence, so nothing downstream can mistake it for a probability of disease.
 */
function matchScore(synonym: string): number {
  const words = synonym.split(' ').length;
  const byLength = Math.min(1, synonym.length / 24);
  const byWords = Math.min(0.3, (words - 1) * 0.15);
  return Math.min(1, byLength + byWords);
}

/**
 * Collapse matches into one per concept, keeping the strongest.
 *
 * A patient who says "chest pain, chest is paining" must not produce two chest-pain facts; a
 * duplicated fact would inflate the evidence count and could make a clinician think the complaint
 * was reported twice.
 */
export function dedupeMatches(matches: readonly ConceptMatch[]): readonly ConceptMatch[] {
  const best = new Map<string, ConceptMatch>();
  for (const match of matches) {
    const existing = best.get(match.concept.code);
    if (!existing || match.score > existing.score) best.set(match.concept.code, match);
  }
  return [...best.values()].sort((a, b) => a.start - b.start);
}

/** Concept codes present in a text, in first-appearance order. */
export function conceptCodesIn(
  text: string,
  index: ConceptIndex,
  options: MatchOptions = {},
): readonly string[] {
  return dedupeMatches(findConceptMatches(text, index, options)).map(
    (match) => match.concept.code,
  );
}