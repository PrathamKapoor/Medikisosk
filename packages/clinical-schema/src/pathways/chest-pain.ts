/**
 * The chest-pain SOCRATES profile and safety-critical questions.
 *
 * Safety questions are asked before complaint characterisation, so an interview interrupted at any
 * point has still captured what the deterministic triage rules depend on. Every key is a
 * localisation key; there are no inline strings a patient would read.
 */

import {
  pathwayQuestionSchema,
  type PathwayQuestion,
  type PathwayQuestionInput,
} from "../pathway";
import { socratesRelevanceSchema, type SocratesRelevance } from "../socrates";

export function makeQuestion(input: PathwayQuestionInput): PathwayQuestion {
  return pathwayQuestionSchema.parse(input);
}

function socratesRel(
  dimension: SocratesRelevance["dimension"],
  required: boolean,
  questionKey: string,
  optionKeys: readonly string[],
  rationale: string,
): SocratesRelevance {
  return socratesRelevanceSchema.parse({
    dimension,
    required,
    questionKey,
    optionKeys: [...optionKeys],
    rationale,
  });
}

/** Cardiac-oriented SOCRATES variant. Pressure-like character and exertional timing are specific. */
export const CHEST_PAIN_SOCRATES_PROFILE = {
  complaintCode: "MK-SYM-001",
  version: "1.0.0",
  dimensions: [
    socratesRel(
      "SITE",
      true,
      "q.chest_pain.site",
      [
        "q.chest_pain.site.opt.left",
        "q.chest_pain.site.opt.right",
        "q.chest_pain.site.opt.centre",
      ],
      "Site distinguishes cardiac from pleural and gastric causes.",
    ),
    socratesRel(
      "ONSET",
      true,
      "q.chest_pain.onset",
      [],
      "Onset timing is a core cardiac risk discriminator.",
    ),
    socratesRel(
      "CHARACTER",
      true,
      "q.chest_pain.character",
      [
        "q.chest_pain.character.opt.pressure",
        "q.chest_pain.character.opt.sharp",
        "q.chest_pain.character.opt.burning",
        "q.chest_pain.character.opt.heaviness",
        "q.chest_pain.character.opt.tearing",
      ],
      "Pressure-like pain suggests cardiac cause; sharp or burning suggests pleural or gastric.",
    ),
    socratesRel(
      "RADIATION",
      true,
      "q.chest_pain.radiation",
      [
        "q.chest_pain.radiation.opt.left_arm",
        "q.chest_pain.radiation.opt.jaw",
        "q.chest_pain.radiation.opt.back",
        "q.chest_pain.radiation.opt.none",
      ],
      "Radiation to arm or jaw is a high-risk feature.",
    ),
    socratesRel(
      "ASSOCIATED",
      true,
      "q.chest_pain.associated",
      [
        "q.chest_pain.associated.opt.breathlessness",
        "q.chest_pain.associated.opt.sweating",
        "q.chest_pain.associated.opt.nausea",
      ],
      "Associated symptoms determine acuity.",
    ),
    socratesRel(
      "TIMING",
      true,
      "q.chest_pain.timing",
      [
        "q.chest_pain.timing.opt.continuous",
        "q.chest_pain.timing.opt.intermittent",
        "q.chest_pain.timing.opt.episodic",
        "q.chest_pain.timing.opt.nocturnal",
        "q.chest_pain.timing.opt.exertional",
      ],
      "Exertional pattern suggests cardiac origin.",
    ),
    socratesRel(
      "SEVERITY",
      false,
      "q.chest_pain.severity",
      [
        "q.chest_pain.severity.opt.mild",
        "q.chest_pain.severity.opt.moderate",
        "q.chest_pain.severity.opt.severe",
        "q.chest_pain.severity.opt.very_severe",
      ],
      "Severity informs urgency but never rules out a serious cause.",
    ),
  ],
} as const;

/** Safety-critical chest-pain questions. Category SAFETY_CRITICAL, all required, asked first. */
export const CHEST_PAIN_SAFETY_QUESTIONS: readonly PathwayQuestion[] = [
  makeQuestion({
    key: "q.chest_pain.safety_dyspnoea",
    kind: "YES_NO",
    category: "SAFETY_CRITICAL",
    required: true,
    socratesDimensions: ["ASSOCIATED"],
    positiveConceptCodes: ["MK-SYM-002"],
    rationale:
      "Chest pain with breathlessness is the highest-acuity presentation in this product, so it is asked before complaint characterisation.",
  }),
  makeQuestion({
    key: "q.chest_pain.safety_sweating",
    kind: "YES_NO",
    category: "SAFETY_CRITICAL",
    required: true,
    positiveConceptCodes: ["MK-SYM-005"],
    rationale:
      "Cold sweat with chest pain is a cardiac red flag and feeds a deterministic rule.",
  }),
  makeQuestion({
    key: "q.chest_pain.safety_syncope",
    kind: "YES_NO",
    category: "SAFETY_CRITICAL",
    required: true,
    positiveConceptCodes: ["MK-SYM-006"],
    rationale:
      "Fainting with chest pain indicates possible haemodynamic compromise.",
  }),
  makeQuestion({
    key: "q.chest_pain.safety_cardiac_history",
    kind: "YES_NO",
    category: "SAFETY_CRITICAL",
    required: true,
    positiveConceptCodes: ["MK-CON-004"],
    rationale:
      "Known ischaemic heart disease changes the interpretation of new chest pain.",
  }),
];

