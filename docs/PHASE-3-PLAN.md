# MediKiosk — Phase 3 Implementation Plan: Deterministic Clinical Interview Runtime

> **Status:** binding design for Phase 3 implementers (2026-09-18). Repository state at time of
> writing: commits `4e497c8` (Phase 1), `0a4a28e` (Phase 2), `c8e7eab` (docs); working tree clean;
> 27 tests green; build/typecheck/lint/format green. Read `handoff.md` for the full context chain.
> The master prompt (`MEDIKIOSK — PHASE 3`) and `docs/api/CONTRACT.md` §6–§7 are the external
> authorities; this document is the argument from them to code. Where this plan and the master
> prompt differ, the master prompt wins and the difference must be reported to Main.

---

## 1. Objective

A deterministic, persistent, versioned clinical interview runtime. The **backend/domain state**
drives question progression, response provenance, evidence generation, completion and
safety/triage evaluation. The interview works with no UI, no voice, no ASR, no LLM, no OCR.
The runtime must be fully testable through domain logic and APIs.

**Explicitly out of scope (Phase 4+; must remain PLANNED):** ASR/TTS/Bhashini, OCR/document AI,
LLM summarization, FHIR export, ABDM, real ABHA, physician console polish, offline/sync,
analytics. Do not add an AI dependency of any kind.

## 2. Non-negotiable rules

- Deterministic: same input + same pathway version ⇒ same next question (invariant-tested).
- Raw response immutable: corrections create new rows; never update `rawAnswer`.
- `DECLINED` / `UNKNOWN` / `SKIPPED` are distinct and never coerced to "no"
  (`NOT_A_NEGATIVE_STATES` in shared-types; reuse it, do not re-derive).
- Every clinical fact is backed by an `evidence` row (ADR-005). Evidence rows are append-only;
  corrections supersede.
- Triage level is set only by `@medikiosk/safety-rules` `evaluateTriage` (ADR-009). The
  interview never asserts acuity; it only evaluates the rule engine and records the result.
- Consent guard (`requireConsent` in `services/api/src/consent/consent.service.ts`) runs in the
  service layer before every clinical write. Revoked consent ⇒ processing stops.
- Tenant from principal, never from the body/header. Cross-tenant ⇒ 404, not 403.
- Audit: codes/keys/counts only, never raw clinical text (platform/logger + audit scrub).
- Conventions: ULID ids `varchar(26)`, ISO-8601 UTC timestamps `varchar(30)`, booleans `integer`
  0/1, JSON `text` + Zod at the repo boundary, extensionless relative imports, CommonJS.
- Errors go through `MediKioskError` + `ERROR_CODES`; no ad-hoc strings.
- Mutating endpoints use the existing `replayMutation` idempotency mechanism
  (`services/api/src/kiosk/replay.ts`) — never a second implementation.

## 3. Architecture

```
apps/kiosk (interview screen; consumes APIs only)
   │ HTTP /api/v1
services/api/src/interview/         (service + repo + routes; transactions, audit, consent)
   ├ interview.routes.ts            Fastify routes (contract §6–§7 + additions)
   ├ interview.service.ts           orchestration: guards → load state → engine → persist
   ├ state.repo.ts                  load/persist responses, facts, evidence, session row
   ├ triage.build.ts                facts → RuleEvaluationInput → evaluateTriage → persist
   └ (tests) golden-case, security, idempotency, consent, expiry
   │
packages/interview-engine/          (NEW pure package; no DB/network/IO)
   ├ types.ts                       InterviewInput, ResponseRecord, Factor... (see §5)
   ├ context.ts                     InterviewInput → TriggerContext (clinical-schema/trigger)
   ├ pathways.ts                    active pathway selection (entryWhen + priorityRank)
   ├ selector.ts                    next-question selection + rationale + progress
   ├ respond.ts                     kind-aware deterministic response evaluation
   ├ complete.ts                    completion / clarification / escalation state
   ├ index.ts
   └ __tests__/*                    domain + invariant tests
packages/clinical-schema            (EXISTING; consumed, not modified except none)
packages/safety-rules               (EXISTING; consumed)
packages/shared-types               (EXISTING; +3 error codes, see §8)
```

`services/api` resolves workspace packages through `dist/` — **rebuild
`@medikiosk/interview-engine` and `@medikiosk/shared-types` before type-checking `services/api`, and
restart any running API process** (this footgun was hit in Phase 2; see handoff §4).

## 4. New package `@medikiosk/interview-engine`

Package `packages/interview-engine/package.json` (private, `main`/`types` → `dist`, build =
`tsc -p tsconfig.json`), deps: `@medikiosk/shared-types`, `@medikiosk/clinical-schema`. No zod
runtime churn beyond clinical-schema's exports. Root `package.json` `build:foundation` inserts it
after `@medikiosk/clinical-schema` and before `@medikiosk/api`; `services/api/package.json`
dependencies gain `"@medikiosk/interview-engine": "*"`.

