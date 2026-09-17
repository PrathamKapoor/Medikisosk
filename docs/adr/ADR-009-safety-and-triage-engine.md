# ADR-009 — Safety and triage: deterministic rule engine, never an LLM

**Status:** Accepted
**Date:** 2026-09-15

## Context

MediKiosk must route a patient with chest pain and dyspnoea to priority human triage. This is the
highest-consequence decision in the system. If it is wrong in the direction of *under*-triage, a
patient may come to harm.

An LLM cannot be the authority here, for four independent reasons:
1. **Non-determinism** — the same patient could receive a different triage level on a retry.
2. **Non-auditability** — "the model thought so" is not a defensible explanation to a clinician.
3. **No bounded error** — there is no way to prove the set of emergencies it can miss.
4. **Prompt injection** — uploaded document text is attacker-influenced input; an LLM in the safety
   path can be steered.

Equally, a bare red banner is bad product design: "Emergency detected" with no reasoning gives a
clinician nothing to act on and creates alarm fatigue.

## Decision

**A deterministic, versioned, rule-based safety engine is the sole triage authority.**

```
Symptoms + Vitals + Demographics + Risk factors + Extracted history
                              |
                     RedFlagRuleSet (versioned, data-driven)
                              |
              GREEN  |  AMBER  |  RED   + named red flags + evidence refs
```

Every rule declares:
`identifier`, `description`, `trigger` (declarative and evaluated deterministically),
`evidence_required`, `severity`, `action`, `version`, `clinical_rationale`, `source`.

Rule identifiers are stable and human-readable, for example:
- `CHEST_PAIN_HIGH_RISK_001` — chest pain **and** dyspnoea -> RED, immediate human triage
- `CHEST_PAIN_HIGH_RISK_002` — chest pain with radiation to arm/jaw, or diaphoresis -> RED
- `STROKE_SCREEN_001` — sudden severe headache with focal neuro deficit or neck stiffness -> RED
- `SEPSIS_SCREEN_001` — fever with tachycardia **and** tachypnoea -> AMBER/RED
- `HYPOXIA_001` — SpO2 below threshold -> RED
- `HYPOTENSION_001` — systolic BP below threshold -> AMBER
- `HYPERGLYCAEMIA_CRITICAL_001` / `HYPOGLYCAEMIA_CRITICAL_001` — from lab or glucometer
- `PEDIATRIC_FEVER_001`, `PREGNANCY_BLEEDING_001`, `TRAUMA_MECHANISM_001`
- `SELF_HARM_RISK_001` — explicit risk statement -> immediate human escalation

Design rules enforced in code:
1. **`evidence_required` is mandatory.** A rule that fires without evidence is a bug, and the engine
   returns the fired rule with its evidence IDs so the UI can show them.
2. **Fail-safe on missing data.** Unknown or unanswered safety-critical fields produce a
   `DATA_INCOMPLETE` advisory that requires human review. The engine never treats "not asked" as
   "not present". This is the mechanism that makes under-triage from silence impossible by default.
3. **The engine can escalate, never de-escalate a clinician.** A physician may override the triage
   level and the override is recorded with identity, timestamp and reason. The system never
   overrides the clinician.
4. **Versioning.** The active `RedFlagRuleSet` version is recorded on every `TriageAssessment`, so
   any historical triage decision can be replayed against the rule set that produced it.
5. **Explainability in the UI (WOW #5).** The physician sees what the system saw:

```
PRIORITY ASSESSMENT REQUIRED
  chest pain  +  shortness of breath  +  abnormal vital
  -> Immediate human triage recommended
  Rule: CHEST_PAIN_HIGH_RISK_001 (v1.0.0)
  Evidence: SYM-012, SYM-017, VITAL-004
```

**Triage output drives a real queue** with levels `EMERGENCY | URGENT | ROUTINE` and statuses
`WAITING | CALLED | IN_CONSULTATION | COMPLETED | CANCELLED`, with real-time updates to the triage
console.

**Honest limits.** The shipped rule set is a curated starter set, not a validated clinical decision
instrument. Rule sensitivity and specificity are measured by the evaluation harness against
synthetic ground truth, and the measured values are reported as `MEDIKIOSK BENCHMARK RESULT` —
never presented as clinical validation. Sensitivity is reported with its explicit limitation:
**synthetic evaluation cannot substitute for prospective clinical validation.** The system is a
safety *net*, not a safety *guarantee*, and this is stated in the product, the README and
**Honest limits.** The shipped rule set is a curated starter set, not a validated clinical decision
instrument. Rule sensitivity and specificity are measured by the evaluation harness against
synthetic ground truth, and the measured values are reported as `MEDIKIOSK BENCHMARK RESULT` —
never presented as clinical validation. Sensitivity is reported with its explicit limitation:
**synthetic evaluation cannot substitute for prospective clinical validation.** The system is a
safety *net*, not a safety *guarantee*, and this is stated in the product, the README and
`docs/LIMITATIONS.md`.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| LLM as triage authority | Non-deterministic, unauditable, unbounded error, injectable. Unacceptable in a safety path |
| LLM proposes and deterministic rules confirm | Adds cost, latency and a failure mode while the rules remain the actual authority; the LLM contributes nothing to the decision |
| Machine-learned triage model | Requires labelled clinical data that does not exist here; an unvalidated black box in a safety path is worse than explicit rules |
| Rules hard-coded in TypeScript | New clinical knowledge would require a code release; a hospital could not tune sensitivity to its own escalation capacity. Rules are data, versioned, auditable and admin-editable |
| Triage only on explicit vitals, ignoring symptoms | Would miss the most important presentation (chest pain + dyspnoea with normal vitals at rest), which is precisely the case the product exists to catch |
| Treat unanswered as negative | Directly creates under-triage from silence, the most dangerous possible default |

## Consequences

**Positive**
- Triage is reproducible, testable, explainable and defensible to a clinician.
- The evaluation harness can compute real sensitivity, specificity, false-negative and
  false-positive rates, because the engine is deterministic.
- A hospital can tighten or relax thresholds for its own escalation capacity without a code change.
- Prompt injection cannot influence triage: rule evaluation never consults model output.

**Negative / accepted**
- Rule authoring and review is a clinical responsibility, flagged as `TD-06` debt with an explicit
  repayment trigger (clinical advisory review).
- A deterministic rule set will both over- and under-trigger relative to expert judgement. This is
  measured and reported rather than hidden; the design bias is deliberately toward over-triggering,
  because a false positive costs a clinician's minute while a false negative can cost a life.
- More tables, versions and audit rows than a simple boolean flag. Accepted: this is the part of the
  system where auditability matters most.