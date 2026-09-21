# MediKiosk clinical safety

MediKiosk is an intake and information-structuring aid. It does not diagnose, prescribe, or
make autonomous clinical decisions, and the UI never presents a system signal as a diagnosis.

## How safety is produced

1. **Deterministic rules only** (`@medikiosk/safety-rules`, versioned `RULE_SET_VERSION`).
   The same inputs always yield the same level (GREEN/AMBER/RED) and priority
   (ROUTINE/URGENT/EMERGENCY). No LLM participates in selection, triage or safety wording.
2. **No hit without evidence.** A rule whose trigger is true but whose `evidenceRequired`
   facts are absent does not fire; the non-firing is recorded in the explanation.
3. **Negatives are never inferred.** Denied symptoms are excluded from rule inputs; unresolved
   safety-critical questions are reported, never treated as "no".
4. **Implausible readings are excluded** from rule evaluation (they are retained and flagged,
   and out-of-range kiosk entries are rejected with friendly messages).
5. **Vitals, labs and documents feed the engine** (`triage.build`), re-evaluated after every
   fact-changing mutation — including clinician verification.

## How safety is shown

- Kiosk: "Priority assessment required…" wording (patient-safe keys `interview.*`), never a
  condition name. RED routes the patient to staff immediately.
- Console: rule identifier, description, clinical rationale and source per hit; the rule set
  is labelled a curated starter set pending clinical review.
- Summaries tag the section `SYSTEM-GENERATED ATTENTION SIGNALS, not diagnoses`.

## What is NOT claimed

- The starter rule set has not been prospectively clinically validated.
- Browser speech is not validated for Indian languages and always falls back to touch.
- Mock OCR recognises synthetic fixtures only; unrecognised content yields nothing.
- No DPDPA, clinical-governance or deployment review has occurred (see LIMITATIONS.md).