### 4.1 `types.ts`

```ts
export type InterviewQuestionState =
  | "UNANSWERED" | "ANSWERED" | "SKIPPED" | "DECLINED" | "UNKNOWN"
  | "CONTRADICTORY" | "LOW_CONFIDENCE" | "NEEDS_CLARIFICATION"
  | "VERIFIED" | "NOT_APPLICABLE";          // = shared-types ResponseState

export interface ResponseRecord {
  readonly questionKey: string;
  readonly pathwayKey: string;
  readonly kind: QuestionKind;               // from clinical-schema
  readonly category: QuestionCategory;       // from clinical-schema
  readonly state: InterviewQuestionState;
  readonly rawAnswer: string | null;
  readonly normalisedJson: unknown | null;   // NormalisedAnswer serialised
  readonly confidence: number | null;
  readonly askCount: number;
  readonly answeredAt: string;               // ISO
}

export type FactKind = "SYMPTOM" | "CONDITION" | "MEDICATION" | "ALLERGY" | "HISTORY";

export interface SocratesSlotFact {           // mirror of clinical-schema socratesSlotSchema
  readonly dimension: SocratesDimension;
  readonly state: InterviewQuestionState;
  readonly answerJson: unknown | null;
  readonly evidenceIds: readonly string[];
  readonly askCount: number;
}

export interface SymptomFact {
  readonly conceptCode: string;
  readonly severity: Severity | null;
  readonly onsetDate: string | null;         // ISO date
  readonly durationDays: number | null;
  readonly socrates: Readonly<Partial<Record<SocratesDimension, SocratesSlotFact>>>;
}

export interface PatientContext {
  readonly ageYears?: number;
  readonly sex?: "MALE" | "FEMALE" | "OTHER";
  readonly pregnant?: boolean;
}

export interface InterviewInput {
  readonly complaints: readonly string[];    // complaint concept codes from encounter
  readonly patient: PatientContext;
  readonly responses: readonly ResponseRecord[];
  readonly symptomFacts: readonly SymptomFact[];
  readonly conditionCodes: readonly string[];
  readonly medicationCodes: readonly string[];
  readonly allergyCategories: readonly ("DRUG" | "FOOD" | "ENVIRONMENTAL" | "OTHER")[];
  readonly vitals: Readonly<Record<string, number>>;
  readonly labFlaggedHigh: readonly string[];
  readonly labFlaggedLow: readonly string[];
  readonly documentCount: number;
}

export interface QuestionView {
  readonly key: string;
  readonly kind: QuestionKind;
  readonly category: QuestionCategory;
  readonly pathwayKey: string;
  readonly promptKey: string;                // = question key (localisation)
  readonly options: readonly { key: string; conceptCodes: readonly string[]; severity?: Severity }[];
  readonly socratesDimensions: readonly SocratesDimension[];
  readonly rationale: string;
  readonly required: boolean;
  readonly askCount: number;
}

export interface ProgressView {
  readonly asked: number;
  readonly activeCount: number;
  readonly requiredClosed: number;
  readonly requiredTotal: number;
  readonly socratesRequiredRatio: number;    // 0..1 across complaint profiles
}

export type InterviewStatus =
  | "IN_PROGRESS"
  | "COMPLETE"
  | "INCOMPLETE"
  | "NEEDS_CLARIFICATION"
  | "SAFETY_ESCALATION";

export interface CompletionView {
  readonly status: InterviewStatus;
  readonly outstandingRequired: readonly string[];   // keys
  readonly outstandingReason: Readonly<Record<string, string>>;
  readonly canFinishAnyway: boolean;
  readonly maxQuestionsReached: boolean;
}

export interface NextQuestionResult {
  readonly question: QuestionView | null;    // null ⇒ nothing to ask
  readonly progress: ProgressView;
  readonly completion: CompletionView;
  readonly rationale: string | null;         // why this question was selected (debug/physician)
}

export interface FactDelta {
  readonly kind: FactKind;
  readonly conceptCode: string;
  readonly displayName: string;
  readonly severity?: Severity;
  readonly onsetDate?: string;
  readonly durationDays?: number;
  readonly negated: boolean;
  readonly socratesDimension?: SocratesDimension;
  readonly rawAnswer: string;
  readonly confidence: number;
}

export interface EscalationAdvisory {
  readonly key: string;
  readonly advisory: string;
}

export interface ResponseOutcome {
  readonly state: InterviewQuestionState;    // ANSWERED | LOW_CONFIDENCE | NEEDS_CLARIFICATION | ...
  readonly normalisedJson: unknown | null;   // NormalisedAnswer (server-computed)
  readonly facts: readonly FactDelta[];
  readonly evidenceExpected: boolean;        // declined/unknown ⇒ true; skipped ⇒ false
  readonly advisories: readonly EscalationAdvisory[];
  readonly next: NextQuestionResult;         // state AFTER this response
  readonly hintMismatch: boolean;            // client hint disagreed with server parse
}

export interface ResponseRequest {
  readonly questionKey: string;
  readonly state?: "ANSWERED" | "SKIPPED" | "DECLINED" | "UNKNOWN" | "NOT_APPLICABLE";
  readonly rawAnswer: string | null;
  readonly modality: "VOICE" | "TOUCH" | "STAFF_ASSISTED" | "IMPORTED";
  readonly asrConfidence?: number;
  readonly asrLanguage?: string;
  readonly clientHintJson?: unknown;         // client-supplied normalisedAnswer (untrusted)
}
```

