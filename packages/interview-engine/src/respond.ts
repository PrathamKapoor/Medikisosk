/**
 * Kind-aware, deterministic evaluation of a single patient response.
 *
 * The outcome includes the response state, the server-computed normalised answer, the clinical
 * fact deltas the answer implies, escalation advisories from the active pathways, and the full
 * interview state AFTER the response is applied (the next question the patient should be asked).
 *
 * Determinism: no randomness and no wall clock. `now` is injected via `ResponseRequest`.
 */

import {
  CONCEPT_INDEX,
  conceptByCode,
  durationToDays,
  evaluateTrigger,
  normaliseAnswer,
  parseDuration,
  parseRelativeDate,
  parseSeverity,
  tokenise,
  type ClinicalConcept,
  type InterviewPathway,
  type NormalisedAnswer,
  type PathwayQuestion,
  type TriggerExpression,
} from "@medikiosk/clinical-schema";
import {
  CONFIDENCE_RELIABLE,
  CONFIDENCE_REVIEW_REQUIRED,
  type Confidence,
  type IsoDate,
} from "@medikiosk/shared-types";
import { buildTriggerContext } from "./context";
import { selectNextQuestion } from "./selector";
import type {
  EscalationAdvisory,
  FactDelta,
  FactKind,
  InterviewInput,
  InterviewQuestionState,
  ResponseOutcome,
  ResponseRecord,
  ResponseRequest,
} from "./types";

/** Positive tokens for YES_NO questions (English + Hindi transliteration + code-mixed). */
const YES_WORDS: ReadonlySet<string> = new Set([
  "yes",
  "yeah",
  "yep",
  "yup",
  "y",
  "haan",
  "han",
  "haanji",
  "haa",
  "ha",
  "haha",
  "hahn",
  "hanh",
  "ji",
  "bilkul",
  "theek",
  "thik",
]);

/** Negative tokens for YES_NO questions (English + Hindi transliteration + code-mixed). */
const NO_WORDS: ReadonlySet<string> = new Set([
  "no",
  "nope",
  "n",
  "nahi",
  "nahin",
  "nai",
  "na",
  "nahii",
  "nhi",
  "nah",
  "matlab",
]);

/** Devanagari positives, checked against the folded raw string (tokenise strips Indic runs). */
const DEVA_YES = ["हाँ", "हां", "हा", "जी"];
/** Devanagari negatives, checked against the folded raw string. */
const DEVA_NO = ["नहीं", "नही", "ना"];

type Polarity = "EMPTY" | "YES" | "NO" | "BOTH" | "NEITHER";

function resolveYesNoPolarity(raw: string): Polarity {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "EMPTY";
  const tokens = tokenise(trimmed);
  const folded = trimmed
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const hasYes =
    tokens.some((token) => YES_WORDS.has(token)) ||
    DEVA_YES.some((word) => folded.includes(word));
  const hasNo =
    tokens.some((token) => NO_WORDS.has(token)) ||
    DEVA_NO.some((word) => folded.includes(word));
  if (hasYes && hasNo) return "BOTH";
  if (hasYes) return "YES";
  if (hasNo) return "NO";
  return "NEITHER";
}

/** Lost-in-translation style fallback: a stable record with no interpretation. */
function plainNormalised(raw: string, req: ResponseRequest): NormalisedAnswer {
  return {
    rawAnswer: raw,
    conceptCodes: [],
    confidence: CONFIDENCE_RELIABLE,
    language: req.asrLanguage ?? "en-IN",
    codeMixed: false,
    negated: false,
    uncertain: false,
  };
}

function dedupe(codes: readonly string[]): string[] {
  return [...new Set(codes)];
}

/** Map an ontology concept category to the clinical fact kind it produces. */
function factKindFor(
  category: ClinicalConcept["category"],
): FactKind | undefined {
  switch (category) {
    case "SYMPTOM":
      return "SYMPTOM";
    case "CONDITION":
      return "CONDITION";
    case "MEDICATION":
      return "MEDICATION";
    case "ALLERGY":
      return "ALLERGY";
    case "HISTORY_FACT":
      return "HISTORY";
    default:
      // VITAL, LAB_TEST, PROCEDURE, AYUSH are not interview fact rows.
      return undefined;
  }
}

