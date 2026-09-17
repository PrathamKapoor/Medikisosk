# MediKiosk — Project Handoff

Written 2026-09-18 after **Phase 3 (interview runtime)**. Inspect the repository before acting on
any statement; this was written from the files on disk and fresh verification runs, not memory.

---

## 1. Current Phase

- **Phase:** 3 of 21 — deterministic, persistent, versioned clinical interview runtime.
  **Status: COMPLETE** (engine + API + kiosk UI + docs; all quality gates green).
- Master prompt: `MEDIKIOSK — PHASE 3: CLINICAL INTERVIEW RUNTIME`. Authorities:
  `docs/api/CONTRACT.md` §6–§7, `docs/adr/ADR-012-interview-runtime.md`,
  `docs/PHASE-3-PLAN.md`, `docs/interview/DOMAIN.md`.
- **Phases not started:** 4 voice/ASR/TTS, 5 documents/OCR, 6 vitals workflow, 8 AI
  synthesis/SOAP, 9 physician console, 10 AYUSH runtime, 11 FHIR, 12 ABDM, 13 HIS/EMR, 14
  offline/sync, 15 analytics, 16 evaluation harness, 17 security hardening, 18 deployment, 19
  E2E clinical validation, 20 SIH polish, 21 startup. All remain PLANNED except where noted in
  `docs/BASELINE.md`.

---

## 2. What was built (Phase 3)

### 2.1 `packages/interview-engine` (NEW, pure, DB-free, LLM-free)

`types.ts` (`INTERVIEW_RUNTIME_VERSION = "1.0.0"`, `ResponseRecord`, `InterviewInput`,
`QuestionView`, `ProgressView`, `InterviewStatus`, `CompletionView`, `NextQuestionResult`,
`FactDelta`, `EscalationAdvisory`, `ResponseOutcome`, `ResponseRequest` incl. injected `now`),
`context.ts` (`buildTriggerContext`, `stateFor`, `askCountFor`, `askedForPathway`), `pathways.ts`
(`selectActivePathways`, `activePathwayKeys` — branch-gated), `selector.ts` (`selectNextQuestion`,
`computeSocratesRatio`), `respond.ts` (`evaluateResponse` — kind-aware normalisation incl.
YES_NO lexicon en/hi/mixed, SINGLE/MULTI/BODY_SITE options, SEVERITY, DURATION, NUMBER, DATE,
FREE_TEXT; multi-select joins `; `; partial-unknown set ⇒ NEEDS_CLARIFICATION), `complete.ts`
(`computeCompletion`, `exhaustedPathways`).

Key semantics (ADR-012):
- Interview state is **derived** from `questionnaire_responses` + facts; the "current question"
  is never stored.
- Selection: (category priority rank, pathway priorityRank, pathway order); open states
  (LOW_CONFIDENCE/NEEDS_CLARIFICATION/CONTRADICTORY/SKIPPED) re-asked while `askCount <
  maxAsks`; **budgets are per pathway** (`askedForPathway >= pathway.completion.maxQuestions`);
  `maxQuestionsReached` only when outstanding work remains but every owning pathway is
  exhausted (Main ruling — the delivered global-min budget made COMPLETE unreachable for
  chest-pain+dyspnoea and was fixed).
- DECLINED/UNKNOWN/NOT_APPLICABLE terminal + evidenceExpected; SKIPPED open; never coerced.
- Completion: required-question terminal states + SOCRATES required ratio (profiles from
  clinical-schema `SOCRATES_PROFILES` — new registry, chest pain only so far).
- 29 unit tests (determinism, branching, YES_NO, declined≠unknown≠skipped, retry/askCount,
  completion+SOCRATES, per-pathway budget, escalation advisory, context polarity,
  MULTI_CHOICE union/clarification, hint mismatch).

### 2.2 API runtime (`services/api/src/interview/`)

- `types.ts`, `state.repo.ts` (load InterviewInput from DB; persist response → evidence → facts
  → triage → queue; encounter + interview session rows), `triage.build.ts`
  (`buildRuleEvaluationInput` → `evaluateTriage(DEFAULT_RULES)` → `TriageAssessmentRow` +
  `timeline_events`; hit evidence resolved from symptom SOCRATES slot evidence ids),
  `interview.service.ts`, `interview.routes.ts`.