### 4.2 `context.ts`

`buildTriggerContext(input: InterviewInput): TriggerContext` — populate every field of
clinical-schema `TriggerContext`:
- `answerYes`/`answerNo`/`answerAny`/`unanswered` from `responses` (a question with any response
  in ANSWERED/VERIFIED is "answered"; YES/NO polarity from `normalisedJson.negated`-aware
  resolution — YES = answered and not negated and has concept codes or the kind is YES_NO with a
  positive match; NO = answered and (negated or YES_NO negative); `unanswered` true only when no
  response row exists yet).
- `symptomCodes` = complaints + symptomFacts codes; `symptomDurationDays` from symptomFacts.
- age/sex/pregnant, conditionCodes, medicationCodes, allergyCategories, vitals, labFlagged*,
  documentCount.

### 4.3 `pathways.ts`

`selectActivePathways(input: InterviewInput): readonly InterviewPathway[]`
- Registry: `PATHWAYS` from `@medikiosk/clinical-schema` (`packages/clinical-schema/src/pathways/index.ts`).
- Context from `buildTriggerContext`; keep pathways where `evaluateTrigger(pathway.entryWhen, ctx)`
  OR `complaints.length === 0 && pathway.entryWhen === {always:true}` (general pathway); sort by
  `priorityRank` asc; dedupe by key. Return copy ordered.

### 4.4 `selector.ts`

`selectNextQuestion(input, activePathways): NextQuestionResult`
1. Build `evaluate = (e) => evaluateTrigger(e, ctx)`; for each active pathway (in order):
   `activeQuestionKeys(pathway, evaluate)` → candidate keys (honours branches); map to questions;
   apply `questionAppliesToAge(question, input.patient.ageYears)` (from clinical-schema/pathway.ts).
2. Global list of candidates with (pathway, question, orderIndex). Sort by
   `(CATEGORY_PRIORITY_RANK[category], pathway.priorityRank, orderIndex)`.
3. Eligible = state is UNANSWERED, OR (state is open — LOW_CONFIDENCE /
   NEEDS_CLARIFICATION / CONTRADICTORY — AND askCount < question.maxAsks (default 2)).
   SKIPPED is open (per shared-types `isOpen`) so a skipped required question is re-askable; a
   skipped question whose askCount reached maxAsks is exhaustively skipped (documented).
4. If none eligible ⇒ `question: null`; completion status from `complete.ts`; rationale null.
5. Else return `QuestionView` (options from `question.options`; severity from option) + progress
   + completion + rationale string, e.g.
   `SAFETY_CRITICAL question required by PATH-CHEST-PAIN` /
   `Branch condition of PATH-HISTORY-GENERAL (BR-X)` / `Re-asking for clarification (max 2)`.

Progress: `asked` = responses count; `activeCount` = eligible candidates count;
`requiredClosed/requiredTotal` = over ALL active questions marked `required` and applicable,
terminal state ⇒ closed; `socratesRequiredRatio` via `socratesCompleteness` per complaint
profile — compute a blended ratio = closed required slots / total required slots across the
profiles of each complaint code that has a profile (use `socratesProfileSchema` profiles exported
from clinical-schema; fallback 1.0 when a complaint has no profile).

### 4.5 `respond.ts`

`evaluateResponse(input, activePathways, req: ResponseRequest): ResponseOutcome`

**Validation (throws/returns error-shaped results is NOT allowed here — return outcome with
`state` semantics; the API layer maps to errors):** the API layer decides QUESTION_NOT_ACTIVE /
QUESTION_ALREADY_COMPLETED before calling; here we assume the question is active.

- `state` in SKIPPED/DECLINED/UNKNOWN/NOT_APPLICABLE:
  - SKIPPED: outcome.state = SKIPPED (open), facts [], evidenceExpected false, no normalisation.
  - DECLINED/UNKNOWN/NOT_APPLICABLE: outcome.state = same (terminal); evidenceExpected true;
    normalised = { rawAnswer: raw ?? "", language: asrLanguage ?? "en-IN", confidence:
    CONFIDENCE_RELIABLE, negated:false, uncertain:false }.
  - `next` = re-run selector (post-response input).