const OPTION_KINDS = new Set<string>([
  "SINGLE_CHOICE",
  "MULTI_CHOICE",
  "BODY_SITE",
]);

function isConfidenceGatedKind(kind: PathwayQuestion["kind"]): boolean {
  return kind === "YES_NO" || OPTION_KINDS.has(kind);
}

/** Build the fact deltas implied by a normalised answer, classified by the ontology. */
function buildFacts(
  question: PathwayQuestion,
  normalised: NormalisedAnswer,
  raw: string,
): FactDelta[] {
  const facts: FactDelta[] = [];
  const seen = new Set<string>();
  for (const code of normalised.conceptCodes) {
    if (seen.has(code)) continue;
    seen.add(code);
    const concept = conceptByCode(CONCEPT_INDEX, code);
    if (!concept) continue;
    const kind = factKindFor(concept.category);
    if (kind === undefined) continue;
    facts.push({
      kind,
      conceptCode: concept.code,
      displayName: concept.display,
      ...(normalised.severity === undefined
        ? {}
        : { severity: normalised.severity }),
      ...(normalised.resolvedOnsetDate === undefined
        ? {}
        : { onsetDate: normalised.resolvedOnsetDate }),
      ...(normalised.duration === undefined
        ? {}
        : { durationDays: durationToDays(normalised.duration) }),
      negated: normalised.negated,
      ...(question.socratesDimensions.length > 0
        ? { socratesDimension: question.socratesDimensions[0] }
        : {}),
      rawAnswer: raw,
      confidence: normalised.confidence,
    });
  }
  return facts;
}

interface AnsweredResult {
  readonly state: InterviewQuestionState;
  readonly normalised: NormalisedAnswer;
  readonly facts: FactDelta[];
}

