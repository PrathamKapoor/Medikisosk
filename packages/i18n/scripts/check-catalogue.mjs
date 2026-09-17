/**
 * Development-only structural validator for the Indic catalogues.
 *
 * WHY THIS EXISTS: Indic scripts are encoded so that a consonant cluster is
 * ALWAYS written as consonant + virama + consonant, and a dependent sign (a
 * vowel sign or virama) can never start a word. Any pipeline that silently drops
 * a character therefore produces a string that violates one of those
 * invariants. That makes "dropped character" damage mechanically detectable
 * across 2300+ strings, which is impossible to review by eye.
 *
 * Usage: node --import tsx packages/i18n/scripts/check-catalogue.mjs [locale...]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = resolve(here, '..', 'src', 'locales');

const DEVANAGARI = {
  name: 'Devanagari',
  range: [0x0900, 0x097f],
  consonants: [[0x0915, 0x0939], [0x0958, 0x095f]],
  virama: 0x094d,
  matras: [[0x093e, 0x094c], [0x0962, 0x0963]],
  vowels: [[0x0904, 0x0914]],
  marks: [0x0900, 0x0901, 0x0902, 0x0903, 0x093c],
};

const SCRIPTS = {
  'hi-IN': DEVANAGARI,
  'mr-IN': DEVANAGARI,
  'gu-IN': {
    name: 'Gujarati',
    range: [0x0a80, 0x0aff],
    consonants: [[0x0a95, 0x0ab9], [0x0af9, 0x0af9]],
    virama: 0x0acd,
    matras: [[0x0abe, 0x0acc], [0x0ae2, 0x0ae3]],
    vowels: [[0x0a85, 0x0a94]],
    marks: [0x0a81, 0x0a82, 0x0a83, 0x0abc],
  },
  'ta-IN': {
    name: 'Tamil',
    range: [0x0b80, 0x0bff],
    consonants: [[0x0b95, 0x0bb9]],
    virama: 0x0bcd,
    matras: [[0x0bbe, 0x0bcc]],
    vowels: [[0x0b85, 0x0b94]],
    marks: [0x0b82],
  },
  'te-IN': {
    name: 'Telugu',
    range: [0x0c00, 0x0c7f],
    consonants: [[0x0c15, 0x0c39], [0x0c58, 0x0c5a]],
    virama: 0x0c4d,
    matras: [[0x0c3e, 0x0c4c], [0x0c55, 0x0c56]],
    vowels: [[0x0c05, 0x0c14]],
    marks: [0x0c00, 0x0c01, 0x0c02, 0x0c03, 0x0c3c],
  },
  'bn-IN': {
    name: 'Bengali',
    range: [0x0980, 0x09ff],
    consonants: [[0x0995, 0x09b9], [0x09dc, 0x09df]],
    virama: 0x09cd,
    matras: [[0x09be, 0x09cc], [0x09d7, 0x09d7], [0x09e2, 0x09e3]],
    vowels: [[0x0985, 0x0994]],
    marks: [0x0981, 0x0982, 0x0983, 0x09bc],
  },
  'kn-IN': {
    name: 'Kannada',
    range: [0x0c80, 0x0cff],
    consonants: [[0x0c95, 0x0cb9], [0x0cdd, 0x0cde]],
    virama: 0x0ccd,
    matras: [[0x0cbe, 0x0ccc], [0x0cd5, 0x0cd6]],
    vowels: [[0x0c85, 0x0c94]],
    marks: [0x0c80, 0x0c81, 0x0c82, 0x0c83, 0x0cbc],
  },
};

const INDIC_BLOCKS = [
  [0x0900, 0x097f, 'Devanagari'],
  [0x0980, 0x09ff, 'Bengali'],
  [0x0a00, 0x0a7f, 'Gurmukhi'],
  [0x0a80, 0x0aff, 'Gujarati'],
  [0x0b00, 0x0b7f, 'Oriya'],
  [0x0b80, 0x0bff, 'Tamil'],
  [0x0c00, 0x0c7f, 'Telugu'],
  [0x0c80, 0x0cff, 'Kannada'],
  [0x0d00, 0x0d7f, 'Malayalam'],
];

const inRanges = (cp, ranges) => ranges.some(([lo, hi]) => cp >= lo && cp <= hi);
const isConsonant = (cp, s) => inRanges(cp, s.consonants);
const isMatra = (cp, s) => inRanges(cp, s.matras);
const isVowel = (cp, s) => inRanges(cp, s.vowels);
const isMark = (cp, s) => s.marks.includes(cp);
const isVirama = (cp, s) => cp === s.virama;
const isDependent = (cp, s) => isMatra(cp, s) || isVirama(cp, s) || isMark(cp, s);

function foreignScripts(value, ownRange) {
  const found = new Set();
  for (const ch of value) {
    const cp = ch.codePointAt(0);
    for (const [lo, hi, name] of INDIC_BLOCKS) {
      if (cp >= lo && cp <= hi && !(cp >= ownRange[0] && cp <= ownRange[1])) found.add(name);
    }
  }
  return [...found];
}

// __PART2__