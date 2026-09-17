# ADR-008 — Interview engine: structured pathways, not a monolithic LLM prompt

**Status:** Accepted
**Date:** 2026-09-15

## Context

The central product capability is an adaptive clinical interview that behaves like a competent
clinician taking a history: it characterises the chief complaint, follows the complaint's own
logic, asks safety-critical questions early, and stops when it has enough.

The tempting implementation is one large prompt containing the whole history and asking an LLM
"what should I ask next?". This is rejected. It would mean:

- the interview cannot be audited (why was this question asked?),
- the interview cannot be measured (is this question necessary?),
- the interview cannot be versioned or clinically reviewed,
- coverage cannot be guaranteed (the model may never ask about allergies),
- the same input may produce different interviews (non-reproducible, so unmeasurable),
- and clinical safety questions could be silently skipped.

## Decision

Implement a **deterministic interview engine with explicit clinical pathways**, in which the LLM is
at most an assistant for phrasing and summarisation.

```
InterviewSession
   -> ClinicalContext        (facts established so far, with confidence)
   -> QuestionPolicy          (which pathways are active)
   -> CandidateQuestions      (generated from active pathways + open SOCRATES dimensions)
   -> Priority                (safety-critical first, then complaint characterisation, ...)
   -> Question
   -> PatientResponse         (raw + normalised, never destroying the raw)
   -> Extraction              (structured facts)
   -> Evidence                (immutable)
   -> StateUpdate             (SOCRATES/context updated)
   -> NextQuestion            (or completion)
```

**Response states are explicit and distinct**, because collapsing them is a clinical error:
`UNANSWERED`, `ANSWERED`, `SKIPPED`, `DECLINED`, `UNKNOWN`, `CONTRADICTORY`, `LOW_CONFIDENCE`,
`NEEDS_CLARIFICATION`, `VERIFIED`. In particular **"no known allergies" and "patient did not
answer" are different states** and are never conflated.

**Question priority order** (fixed and testable):
1. safety-critical information
2. chief-complaint characterisation (SOCRATES dimensions relevant to *that* complaint)
3. relevant history (comorbidities, medications, allergies)
4. medication and allergy risk
5. contextual history (family, personal, social, AYUSH)
6. completeness

**Pathways are data, not code.** Each pathway declares: entry condition, required questions,
optional questions, branching conditions, escalation conditions, and completion criteria. They are
versioned and stored as `Questionnaire`/`Question` rows so a hospital can adjust them from the
admin console without a code change (with the change audited and versioned).

Pathways shipped: chest pain, fever, cough/respiratory, headache, abdominal pain, diabetes,
hypertension, trauma, pregnancy, pediatric, elderly/general, and AYUSH Dashavidha Pariksha.

**SOCRATES relevance is per-complaint.** Chest pain triggers a cardiac-oriented SOCRATES variant
(radiation to arm/jaw, exertional exacerbation, associated dyspnoea/diaphoresis); headache triggers
a neuro-oriented variant (sudden onset/"worst ever", photophobia, neck stiffness, neuro deficit);
abdominal pain triggers a GI variant (site migration, relation to food, bowel/vaginal bleeding).
Asking every complaint every SOCRATES dimension is a clinical error, not thoroughness.

**The LLM's permitted role:** rephrase a question more naturally in the patient's language, and
summarise already-established facts. It may **not** decide which question comes next, may not skip a
safety question, and may not introduce a new clinical fact. This keeps the interview reproducible
and auditable while still feeling natural.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Single monolithic LLM prompt deciding the interview | Unauditable, unmeasurable, non-reproducible, no coverage guarantee, and unsafe (may omit allergy/medication questions) |
| A pure fixed questionnaire with no adaptation | Less relevant information for the same or greater patient burden; the adaptive engine measurably reduces unnecessary questions |
| Fully scripted decision tree with no LLM at all | Loses natural, language-appropriate phrasing in Indian languages, which is a core requirement |
| Bayes-net / formal diagnostic inference driving questions | Approximates a diagnostic system, which MediKiosk explicitly must not be; it also requires calibrated priors that are unavailable and unvalidated |
| LLM with function-calling over a question bank but with no deterministic ordering | Ordering would become non-deterministic and safety questions could be deferred; determinism is required for measurement and audit |

## Consequences

**Positive**
- Every question has a recorded reason, so the interview is fully explainable.
- Coverage is guaranteed by construction, and is asserted by tests.
- The interview is reproducible, so `evaluation/interview` can measure question count, duration,
  completeness, unnecessary-question rate and safety-question coverage across software versions.
- Adding a new complaint is adding data plus tests, not changing engine logic.
- The engine is language-independent: all state is stored in the canonical clinical model, so the
  patient can switch language mid-interview without losing clinical state (a WOW feature that falls
  out of the architecture rather than being bolted on).

**Negative / accepted**
- Pathways must be authored and clinically reviewed. The shipped set is a curated starter set; rule
  and pathway clinical content is flagged `TD-06` and requires clinical advisory review before
  real-world clinical use.
- Deterministic ordering can feel mechanical. Mitigated by LLM-assisted phrasing, which changes how
  a question sounds without changing which question is asked.