/** Kind-aware evaluation of an ANSWERED request (or an omitted state, which defaults to it). */
function evaluateAnswered(
  question: PathwayQuestion,
  req: ResponseRequest,
): AnsweredResult {
  const raw = req.rawAnswer ?? "";
  if (raw.trim().length === 0) {
    return {
      state: "NEEDS_CLARIFICATION",
      normalised: plainNormalised(raw, req),
      facts: [],
    };
  }

  const normalised = normaliseAnswer(raw, {
    now: req.now,
    asrLanguage: req.asrLanguage,
    asrConfidence: req.asrConfidence,
  }) as NormalisedAnswer;

  switch (question.kind) {
    case "YES_NO": {
      const polarity = resolveYesNoPolarity(raw);
      if (polarity === "BOTH" || polarity === "EMPTY") {
        return { state: "NEEDS_CLARIFICATION", normalised, facts: [] };
      }
      if (polarity === "NEITHER") {
        return { state: "LOW_CONFIDENCE", normalised, facts: [] };
      }
      normalised.negated = polarity === "NO";
      normalised.confidence = Math.max(
        normalised.confidence,
        CONFIDENCE_RELIABLE,
      ) as Confidence;
      if (polarity === "YES") {
        normalised.conceptCodes = dedupe([
          ...normalised.conceptCodes,
          ...question.positiveConceptCodes,
        ]);
      }
      break;
    }
    case "SINGLE_CHOICE":
    case "BODY_SITE": {
      const option = question.options.find((o) => o.key === raw.trim());
      if (option) {
        normalised.conceptCodes = dedupe([
          ...normalised.conceptCodes,
          ...option.conceptCodes,
        ]);
        normalised.confidence = Math.max(
          normalised.confidence,
          CONFIDENCE_RELIABLE,
        ) as Confidence;
        if (option.severity !== undefined)
          normalised.severity = option.severity;
      }
      break;
    }
    case "MULTI_CHOICE": {
      // A multi-select answer is one or more option keys, separated by any of `;`, `,` or
      // whitespace. Every token must be a known option: a partially-unknown set is treated as
      // free text (a mis-tap must not silently split the patient's answer).
      const keys = raw
        .split(/[;,，、\s]+/)
        .map((key) => key.trim())
        .filter(Boolean);
      if (keys.length === 0)
        return { state: "NEEDS_CLARIFICATION", normalised, facts: [] };
      const everyKeyKnown = keys.every((key) =>
        question.options.some((option) => option.key === key),
      );
      // A partially-unknown set is sent back for clarification: dropping the unknown option
      // would silently alter the patient's selection.
      if (!everyKeyKnown)
        return { state: "NEEDS_CLARIFICATION", normalised, facts: [] };
      {
        const selected = keys.map(
          (key) =>
            question.options.find((option) => option.key === key) as
              | (typeof question.options)[number]
              | undefined,
        );
        normalised.conceptCodes = dedupe([
          ...normalised.conceptCodes,
          ...selected.flatMap((option) => option?.conceptCodes ?? []),
        ]);
        normalised.confidence = Math.max(
          normalised.confidence,
          CONFIDENCE_RELIABLE,
        ) as Confidence;
        // The patient picked these exact options; preserve the selection in the raw answer.
        normalised.rawAnswer = keys.join("; ");
      }
      break;
    }
    case "SEVERITY": {
      const option = question.options.find((o) => o.key === raw);
      const severity = option?.severity ?? parseSeverity(raw);
      if (severity !== undefined) normalised.severity = severity;
      if (option)
        normalised.confidence = Math.max(
          normalised.confidence,
          CONFIDENCE_RELIABLE,
        ) as Confidence;
      break;
    }
    case "DURATION": {
      const duration = parseDuration(raw);
      if (duration !== undefined) normalised.duration = duration;
      const onset = parseRelativeDate(raw, req.now);
      if (onset !== undefined) normalised.resolvedOnsetDate = onset;
      break;
    }
    case "NUMBER": {
      if (!Number.isFinite(Number.parseFloat(raw))) {
        return { state: "NEEDS_CLARIFICATION", normalised, facts: [] };
      }
      break;
    }
    case "DATE": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return { state: "NEEDS_CLARIFICATION", normalised, facts: [] };
      }
      normalised.resolvedOnsetDate = raw as IsoDate;
      break;
    }
    case "FREE_TEXT":
    case "INSTRUCTION":
    case "DOCUMENT_UPLOAD":
    default:
      // FREETEXT and friends use normaliseAnswer as-is.
      break;
  }

  // Never fabricate a fact from a low-confidence interpretation on a polarity/option kind.
  if (
    isConfidenceGatedKind(question.kind) &&
    normalised.confidence < CONFIDENCE_REVIEW_REQUIRED
  ) {
    return { state: "LOW_CONFIDENCE", normalised, facts: [] };
  }

  return {
    state: "ANSWERED",
    normalised,
    facts: buildFacts(question, normalised, raw),
  };
}

function findQuestionContext(
  activePathways: readonly InterviewPathway[],
  questionKey: string,
):
  | { readonly pathway: InterviewPathway; readonly question: PathwayQuestion }
  | undefined {
  for (const pathway of activePathways) {
    const question = pathway.questions.find((q) => q.key === questionKey);
    if (question) return { pathway, question };
  }
  return undefined;
}

/** Defensive placeholder used only when the question is not found (the API layer gates this). */
function fallbackQuestionContext(questionKey: string): {
  readonly pathway: InterviewPathway;
  readonly question: PathwayQuestion;
} {
  const question: PathwayQuestion = {
    key: questionKey,
    kind: "FREE_TEXT",
    category: "COMPLETENESS",
    required: false,
    options: [],
    socratesDimensions: [],
    positiveConceptCodes: [],
    captureVerbatim: true,
    rationale: "",
    maxAsks: 2,
  };
  const pathway: InterviewPathway = {
    key: "PATH-UNKNOWN",
    version: "0",
    displayName: "",
    complaintCodes: [],
    entryWhen: { always: true },
    askWhen: undefined,
    questions: [question],
    branches: [],
    completion: { socratesRequiredRatio: 1, maxQuestions: 40 },
    escalation: [],
    priorityRank: 999,
  };
  return { pathway, question };
}

