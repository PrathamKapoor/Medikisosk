/**
 * Symptom vocabulary — cardiovascular and respiratory presentations.
 *
 * The Indian-language synonyms are curated clinical content, not machine translation. A
 * mistranslated symptom term is a clinical error rather than a cosmetic problem, so these are
 * written deliberately, and they include the transliterated forms patients actually use when they
 * code-mix ("seene mein chest pain", "saans phool rahi hai").
 *
 * Codes are permanent. Once a code appears in a stored record it must never be renumbered or
 * reused for a different concept, because evidence rows reference it.
 */

import type { BodySystem, ClinicalConcept } from "../concept";

/** Compact constructor. Keeps the vocabulary readable and the file reviewable. */
export function symptom(
  code: string,
  display: string,
  bodySystem: BodySystem,
  synonyms: readonly string[],
  extra: Partial<ClinicalConcept> = {},
): ClinicalConcept {
  return {
    code,
    category: "SYMPTOM",
    display,
    bodySystem,
    synonyms: [...synonyms],
    standardCoding: [],
    pathways: [],
    redFlagRelevant: false,
    potentiallyEmergent: false,
    ...extra,
  };
}

export const CARDIO_RESPIRATORY_SYMPTOMS: readonly ClinicalConcept[] = [
  symptom(
    "MK-SYM-001",
    "Chest pain",
    "CARDIOVASCULAR",
    [
      "chest pain",
      "pain in chest",
      "chest discomfort",
      "chest tightness",
      "seene mein dard",
      "sine me dard",
      "chhati mein dard",
      "seene mein jalan",
      "सीने में दर्द",
      "छाती में दर्द",
      "छाती दुखणे",
      "છાતીમાં દુખાવો",
      "மார்பு வலி",
      "বুক ব্যথা",
    ],
    {
      pathways: ["PATH-CHEST-PAIN"],
      redFlagRelevant: true,
      potentiallyEmergent: true,
      notes:
        "The highest-consequence complaint in this product. Activates the cardiac-oriented SOCRATES variant.",
    },
  ),
  symptom(
    "MK-SYM-002",
    "Shortness of breath",
    "RESPIRATORY",
    [
      "shortness of breath",
      "breathlessness",
      "difficulty breathing",
      "unable to breathe",
      "suffocating",
      "saans phoolna",
      "saans lene mein takleef",
      "saans nahi aa rahi",
      "dum ghutna",
      "सांस फूलना",
      "साँस लेने में तकलीफ़",
      "दम घुटना",
      "श्वास घेणे",
      "શ્વાસ ચડવો",
      "மூச்சு திணறல்",
      "শ্বাসকষ্ট",
    ],
    {
      pathways: ["PATH-CHEST-PAIN", "PATH-RESPIRATORY"],
      redFlagRelevant: true,
      potentiallyEmergent: true,
    },
  ),
  symptom(
    "MK-SYM-003",
    "Breathlessness on exertion",
    "RESPIRATORY",
    [
      "breathless on walking",
      "breathless on climbing stairs",
      "gets breathless on exertion",
      "cannot walk far",
      "chalne par saans phoolna",
      "चलने पर सांस फूलना",
    ],
    {
      pathways: ["PATH-CHEST-PAIN", "PATH-RESPIRATORY"],
      redFlagRelevant: true,
    },
  ),
  symptom(
    "MK-SYM-004",
    "Palpitations",
    "CARDIOVASCULAR",
    [
      "palpitations",
      "heart racing",
      "heart pounding",
      "fast heartbeat",
      "irregular heartbeat",
      "dil ki dhadkan tez",
      "दिल की धड़कन तेज़",
      "छाती में धड़कन",
    ],
    { pathways: ["PATH-CHEST-PAIN"], redFlagRelevant: true },
  ),
  symptom(
    "MK-SYM-005",
    "Sweating",
    "GENERAL",
    [
      "sweating",
      "profuse sweating",
      "cold sweat",
      "excessive sweating",
      "pasina",
      "पसीना",
      "घाम येणे",
      "પરસેવો",
    ],
    { pathways: ["PATH-CHEST-PAIN", "PATH-FEVER"], redFlagRelevant: true },
  ),
  symptom(
    "MK-SYM-006",
    "Fainting",
    "NEUROLOGICAL",
    [
      "fainting",
      "fainted",
      "passed out",
      "loss of consciousness",
      "unconscious",
      "blackout",
      "behosh",
      "बेहोशी",
      "बेहोश होना",
    ],
    { redFlagRelevant: true, potentiallyEmergent: true },
  ),
  symptom(
    "MK-SYM-012",
    "Chest pain radiating to arm or jaw",
    "CARDIOVASCULAR",
    [
      "pain spreading to left arm",
      "pain going to arm",
      "pain radiating to jaw",
      "dard haath tak jata hai",
      "dard jabde tak",
      "दर्द हाथ तक जाता है",
      "दर्द जबड़े तक",
    ],
    {
      pathways: ["PATH-CHEST-PAIN"],
      redFlagRelevant: true,
      potentiallyEmergent: true,
      notes:
        "Its own concept rather than free text, because radiating chest pain is a specific deterministic red-flag input.",
    },
  ),
];