- Routes: `POST /encounters`, `GET /encounters/:id`, `GET .../interview/next`,
  `POST .../interview/response`, `POST .../interview/finish`, `POST .../interview/language`,
  `POST .../encounters/:id/submit`. Kiosk-session auth + ownership; staff `patient.read` for
  reads. Consent guard `requireConsent(treatment/SYMPTOMS/CLINICAL_INTAKE/TREATING_HOSPITAL)`
  in-transaction before every clinical write. Idempotency via Phase 2 `replayMutation`
  (routes `encounter.create`, `interview.response`, `interview.submit`, `interview.language`).
- `app.ts` registers the service + routes; `platform/audit.ts` gained `INTERVIEW_STARTED`,
  `QUESTION_SKIPPED`, `QUESTION_DECLINED`, `CLARIFICATION_REQUESTED`,
  `SAFETY_CONDITION_TRIGGERED`, `TRIAGE_EVALUATED`.
- Migration `0015-interview-runtime.ts`: `interview_sessions` table (lifecycle-only bookkeeping
  + pathwayKeys/pathwayVersion/runtimeVersion), `questionnaire_responses.hintMismatch` column,
  encounter index. Row types updated (`InterviewSessionRow`, `hintMismatch`).
- Tests: `golden-case.test.ts` (35-question chest-pain+dyspnoea journey ⇒ COMPLETE, submit RED/
  CHEST_PAIN_HIGH_RISK_001/EMERGENCY, DB spine assertions, replay) + `security.test.ts`
  (cross-session 404, SESSION_EXPIRED, CONSENT_REVOKED mid-interview, QUESTION_NOT_ACTIVE,
  QUESTION_ALREADY_COMPLETED). 6/6; Phase 2 suites stay green.

### 2.3 Kiosk UI (`apps/kiosk` + `packages/i18n`)

- `src/Interview.tsx` — pure client of the runtime: chief-complaint picker
  (`CHIEF_COMPLAINT_STARTER_CODES` from `@medikiosk/clinical-schema`, now via a Vite source
  alias) → `POST /encounters` → loop `GET next`/`POST response` (TOUCH, idempotency) → render by
  kind (YES_NO, SINGLE/MULTI options — multi-select toggle + confirm, SEVERITY, DURATION/
  NUMBER/FREE_TEXT/DATE inputs, INSTRUCTION, DOCUMENT_UPLOAD → skip/decline notice) → completion
  → `POST submit` → patient-safe result screen (GREEN/AMBER/RED) → finish-and-clear.
- Non-coercive UNKNOWN/SKIP/DECLINE always available; clarification notice with preserved
  previous answer; priority banner ("Priority assessment required…" — never a diagnosis) when
  `safetyStatus ≠ GREEN || requiresHumanReview`; `QUESTION_NOT_ACTIVE` ⇒ refetch; 401/expired ⇒
  wipe; 503 ⇒ retry notice.
- **Receipt gating fix (Main):** "Begin clinical interview" is hidden when the saved consent
  grants no treatment scope (`stopRequired`, e.g. default no-categories consent). Adding the
  notice `interview.consent_required_notice` (en/hi/mr). Without this the UI dead-ended in a
  403 retry loop; found live, fixed, re-verified.
- `packages/i18n/src/interview.ts` — `interview.*` keys en-IN/hi-IN/mr-IN (31 keys, non-English
  PROVISIONAL); registered in catalogue + exports; verify excludes `interview.*` for the five
  browseable-only locales (they cannot reach the interview).
- `vite.config.ts` — src aliases for `@medikiosk/i18n`, `@medikiosk/clinical-schema`,
  `@medikiosk/shared-types` (the compiled CJS `__exportStar` cannot be statically resolved by
  Rollup); `preview.proxy` added.
- UI live-verified against the real API in the **production preview build** (Vite dev HMR
  reloads were flaky): "Are you short of breath?" rendered with Yes/No + I don't know/Skip/
  Prefer not to answer; Yes → "Are you sweating heavily?" + the priority banner appeared.

### 2.4 Docs

`docs/adr/ADR-012-interview-runtime.md` (10 decisions + alternatives), `docs/interview/DOMAIN.md`
(state machine, response lifecycle, completion, triage, errors, failure modes, AI points),
`docs/PHASE-3-PLAN.md` (binding plan + budget ruling), CONTRACT §6–§7 implementation notes,
BASELINE roadmap rows 2/3/7 updated (2 and 3 COMPLETE; 7 PARTIALLY — no queue UI),
LIMITATIONS §12 Phase 3 status, LOCAL.md interview smoke.

---

## 3. Verification (all fresh, all green)