- `state === "ANSWERED"` (or omitted): kind-aware deterministic processing:
  - Resolve polarity for YES_NO via the shared lexicon in this package (English + Hindi +
    common code-mixed forms; do NOT import UI strings): yesTerms, noTerms, both present ⇒
    NEEDS_CLARIFICATION; neither ⇒ LOW_CONFIDENCE (or NEEDS_CLARIFICATION when raw empty).
  - Build `NormalisedAnswer` with `normaliseAnswer(raw, {now, asrLanguage, asrConfidence})` from
    clinical-schema (`packages/clinical-schema/src/normalisation.ts`), then enrich from the
    question: YES ⇒ merge `question.positiveConceptCodes`; option-key match (raw === option.key)
    ⇒ merge option.conceptCodes / option.severity; SEVERITY kinds ⇒ parseSeverity; DURATION ⇒
    parseDuration + parseRelativeDate; NUMBER ⇒ parseFloat (NaN ⇒ NEEDS_CLARIFICATION); DATE ⇒
    ISO validity (invalid ⇒ NEEDS_CLARIFICATION); MULTI_CHOICE with raw === option.key ⇒ that
    option only; FREETEXT ⇒ normaliseAnswer as-is.
  - `normalised.confidence` from clinical-schema; if `rawAnswer` empty ⇒ NEEDS_CLARIFICATION.
    If confidence < 0.5 (CONFIDENCE_REVIEW_REQUIRED from shared-types) and kind is YES_NO or
    option kind ⇒ LOW_CONFIDENCE (open; re-ask) — never fabricate a fact from it.
  - `facts`: from (a) YES_NO positive ⇒ positiveConceptCodes; (b) option conceptCodes;
    (c) normaliseAnswer conceptCodes. Classify each code by `CONCEPT_CATEGORIES`
    (clinical-schema ontology) → SymptomFact/condition/medication/allergy/history deltas with
    severity/onset/duration/socratesDimension (from question.socratesDimensions first entry).
    Negated answers ⇒ deltas with negated:true (no row creation in DB for negated symptoms;
    the response row itself is the record of the denial).
  - `advisories`: for each active pathway, `pathway.escalation` filter
    `evaluateTrigger(esc.when, ctx)`; dedupe by key.
  - `hintMismatch`: clientHintJson present AND its conceptCodes set ≠ server set ⇒ true.
  - `next`: re-run selector on the post-response input.
- Determinism requirement: same input + same request ⇒ same outcome. No randomness, no Date.now()
  inside the package (the API passes `now` for evidence timestamps; parseRelativeDate needs a
  `now` — pass it via `InterviewInput`? NO: add `now: Date` to `ResponseRequest` instead; the
  API supplies the injected clock).

### 4.6 `complete.ts`

`computeCompletion(input, activePathways): CompletionView`
- `outstandingRequired`: question keys where `required` && applicable && !terminal (DECLINED /
  UNKNOWN / NOT_APPLICABLE / ANSWERED / VERIFIED are terminal; SKIPPED / LOW_CONFIDENCE /
  NEEDS_CLARIFICATION / CONTRADICTORY / UNANSWERED are outstanding).
- `outstandingReason[ key ]`: e.g. "UNANSWERED" | "SKIPPED" | "LOW_CONFIDENCE (asked 2/2)" |
  "NEEDS_CLARIFICATION".
- `canFinishAnyway`: always true (never coerce; contract finish endpoint is advisory).
- `status`:
  - open outstanding on a REQUIRED question with state LOW_CONFIDENCE/NEEDS_CLARIFICATION/
    CONTRADICTORY ⇒ `NEEDS_CLARIFICATION`
  - else outstanding (incl. SKIPPED/UNANSWERED required) ⇒ `INCOMPLETE`
  - else ⇒ `COMPLETE`.
- `maxQuestionsReached`: asked >= min over active pathways of `completion.maxQuestions` (use the
  most restrictive active pathway's maxQuestions; if any active pathway exceeded ⇒ true; a
  pathway beyond budget contributes an "unanswered" outstanding without allowing more questions —
  selector must not offer questions once budget exhausted for that pathway).
- Safety escalation is NOT part of this pure completion (it comes from the triage engine);
  the API composes `SAFETY_ESCALATION` into the response when the latest assessment is non-GREEN
  or `requiresHumanReview` is true.

### 4.7 Package tests (`packages/interview-engine/src/__tests__/`)

Vitest, no DB. Include:
1. **Determinism**: same input+request twice ⇒ deep-equal results (selector AND respond).
2. **Branching**: chest pain + dyspnoea YES ⇒ activeQuestionKeys includes
   `q.chest_pain.exertion`; without it, not.
