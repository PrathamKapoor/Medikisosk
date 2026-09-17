# ADR-012 — Deterministic interview runtime

**Status:** Accepted (2026-09-18, Phase 3)
**Related:** ADR-005 (evidence), ADR-008 (interview engine), ADR-009 (triage), ADR-007 (consent),
`docs/api/CONTRACT.md` §6–§7, `docs/PHASE-3-PLAN.md` (operational detail).

## Context

MediKiosk's interview is the product's clinical core: patient speech/touch becomes structured,
evidence-backed history that a deterministic safety layer evaluates and a physician later
verifies. Phase 1–2 delivered the vocabulary (pathways, questions, triggers, SOCRATES profiles in
`@medikiosk/clinical-schema`), the triage rule engine (`@medikiosk/safety-rules`), sessions,
identity, consent and idempotency — but no runtime that drives an interview from domain state.

The runtime must work with no UI, no voice, no ASR, no LLM, no OCR; be fully testable through
domain logic and APIs; and never let a model decide question progression or triage.

## Decision

**1. Interview state is derived, not stored.** `questionnaire_responses`, `symptoms`,
`medications`, `allergy_records`, `history_entries` and `evidence` are the source of truth. The
"current question", completion status, clarification state and safety status are pure functions
of that history + the recorded pathway set. A thin `interview_sessions` row persists only
lifecycle bookkeeping (ACTIVE → COMPLETED/ABANDONED), the active pathway keys, the pathway
version and the runtime version against which history must be interpreted. Storing a redundant
"current question" would create a second source of truth that can drift from the answer history.
Rationale: replay safety (master prompt §5, §32) and testability; cost if wrong: each `next`
call recomputes the full selection (bounded: ≤ ~70 keys, trivial).

**2. Selection is deterministic and priority-ordered.** For every active pathway (entry
condition evaluated against the current trigger context, ordered by `priorityRank`), take
`activeQuestionKeys` (honours declared branches), apply age bounds, dedupe across pathways, then
sort by (category priority rank, pathway priority rank, pathway order). Candidates are questions
that are unanswered or in an open state (`LOW_CONFIDENCE`/`NEEDS_CLARIFICATION`/`CONTRADICTORY`/
`SKIPPED`) with `askCount < maxAsks`. Safety-critical questions therefore always come first, an
interrupted interview still carries what the triage engine needs, and a question is re-asked (not
dropped) while clarification is unresolved — but never more than `maxAsks` times (a loop guard).
A per-pathway `completion.maxQuestions` budget stops asking a pathway beyond its budget.

**3. Clarification is a response state, not a new subsystem.** An unusable answer
(empty, ambiguous polarity "haan nahi", unparseable number/date, confidence < 0.5) is persisted
as `NEEDS_CLARIFICATION` / `LOW_CONFIDENCE` with the raw text intact, and the selector then
re-offers the same question (`askCount` + 1). Resolution is a new response row. This preserves
every answer, keeps history reconstructable, and reuses the existing `response-state` vocabulary
rather than inventing a parallel state.

**4. `DECLINED` / `UNKNOWN` / `SKIPPED` are first-class and never coerced.** They follow
shared-types `isTerminal`/`isOpen`: declined/unknown/not-applicable close a topic and still
generate an evidence row (a refusal is itself a fact); skipped leaves the topic open and the
question re-askable, and required-but-skipped keeps the interview `INCOMPLETE`. "Finish anyway"
is advisory-only — blocking a patient who declined would be coercion (contract §7).

**5. Evidence is written before the fact that references it.** Each answered response creates an
`evidence` row (`type QUESTIONNAIRE_RESPONSE`, `source questionnaire_response`, `sourceRef` =
response row id, `originClass PATIENT_REPORTED`, raw + server-normalised JSON, confidence,
language). Symptom rows carry the evidence id inside their SOCRATES slot maps; condition /
medication / allergy rows are similarly traceable. AI or document-derived sources attach to the
same model in later phases; Phase 3 creates only patient-reported evidence and does not fake any
other source.

**6. Escalation is advisory; triage is rule-owned.** Pathway `escalation` entries produce
advisories (explainable, non-acuity). The only authority that sets a level is
`evaluateTriage` from `@medikiosk/safety-rules` (ADR-009). A RED/AMBER result does not stop data
collection: the interview continues, the assessment row is persisted after every fact change, and
routing happens at submission (queue entry priority). `SAFETY_ESCALATION` is a *derived display
state* (latest assessment non-GREEN or `requiresHumanReview`), never a stored field that could
stale.

**7. Consent enforcement is mechanical, in the service layer.** Every clinical write passes
`requireConsent(..., purpose 'treatment', category 'SYMPTOMS', action 'CLINICAL_INTAKE',
destination 'TREATING_HOSPITAL')` inside the same transaction as the write. Revocation stops new
responses and submission immediately (403 `CONSENT_REVOKED`); already-persisted clinical rows are
retained per retention policy (deleting the record of care would be the real failure).

**8. Submission is idempotent and non-blocking on completeness.** `submit` replays via the Phase 2
`Idempotency-Key` mechanism; it finalizes triage, creates/updates the queue entry, transitions the
encounter to `SUBMITTED` and the interview session to `COMPLETED` atomically. An incomplete
interview (patient declined/skipped required questions) submits with `incomplete: true` and the
outstanding list — the patient's right not to answer is respected, and the physician sees exactly
what is missing.

**9. No LLM anywhere in Phase 3.** Normalization is lexicon- and rule-based (existing
`normaliseAnswer` + question kinds); question selection, completion and triage are pure and
deterministic. Future `ModelProvider`-backed polish plugs into the same evidence model.

**10. Versioning.** Each encounter records `pathwayVersion` (registry `PATHWAY_VERSION`) and the
interview runtime version; responses are self-contained rows. Changing a future pathway version
must not change how a historical encounter is interpreted (replay against the recorded version;
versions other than the current one are not yet available as data — flagged in LIMITATIONS).

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Store the current question on the session row | Drift risk; replay and determinism harder; killed by decision 1 |
| LLM-driven progression | Violates ADR-009 and the master prompt §6/§10/§33; non-reproducible |
| Clarification as a separate manual state machine | Duplicates response-state semantics; more transitions to get wrong |
| Block further collection on RED/AMBER | More information is clinically valuable and never worsens routing; escalation is human-owned |
| Block submission when incomplete | Coerces patients who declined; the prompt itself mandates finish-anyway |

## Consequences

**Positive:** the interview is fully deterministic and testable without any UI; the physician can
answer "what did the patient say / when / what fact / what evidence / which rule / why next
question"; safety is explainable; Phase 4+ attach ASR/OCR/LLM and other provenance sources to the
same evidence spine.

**Accepted costs:** recomputation per `next`/response is O(history) (small); `SOCRATES_PROFILES`
currently covers only chest pain (others are data additions, not engine changes); the golden
interview journey is the single end-to-end fixture until the evaluation harness exists (Phase 16).