| Gate | Result |
|---|---|
| `npm run build` (foundation 7 pkgs + kiosk) | PASS |
| `npm run typecheck` (+ kiosk tsc, tsconfig.test.json) | PASS |
| `npm run lint` (eslint --max-warnings 0) | PASS |
| `npm test` (vitest) | **62/62** — engine 29, triage 10, migrate 2, auth 6, lifecycle 7, tokens 2, golden 1, security 5 |
| `npm run format:check` | PASS |
| Live HTTP golden journey (`scripts/smoke-interview.cjs`, fresh DB + server) | 35 questions; first=q.chest_pain.safety_dyspnoea; branch present; **completion COMPLETE**; safety RED+requiresHumanReview; submit READY_FOR_REVIEW/RED/EMERGENCY/incomplete:false; DB: 35 responses ↔ 35 evidence rows (PATIENT_REPORTED), symptoms incl. MK-SYM-002, assessment hits CHEST_PAIN_HIGH_RISK_001; multi-select ROS union (fever+cough) |
| Live browser (preview build + real API) | consent categories granted → receipt → chief complaint → "Start the interview" → "Are you short of breath?" → Yes → next question + priority banner |

Scripts kept: `scripts/smoke-interview.cjs` (needs `SMOKE_KIOSK_ID` + `SMOKE_DB`).

---

## 4. Known issues / limitations

1. **Consent default grants nothing** (Phase 2 design, conservative): the UI enforces explicit
   category selection; receipt now explains when the interview can't start.
2. **SOCRATES profiles only for chest pain**; other complaints impose no SOCRATES completion
   requirement (data addition, not engine change).
3. **Pathway-version replay is current-version only**: encounters record `pathwayVersion` +
   pathway keys, but only `PATHWAY_VERSION` ("1.0.0") exists as data; re-interpreting against an
   older version is PLANNED (LIMITATIONS §12).
4. **Many non-interview base option labels lack translations** (gu/ta/te/bn/kn + some en keys);
   UI falls back to the canonical slug — honest, documented, PRE-EXISTING.
5. **Vite dev-server HMR reload flakiness** during long browser drives (dev artifact, not app);
   the production preview build drives reliably.
6. `docs/LIMITATIONS.md` §2.3 snapshot still predates later phases; §12 is the current status.
7. Postgres dialect still never executed (no server); SQLite is the executed path.
8. `docs/BASELINE.md` rows 1 and 0 remain labelled PARTIALLY (phase-1 row is stale — Phase 1 is
   effectively complete; re-label on next touch).

## 5. Working state / next steps

- git: `4e497c8` (P1), `0a4a28e` (P2), `c8e7eab` (docs). **Phase 3 changes are UNCOMMITTED.**
  Suggested commit split: (1) engine package, (2) api runtime + migration, (3) kiosk + i18n,
  (4) docs.
- Working tree: clean check before commit; `npm ci` needed after any new workspace changes
  (interview-engine already `npm install`ed).
- Next phase candidates (priority): **Phase 4 voice/touch fallback** (provider abstraction,
  browser WebSpeech + touch fallback — kiosk already touch-capable), **Phase 9 physician
  console** (needs encounter GET + triage/queue reads, now available), or **Phase 7 triage
  queue console** (queue entries exist; no UI). Master prompt's Phase order applies.
- Demo recipe: `docs/deployment/LOCAL.md` + backend/ui smoke recipes in `local://backend-report.md`
  / `local://ui-report.md` (agent reports; may be transient — key facts are in this handoff).

## 6. Critical context (unchanged conventions — do not break)

- Rebuild order: shared-types → clinical-schema → interview-engine → auth → i18n → safety-rules
  → api (root `build:foundation`). `dist/` staleness + running process = old behavior (Phase 2
  lesson). Vite kiosk uses source aliases for the three packages.
- PowerShell `;` separators, `C:/` paths, tsx at repo root.
- Errors via `MediKioskError`/`ERROR_CODES` (new: QUESTION_NOT_ACTIVE 400,
  QUESTION_ALREADY_COMPLETED 409, CLARIFICATION_REQUIRED 422).
- Audit PHI-free; tenant from principal; 404 not 403 cross-tenant; `Idempotency-Key` UUID/ULID
  required on every mutation; consent guard in the service layer.
- Determinism rules: no `Date.now()` in the engine (injected `now`); no LLM anywhere; triage
  only by `evaluateTriage`.
- Demo device token `dev-kiosk-token-opd-a-2-replace-me`; staff `demo-pass-1234`; consent
  version `1.1.0` (treatment/research/analytics, action/destination scoped).

**Next objective:** commit Phase 3 (4 clean commits), then proceed to the next master-prompt
phase — recommend Phase 4 (voice + touch fallback) with the kiosk's existing touch-first
interview as the fallback baseline.