3. **YES_NO normalisation**: haan/han/yes ⇒ positive; nahi/nahi/na ⇒ negated; "haan nahi" ⇒
   NEEDS_CLARIFICATION; empty ⇒ NEEDS_CLARIFICATION.
4. **Declined ≠ Unknown ≠ Skipped**: states preserved, never coerced; declined required question
   ⇒ COMPLETE (terminal) while unknown ⇒ COMPLETE too (terminal) but skipped ⇒ INCOMPLETE with
   outstanding.
5. **Retry semantics**: LOW_CONFIDENCE answer then re-ask; askCount increments; after maxAsks,
   question no longer offered; outstanding reason reflects it.
6. **Completion**: all required terminal ⇒ COMPLETE; socrates ratio respected (chest pain profile
   requires SITE..TIMING: answer site + onset + character + radiation + associated + timing ⇒
   ratio 1; missing one ⇒ ratio < 1 and INCOMPLETE when required).
7. **Max questions budget**: artificially fill responses beyond maxQuestions ⇒ no question
   offered; completion reports maxQuestionsReached.
8. **Escalation advisory**: chest pain + dyspnoea ⇒ ESC-CHEST-PAIN-001.
9. **Context build**: answeredYes/unanswered/negation mapping into TriggerContext used by
   branches.

See `docs/PHASE-3-PLAN.md` §9 for the golden journey the API must replay.

## 5. Database: migration `0015-interview-runtime.ts`

Follow existing migration style (Kysely `db.schema`, `if not exists` not needed for fresh tables
but keep idempotent pattern used by runner; timestamps varchar(30); ULID id).

```sql
CREATE TABLE interview_sessions (
  id            varchar(26) PRIMARY KEY,
  tenantId      varchar(26) NOT NULL REFERENCES tenants(id),
  encounterId   varchar(26) NOT NULL REFERENCES encounters(id),
  patientId     varchar(26) NOT NULL REFERENCES patients(id),
  kioskSessionId varchar(26) NOT NULL,           -- sessions.id (no FK: wipe keeps row)
  status        varchar(24) NOT NULL,            -- ACTIVE | COMPLETED | ABANDONED
  pathwayKeysJson text NOT NULL,                 -- active pathway keys
  pathwayVersion varchar(24) NOT NULL,           -- PATHWAY_VERSION recorded at start
  runtimeVersion varchar(24) NOT NULL,           -- INTERVIEW_RUNTIME_VERSION
  startedAt     varchar(30) NOT NULL,
  completedAt   varchar(30),
  createdAt     varchar(30) NOT NULL,
  updatedAt     varchar(30) NOT NULL,
  deletedAt     varchar(30)
);
CREATE INDEX interview_sessions_tenant_encounter ON interview_sessions (tenantId, encounterId);
ALTER TABLE questionnaire_responses ADD COLUMN hintMismatch integer NOT NULL DEFAULT 0;
CREATE INDEX questionnaire_responses_encounter ON questionnaire_responses (tenantId, encounterId);
```

Type additions: `InterviewSessionRow` in `tables-clinical.ts`, `hintMismatch` on
`QuestionnaireResponseRow`, `Database` map includes `interview_sessions`, migration 0015 appended
to `migrations/index.ts`.

**No other tables.** Facts go to existing `symptoms` (socratesJson merged per slot, evidenceIds in
slots), `history_entries` (kind='CONDITION' for condition codes; onsetYear where known),
`medications` (matched MEDICATION codes; asWrittenName = raw; status 'CURRENT'), `allergy_records`
(matched ALLERGY codes; freeTextName = raw) / `allergy_status` (only explicit "no known
allergies"), `evidence` (type 'QUESTIONNAIRE_RESPONSE', source 'questionnaire_response',
sourceRef = response row id, originClass 'PATIENT_REPORTED', rawValue = raw, normalisedJson,
confidence, language, capturedAt, createdBy = kiosk session id, verificationState
'UNVERIFIED'), `triage_assessments`, `queue_entries`, `timeline_events` (kind per event).

## 6. API slice (`services/api/src/interview/`)

Auth: kiosk session JWT for all patient flows (`KioskService.authenticate` +
`sessionFor(db, principal, now)`; session must be ACTIVE and `session.patientId` set); encounter
ownership: `encounter.sessionId === principal.sessionId && encounter.tenantId ===
principal.tenantId` else `errors.notFound('Encounter')`. Staff read: `authenticateStaff` +
permission `patient.read` (existing middleware).

Consent guard (service layer, before ANY clinical write; since interview, patient question data
is 'SYMPTOMS', action 'CLINICAL_INTAKE', destination 'TREATING_HOSPITAL'):
`await requireConsent(db, { tenantId, patientId, sessionId, purpose: 'treatment',
category: 'SYMPTOMS', action: 'CLINICAL_INTAKE', destination: 'TREATING_HOSPITAL' }, now)`
— throws CONSENT_MISSING / CONSENT_REVOKED / CONSENT_EXPIRED / CONSENT_PURPOSE_NOT_PERMITTED.

