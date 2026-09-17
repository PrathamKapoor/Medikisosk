/**
 * Index over the clinical concept vocabulary.
 *
 * Built once at start-up. A duplicate concept code is a hard failure rather than a warning: two
 * concepts sharing a code would make evidence ambiguous, and evidence ambiguity is exactly what the
 * provenance layer exists to prevent.
 */

import { foldForMatching, type ClinicalConcept } from './concept';

export interface ConceptIndex {
  /** Folded synonym to the concepts it maps to. */
  readonly byText: ReadonlyMap<string, readonly ClinicalConcept[]>;
  readonly byCode: ReadonlyMap<string, ClinicalConcept>;
  /** All synonyms sorted by descending length, so multi-word terms win over their substrings. */
  readonly sortedSynonyms: readonly string[];
}

export function buildConceptIndex(concepts: readonly ClinicalConcept[]): ConceptIndex {
  const byText = new Map<string, ClinicalConcept[]>();
  const byCode = new Map<string, ClinicalConcept>();

  for (const concept of concepts) {
    if (byCode.has(concept.code)) {
      throw new Error(`Duplicate clinical concept code: ${concept.code}`);
    }
    byCode.set(concept.code, concept);

    for (const term of [concept.display, ...concept.synonyms]) {
      const folded = foldForMatching(term);
      if (folded.length === 0) continue;
      const existing = byText.get(folded);
      if (existing) {
        if (!existing.some((item) => item.code === concept.code)) existing.push(concept);
      } else {
        byText.set(folded, [concept]);
      }
    }
  }

  const sortedSynonyms = [...byText.keys()].sort((a, b) => b.length - a.length);
  return { byText, byCode, sortedSynonyms };
}

/** Look a concept up by exact code. */
export function conceptByCode(index: ConceptIndex, code: string): ClinicalConcept | undefined {
  return index.byCode.get(code);
}

/** All concepts in a category, in stable code order. */
export function conceptsInCategory(
  index: ConceptIndex,
  category: ClinicalConcept['category'],
): readonly ClinicalConcept[] {
  return [...index.byCode.values()]
    .filter((concept) => concept.category === category)
    .sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Report the concepts that are referenced by a red-flag rule set but not present in the ontology.
 *
 * A rule that watches for a concept the ontology cannot produce would silently never fire. That is
 * the most dangerous possible failure in a safety system, so the mismatch is surfaced at start-up
 * rather than discovered during an incident.
 */
export function findOrphanRedFlagConcepts(
  index: ConceptIndex,
  referencedCodes: readonly string[],
): readonly string[] {
  return referencedCodes.filter((code) => !index.byCode.has(code));
}