function collectAdvisories(
  activePathways: readonly InterviewPathway[],
  evaluate: (when: TriggerExpression) => boolean,
): EscalationAdvisory[] {
  const advisories: EscalationAdvisory[] = [];
  const seen = new Set<string>();
  for (const pathway of activePathways) {
    for (const escalation of pathway.escalation) {
      if (seen.has(escalation.key)) continue;
      if (!evaluate(escalation.when)) continue;
      seen.add(escalation.key);
      advisories.push({ key: escalation.key, advisory: escalation.advisory });
    }
  }
  return advisories;
}

/** True when the client's own interpretation disagreed with the server's concept parse. */
function computeHintMismatch(
  req: ResponseRequest,
  normalised: NormalisedAnswer | null,
): boolean {
  if (req.clientHintJson === undefined || req.clientHintJson === null)
    return false;
  const client = req.clientHintJson as { conceptCodes?: readonly string[] };
  const clientCodes = new Set(client?.conceptCodes ?? []);
  const serverCodes = new Set(normalised?.conceptCodes ?? []);
  if (clientCodes.size !== serverCodes.size) return true;
  for (const code of clientCodes) {
    if (!serverCodes.has(code)) return true;
  }
  return false;
}

/**
 * Evaluate one response against the interview state.
 *
 * Assumes the question is currently active (the API layer decides QUESTION_NOT_ACTIVE /
 * QUESTION_ALREADY_COMPLETED before calling; see docs/PHASE-3-PLAN.md §4.5).
 */
export function evaluateResponse(
  input: InterviewInput,
  activePathways: readonly InterviewPathway[],
  req: ResponseRequest,
): ResponseOutcome {
  const found = findQuestionContext(activePathways, req.questionKey);
  const { pathway, question } =
    found ?? fallbackQuestionContext(req.questionKey);

  const requestedState = req.state ?? "ANSWERED";

  let outcomeState: InterviewQuestionState;
  let normalised: NormalisedAnswer | null;
  let facts: FactDelta[];

  if (requestedState === "SKIPPED") {
    outcomeState = "SKIPPED";
    normalised = null;
    facts = [];
  } else if (
    requestedState === "DECLINED" ||
    requestedState === "UNKNOWN" ||
    requestedState === "NOT_APPLICABLE"
  ) {
    outcomeState = requestedState;
    normalised = plainNormalised(req.rawAnswer ?? "", req);
    facts = [];
  } else {
    const answered = evaluateAnswered(question, req);
    outcomeState = answered.state;
    normalised = answered.normalised;
    facts = answered.facts;
  }

  // Append-only: the response is a new immutable row. AskCount increments per attempt.
  const priorAsk = input.responses.filter(
    (r) => r.questionKey === req.questionKey,
  ).length;
  const record: ResponseRecord = {
    questionKey: req.questionKey,
    pathwayKey: pathway.key,
    kind: question.kind,
    category: question.category,
    state: outcomeState,
    rawAnswer: req.rawAnswer,
    normalisedJson: normalised,
    confidence: normalised?.confidence ?? null,
    askCount: priorAsk + 1,
    answeredAt: req.now.toISOString(),
  };

  const postInput: InterviewInput = {
    ...input,
    responses: [...input.responses, record],
  };
  const postContext = buildTriggerContext(postInput);
  const evaluate = (when: TriggerExpression) =>
    evaluateTrigger(when, postContext);
  const advisories = collectAdvisories(activePathways, evaluate);
  const next = selectNextQuestion(postInput, activePathways);
  const hintMismatch = computeHintMismatch(req, normalised);
  const evidenceExpected = outcomeState !== "SKIPPED";

  return {
    state: outcomeState,
    normalisedJson: normalised,
    facts,
    evidenceExpected,
    advisories,
    next,
    hintMismatch,
  };
}