Endpoints (base `/api/v1`, contracts §6–§7 + additions):
1. `POST /api/v1/encounters`
   `{ patientId, sessionId, encounterType:'OPD', chiefComplaintCodes, chiefComplaintVerbatim?,
   locale, ayushMode?, questionnaireVersion? }` → 201 `{ encounterId, status:'IN_PROGRESS',
   activePathways:[...], interviewSessionId }`. Guards: session+ownership, patient binding
   (`session.patientId === patientId`), consent, non-empty complaint codes, locales/ayush from
   config. Activates pathways via engine; records `pathwayVersion = PATHWAY_VERSION`; creates
   encounter + interview session row (ACTIVE). Idempotent (replay). Audit `ENCOUNTER_CREATED`,
   `INTERVIEW_STARTED`.
2. `GET /api/v1/encounters/:encounterId` — kiosk (owner) or staff (`patient.read`). Returns
   structured case: patient header (masked), encounter fields, complaints, interview session
   summary (status, pathways, version), responses (questionKey/state/raw/normalised/askCount/
   answeredAt), symptom facts, latest triage, advisories, completion. Staff read audits
   `RECORD_VIEWED`.
3. `GET /api/v1/encounters/:encounterId/interview/next` — owner. Returns `{ question, progress,
   completion, safetyStatus, rationale }` per contract §7 (question null when complete; include
   `safetyStatus` = latest triage level or 'NOT_EVALUATED', `requiresHumanReview`).
   Reconciliation with selector must be deterministic; contract example field
   `remainingEstimate` may be omitted or approximated by `activeCount` + zero (report exact).
4. `POST /api/v1/encounters/:encounterId/interview/response` — owner + consent. Body per contract
   with `state` ∈ ANSWERED|SKIPPED|DECLINED|UNKNOWN|NOT_APPLICABLE (default ANSWERED). Server:
   load input → allowed = {current next key if set} ∪ {open-state questions with
   askCount < maxAsks}; body.questionKey not in allowed ⇒ `QUESTION_NOT_ACTIVE` (400) or
   `QUESTION_ALREADY_COMPLETED` (409, terminal) — pick by state. engine.evaluateResponse →
   persist (ONE transaction): response row (state, raw, normalisedJson, confidence, language,
   codeMixed, negated, uncertain, askCount = prior + 1, modality, answeredAt, hintMismatch) →
   evidence row(s) → fact rows (symptoms/conditions/medications/allergies; socrates slot merge
   into symptomFact's socratesJson with evidenceId) → re-run engine selector (already inside
   outcome) → triage evaluation (see §7) → audit (`FACT_EXTRACTED`, or `QUESTION_SKIPPED` /
   `QUESTION_DECLINED`; `CLARIFICATION_REQUESTED` when outcome.state is NEEDS_CLARIFICATION or
   LOW_CONFIDENCE; `SAFETY_CONDITION_TRIGGERED` when a non-empty advisory argues an assessment
   red/amber level). Respond 201 `{ responseId, evidenceIds, advisories,
   nextQuestionKey, normalisationAgreed, state, progress, completion, safetyStatus }`.
   Idempotent (replay).
5. `POST /api/v1/encounters/:encounterId/interview/finish` — owner. Read-only advisory mirroring
   contract §7: `{ complete, unansweredRequired, canFinishAnyway:true }`.
6. `POST /api/v1/encounters/:encounterId/interview/language` `{ locale }` — owner. Validates
   locale supported + consent wording exists (`assertLocale`); updates encounter.locale; audit
   `INTERVIEW_LANGUAGE_CHANGED`. Response `{ locale, clinicalStatePreserved:true }`.