/** SOCRATES characterisation questions for chest pain, ordered by clinical consequence. */
export const CHEST_PAIN_CHARACTERISATION_QUESTIONS: readonly PathwayQuestion[] =
  [
    makeQuestion({
      key: "q.chest_pain.site",
      kind: "SINGLE_CHOICE",
      category: "CHIEF_COMPLAINT",
      required: true,
      options: [
        { key: "q.chest_pain.site.opt.left" },
        { key: "q.chest_pain.site.opt.right" },
        { key: "q.chest_pain.site.opt.centre" },
      ],
      socratesDimensions: ["SITE"],
      rationale: "Site distinguishes cardiac from pleural and gastric causes.",
    }),
    makeQuestion({
      key: "q.chest_pain.onset",
      kind: "DURATION",
      category: "CHIEF_COMPLAINT",
      required: true,
      socratesDimensions: ["ONSET"],
      rationale:
        "Sudden onset within hours is more urgent than pain present for weeks.",
    }),
    makeQuestion({
      key: "q.chest_pain.character",
      kind: "SINGLE_CHOICE",
      category: "CHIEF_COMPLAINT",
      required: true,
      options: [
        { key: "q.chest_pain.character.opt.pressure" },
        { key: "q.chest_pain.character.opt.sharp" },
        {
          key: "q.chest_pain.character.opt.burning",
          conceptCodes: ["MK-SYM-047"],
        },
        { key: "q.chest_pain.character.opt.heaviness" },
        { key: "q.chest_pain.character.opt.tearing" },
      ],
      socratesDimensions: ["CHARACTER"],
      rationale:
        "Pressure or heaviness suggests cardiac; burning suggests reflux; tearing suggests aortic.",
    }),
    makeQuestion({
      key: "q.chest_pain.radiation",
      kind: "MULTI_CHOICE",
      category: "CHIEF_COMPLAINT",
      required: true,
      options: [
        {
          key: "q.chest_pain.radiation.opt.left_arm",
          conceptCodes: ["MK-SYM-012"],
        },
        { key: "q.chest_pain.radiation.opt.jaw", conceptCodes: ["MK-SYM-012"] },
        { key: "q.chest_pain.radiation.opt.back" },
        { key: "q.chest_pain.radiation.opt.none" },
      ],
      socratesDimensions: ["RADIATION"],
      positiveConceptCodes: ["MK-SYM-012"],
      rationale:
        "Radiation to the arm or jaw is a specific deterministic red-flag input.",
    }),
    makeQuestion({
      key: "q.chest_pain.associated",
      kind: "MULTI_CHOICE",
      category: "CHIEF_COMPLAINT",
      required: true,
      options: [
        {
          key: "q.chest_pain.associated.opt.breathlessness",
          conceptCodes: ["MK-SYM-002"],
        },
        {
          key: "q.chest_pain.associated.opt.sweating",
          conceptCodes: ["MK-SYM-005"],
        },
        { key: "q.chest_pain.associated.opt.nausea" },
      ],
      socratesDimensions: ["ASSOCIATED"],
      rationale: "Associated symptoms raise or lower the index of suspicion.",
    }),
    makeQuestion({
      key: "q.chest_pain.timing",
      kind: "SINGLE_CHOICE",
      category: "CHIEF_COMPLAINT",
      required: true,
      options: [
        { key: "q.chest_pain.timing.opt.continuous" },
        { key: "q.chest_pain.timing.opt.intermittent" },
        { key: "q.chest_pain.timing.opt.episodic" },
        { key: "q.chest_pain.timing.opt.nocturnal" },
        {
          key: "q.chest_pain.timing.opt.exertional",
          conceptCodes: ["MK-SYM-003"],
        },
      ],
      socratesDimensions: ["TIMING"],
      rationale: "An exertional pattern suggests cardiac origin.",
    }),
    makeQuestion({
      key: "q.chest_pain.severity",
      kind: "SEVERITY",
      category: "CHIEF_COMPLAINT",
      required: false,
      options: [
        { key: "q.chest_pain.severity.opt.mild", severity: "MILD" },
        { key: "q.chest_pain.severity.opt.moderate", severity: "MODERATE" },
        { key: "q.chest_pain.severity.opt.severe", severity: "SEVERE" },
        {
          key: "q.chest_pain.severity.opt.very_severe",
          severity: "VERY_SEVERE",
        },
      ],
      socratesDimensions: ["SEVERITY"],
      rationale:
        "Severity informs urgency but never rules out a serious cause.",
    }),
    makeQuestion({
      key: "q.chest_pain.exertion",
      kind: "YES_NO",
      category: "CHIEF_COMPLAINT",
      required: false,
      socratesDimensions: ["EXACERBATING_RELIEVING"],
      positiveConceptCodes: ["MK-SYM-003"],
      rationale:
        "Exertional onset refines the cardiac assessment when associated symptoms are present.",
    }),
    makeQuestion({
      key: "q.chest_pain.relief",
      kind: "MULTI_CHOICE",
      category: "CHIEF_COMPLAINT",
      required: false,
      options: [
        { key: "q.chest_pain.relief.opt.rest" },
        { key: "q.chest_pain.relief.opt.antacid" },
        { key: "q.chest_pain.relief.opt.position" },
        { key: "q.chest_pain.relief.opt.none" },
      ],
      socratesDimensions: ["EXACERBATING_RELIEVING"],
      rationale:
        "Relief with rest supports a cardiac pattern; relief with antacid supports a gastric one.",
    }),
  ];