7. `POST /api/v1/encounters/:encounterId/submit` — owner + consent + must not already be
   SUBMITTED (409 ENCOUNTER_ALREADY_SUBMITTED). Chain: load; state validations per prompt §26
   (encounter exists/owned, session active, consent, interview exists, pathway version matches
   registry PATHWAY_VERSION — else 500 TRIAGE_RULE_SET_INVALID? no — `INTERVIEW_SESSION_NOT_ACTIVE`
   if status not ACTIVE; required info satisfied → if `status INCOMPLETE` still allowed (finish
   anyway) but report `incomplete:true` in response; unresolved clarification: allowed with
   flag; compute final triage; create/update `queue_entries` (priority from level, status
   WAITING, reason = top hit ids, evidence); encounter → SUBMITTED + submittedAt; interview
   session → COMPLETED + completedAt; timeline event; audits `ENCOUNTER_SUBMITTED`,
   `TRIAGE_TRIGGERED`. Response `{ status:'READY_FOR_REVIEW', triageLevel, priority,
   queueEntryId, incomplete, outstandingRequired }`. Idempotent (replay); different-body reuse ⇒
   409. No FHIR outbox enqueue in Phase 3 (document: the contract's FHIR enqueue stays PLANNED).

## 7. Triage integration (`triage.build.ts`)

`buildRuleEvaluationInput(input, patient, principal): RuleEvaluationInput`:
- symptomCodes = complaints + symptomFacts codes;
- symptomFacts from symptoms (severity, durationDays, onsetDate);
- answeredYesQuestionKeys = keys whose response is ANSWERED/VERIFIED and not negated;
- safetyCriticalUnresolvedQuestionKeys = active questions with category SAFETY_CRITICAL whose
  state is not terminal and askCount < maxAsks (unanswered or open);
- conditionCodes/medicationCodes/allergyCodes (allergy codes from records; fall back to
  categories? engine's allergyCategories required category strings — map from allergy_records
  category column); ageYears/sex from patient; documentCount.
`evaluateTriage(...)` → persist `TriageAssessmentRow` (level, priority via levelToPriority,
ruleSetVersion, requiresHumanReview, explanation, hitsJson = hit identifiers + descriptions,
assessedAt = now) + `timeline_events` (kind 'TRIAGE_ASSESSED', detail = level). Return summary.
**Frequency:** after every mutation that changes facts (response, submit). Persist on each
evaluation (assessment rows are snapshots; latest = `orderBy assessedAt desc limit 1`). NEVER
call evaluateTriage with a hand-built rule list; use DEFAULT_RULES.

## 8. shared-types additions

`ERROR_CODES` + `ERROR_STATUS`:
- `QUESTION_NOT_ACTIVE` 400 — answered a question the engine is not currently asking;
- `QUESTION_ALREADY_COMPLETED` 409 — re-answering a terminal question without an open state;
- `CLARIFICATION_REQUIRED` 422 — reserved for endpoints that demand clarification resolution.
No other shared-types changes. Do NOT renumber anything.

## 9. Golden E2E journey (API test `services/api/src/interview/golden-case.test.ts`)

> **Ruling (2026-09-18, Main):** the delivered engine's step-12 budget was the global minimum of
> active pathways' `completion.maxQuestions` (respiratory maxQuestions=18 truncated a chest-pain+
> dyspnoea interview before history questions → COMPLETE unreachable). Fixed in the engine:
> budgets are **per pathway** (`askedForPathway(responses, pathwayKey) >= maxQuestions` excludes
> only that pathway's questions); `completion.maxQuestionsReached` is true only when outstanding
> required work remains while every owning pathway is exhausted. The golden journey (35 answers,
> chest pain + dyspnoea + respiratory + general history, multi-select ROS) now terminates with
> `completion.status === 'COMPLETE'`; submit returns RED / EMERGENCY. Verified live over HTTP
> (`scripts/smoke-interview.cjs`) and by the golden test.

Read `buildTestApp()` from `services/api/src/testing/test-app.ts` (Phase 2; in-memory SQLite +
seed). Journey (all synthetic, clearly labelled):
1. open kiosk session (device headers, `Idempotency-Key`);
2. guest identity start (GUEST);
3. consent: treatment granted (SYMPTOMS etc.), research/analytics declined;
4. `POST /encounters` chiefComplaintCodes `['MK-SYM-001']` verbatim "seene mein dard kal se"
   locale en-IN;
5. `next` ⇒ `q.chest_pain.safety_dyspnoea` (SAFETY_CRITICAL first, rationale asserted);
6. respond YES raw "haan saans phool rahi hai" ⇒ ANSWERED, MK-SYM-002 fact, ESC-CHEST-PAIN-001
   advisory, next = `q.chest_pain.safety_sweating`;
7. sweat NO, syncope NO, cardiac_history NO;
8. site left, onset "2 hours" (DURATION), character pressure, radiation left_arm
   (MULTI_CHOICE option key), associated none, timing exertional? (hit the branch: dyspnoea YES ⇒
   exertion + relief questions appear in subsequent next calls), severity severe;
9. general history: medications free text "metformin", allergies none;
10. assert deterministic question order equals the expected list exactly at each step
    (branch question only after dyspnoea YES);
11. after completion ⇒ `next.question === null` && completion status COMPLETE;
12. submit ⇒ 200 READY_FOR_REVIEW, triageLevel RED (chest pain + dyspnoea ⇒
    CHEST_PAIN_HIGH_RISK_001; SpO2 absent is fine — the rule fires on evidence-gated
    symptom combination), queueEntry EMERGENCY;
13. DB assertions: responses immutable (raw preserved), evidence rows point at response ids,
    symptom rows exist w/ socrates slots carrying evidence ids, assessment row with hitsJson
    containing `CHEST_PAIN_HIGH_RISK_001`, encounter SUBMITTED, interview session COMPLETED,
    audit has ENCOUNTER_CREATED/INTERVIEW_STARTED/FACT_EXTRACTED/ENCOUNTER_SUBMITTED/
    TRIAGE_TRIGGERED;
14. replay submit with SAME idempotency key ⇒ same body; different key ⇒ 409.

Also in this file or sibling `interview/security.test.ts`: cross-session read/respond ⇒ 404/401;
consent revoked mid-interview ⇒ response 403 CONSENT_REVOKED and submit 403; expired session ⇒
SESSION_EXPIRED; unknown question ⇒ QUESTION_NOT_ACTIVE; re-answer terminal ⇒
QUESTION_ALREADY_COMPLETED. Reuse `buildTestApp`.

## 10. Kiosk UI (`apps/kiosk`)

Only after the API slice is verified. The UI is a pure client of the runtime:
- New screen after consent receipt: "Clinical interview" driving
  `GET …/interview/next` → render by `kind` (YES_NO two buttons; SINGLE_CHOICE/MULTI_CHOICE
  option cards from `options`; SEVERITY scale; DURATION/NUMBER/date inputs; FREE_TEXT input;
  INSTRUCTION acknowledge) → `POST …/interview/response` with TOUCH modality (rawAnswer = option
  key for options, text otherwise) → render next. Skip/Decline/Unknown buttons per question
  (SKIPPED / DECLINED / UNKNOWN). Progress bar from `progress`. Safety banner when
  `safetyStatus !== 'GREEN'` or `requiresHumanReview` — patient-facing wording from
  `TRIAGE_PATIENT_MESSAGE_KEYS` philosophy: "Priority assessment required" + "please wait for
  staff", never a diagnosis. Clarification: when `state` NEEDS_CLARIFICATION/LOW_CONFIDENCE, show
  the same question again with the prior answer visible. Finish button once
  `question === null`; then submit. Wipe/inactivity behavior already exists (Phase 2 App.tsx).
- NO branching logic in the UI. NO hardcoded question flows. Locale strings via i18n keys added
  to `packages/i18n` (registration + new interview keys) for en-IN/hi-IN/mr-IN (provisional).
- No new dependencies. Follow the existing style (plain CSS, App.tsx state machine).

## 11. Documentation

- `docs/adr/ADR-012-interview-runtime.md` — decisions: derived-vs-persisted interview state;
  deterministic selector priority; evidence linking (response→evidence→fact/socrates);
  clarification via response states (no bespoke state); escalation is advisory + triage-owned;
  submission doesn't block on incompleteness (finish-anyway, never coerce); no LLM.
- `docs/interview/DOMAIN.md` — state machine diagram (mermaid), response lifecycle, completion
  rules, error model, future AI integration points.
- `docs/api/CONTRACT.md` — update §6/§7 to implemented reality (mark fields added/removed; add
  encounter/interview/response/submit responses as implemented; note `remainingEstimate`
  replaced by `activeCount`; delete nothing).
- `docs/BASELINE.md` roadmap rows 3 (interview engine) and 6/7 (vitals/queue partially) :
  Phase 3 ⇒ PARTIALLY IMPLEMENTED runtime + API; keep honesty labels.
- `docs/LIMITATIONS.md` — append Phase 3 status (interview runtime IMPLEMENTED; no ASR/OCR/LLM
  still).
- `docs/deployment/LOCAL.md` — add interview smoke steps.
- `handoff.md` — rewrite at the end (repository handoff-generation procedure = rewrite to match
  measured state; no script exists).

## 12. Quality gates + commit plan

- After each slice: run ONLY that slice's tests + `tsc` for touched packages.
- At integration: `npm run build && npm run typecheck && npm run lint && npm test &&
  npm run format:check` (full suite must stay green; Phase 2's 27 tests must not regress).
- Clean-DB migration check: `node node_modules/tsx/dist/cli.mjs services/api/src/db/migrate-cli.ts`
  on a fresh sqlite; seed; boot; smoke.
- Commits (clean milestones; do not push):
  1. `feat(interview-engine): deterministic interview runtime package + tests`
  2. `feat(api): encounter + interview runtime endpoints, evidence, triage integration, migration 0015`
  3. `feat(kiosk): interview screen consuming interview APIs`
  4. `docs: ADR-012, interview domain docs, contract/baseline/limitations updates`
- Final report per master prompt §46 in the last message.

## 13. Implementers

Each implementer reads THIS FILE in full plus the files listed in its brief. No subagents inside
implementers. Implementers must NOT run project-wide validation (`npm run build` root, full
suite, lint) — Main owns integration; per-slice `tsc`/targeted vitest is allowed and required.
Skip formatters unless the slice's own files are new (then format them). Do not edit root
`package.json` — Main does the workspace wiring.