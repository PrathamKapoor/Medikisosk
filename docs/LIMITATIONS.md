# LIMITATIONS

**Status of this document:** authoritative limitation register for MediKiosk.
**Snapshot date:** 2026-09-15.
**Scope:** every capability claim made anywhere in `docs/` must be consistent with this file.
**Read this document first.** A judge, hospital IT reviewer or clinician reading any other MediKiosk
document should assume that anything not labelled `IMPLEMENTED` here is not available for clinical use.

---

## 1. Purpose

This file exists for one reason: to prevent an honest engineering project from becoming a dishonest
product claim. MediKiosk is a safety-adjacent system. If a clinician is told that handwriting OCR
works, or that ABDM exchange has been performed, or that the red-flag rules are clinically validated,
and all three statements are false, the resulting harm is not reputational, it is clinical.

Every capability in this project is therefore labelled with exactly one of five statuses, and the
label is applied to the *capability*, not to the *intent*.

---

## 2. Status vocabulary (canonical definitions)

These five labels are used verbatim and in upper case throughout the documentation set. No other
status language is permitted.

| Label | Definition used in this document set |
|---|---|
| `IMPLEMENTED` | The artefact exists on disk **and** its build gate (typecheck and/or test) passes in the recorded environment. |
| `PARTIALLY IMPLEMENTED` | Source exists but the module or package does **not** pass its build gate at the snapshot, or a module it imports is absent. |
| `MOCKED` | A deterministic in-process stand-in that implements a real provider interface, used for tests and demonstration. A mock is never described as the external system it stands in for. |
| `PLANNED` | Designed and named (in an ADR or in this document set) but no artefact exists on disk. |
| `BLOCKED` | The artefact may exist or be designed, but its execution is impossible for an external reason. The reason is always given, e.g. `BLOCKED — credentials`, `BLOCKED — environment`, `BLOCKED — clinical review`. |

`NOT ESTABLISHED` is used for a different kind of claim: a status that only an external assessor can
grant (legal compliance, certification, clinical validation) and that no amount of code can produce.
It is always accompanied by a statement of which external assessment has not occurred.

### 2.1 Headline honesty statement

At the snapshot date, **no capability in this repository satisfies the `IMPLEMENTED` definition**, and
**no clinical validation, no legal review and no security review has been performed.** The red-flag
rule set is a curated starter set and is a safety **NET, not a safety GUARANTEE**.

### 2.2 What "not measured" means

Where a number has not been measured, this document set either omits it or labels it explicitly as one
of:

- `TARGET` — a design goal. Not a measurement.
- `SOURCE-BASED CLAIM` — attributed to an external source; not measured in MediKiosk.
- `MEDIKIOSK BENCHMARK RESULT` — produced by the MediKiosk evaluation harness on a pinned dataset and
  software commit. No number in this document set carries this label, because **the evaluation harness
  does not exist at the snapshot and therefore no benchmark has been run** (see §17).

### 2.3 Measurement method (re-verifiable)

All repository-state claims in this document set were produced with:

```powershell
cd C:\Projects\MediKiosk
Get-ChildItem packages, services, apps -Recurse -File |
  Where-Object { $_.FullName -notmatch 'node_modules' } |
  ForEach-Object { $_.FullName.Replace('C:\Projects\MediKiosk\','') } | Sort-Object

node node_modules\typescript\bin\tsc -p packages/shared-types/tsconfig.json --noEmit
node node_modules\typescript\bin\tsc -p packages/clinical-schema/tsconfig.json --noEmit
node node_modules\typescript\bin\tsc -p packages/i18n/tsconfig.json --noEmit
node node_modules\vitest\vitest.mjs run
```

Recorded results at the snapshot:

| Gate | Result |
|---|---|
| `packages/shared-types` typecheck | **FAIL** — 3 errors: `src/index.ts` re-exports `./result` and `./errors`, neither file exists; `src/provenance.ts:78` references `Brand`, which is declared in `src/ids.ts` and not imported. |
| `packages/clinical-schema` typecheck | **FAIL** — 4 errors: `concept-match.ts:15` imports `ConceptIndex` from `./concept` (exported from `./concept-index` instead); `primitives.ts:10` and `socrates.ts:15` cannot resolve `@medikiosk/shared-types`; `socrates.ts:146` type error. |
| `packages/i18n` typecheck | **FAIL** — `src/catalogue.ts` imports eight catalogues from `./locales/*`, and `src/locales/` does not exist. |
| `vitest run` | **FAIL** — no test files exist anywhere in the workspace. |

The working tree is being modified during this audit (a localisation-package build was in progress at
the snapshot). Claims are therefore dated, and §2.3 is the command that re-establishes them.

---

## 3. Current repository state — measured, not assumed

The table below is the factual basis for every status label in this document set. It reflects
`§2.3` at the snapshot date.

| Artefact area | Path | Measured content | Status |
|---|---|---|---|
| Shared primitives | `packages/shared-types` | 6 source files: `ids.ts`, `clock.ts`, `provenance.ts`, `response-state.ts`, `triage.ts`, `index.ts` | `PARTIALLY IMPLEMENTED` — typecheck FAILS (3 errors) |
| Canonical clinical schema | `packages/clinical-schema` | 17 source files incl. `primitives.ts`, `socrates.ts`, `answer.ts`, `concept*.ts`, `pathway*.ts`, `trigger*.ts`, `ontology/*.ts` (6) | `PARTIALLY IMPLEMENTED` — typecheck FAILS (4 errors) |
| Localisation | `packages/i18n` | 6 source files: `types.ts`, `catalogue.ts`, `translate.ts`, `verify.ts`, `clinical-terms.ts`, `index.ts` | `PARTIALLY IMPLEMENTED` — the eight catalogues under `src/locales/` are absent; typecheck FAILS |
| Evidence model | `packages/evidence-model` | `package.json` only | `PLANNED` |
| Safety rules | `packages/safety-rules` | `package.json` only | `PLANNED` |
| FHIR models | `packages/fhir-models` | `package.json` only | `PLANNED` |
| Auth / RBAC | `packages/auth` | `package.json` only | `PLANNED` |
| Design system | `packages/ui` | `package.json` only | `PLANNED` |
| API runtime | `services/api` | `package.json` only; no `src/`, no migrations, no seed | `PLANNED` |
| Patient kiosk | `apps/kiosk` | `package.json` only | `PLANNED` |
| Clinical console | `apps/console` | `package.json` only | `PLANNED` |
| Migrations / seed / pathway data | `data/` | directory exists, 0 files | `PLANNED` |
| Evaluation harness | `evaluation/` | directory exists, 0 files | `PLANNED` |
| Container artefacts | `infra/` | directory exists, 0 files | `PLANNED` |
| Demo entry point | `scripts/` | directory exists, 0 files (`scripts/demo-up.mjs` absent) | `PLANNED` |
| Test suite | `tests/` | directory exists, 0 files | `PLANNED` |
| CI pipeline | `.github/` | directory exists, 0 files | `PLANNED` |
| Environment template | `.env.example` | present; documents every provider and secret variable | `IMPLEMENTED` (a file, not a capability) |
| Workspace manifests | `package.json`, `tsconfig.base.json` | present; root scripts `dev:api`, `dev:kiosk`, `dev:console`, `db:migrate`, `db:seed`, `evaluate`, `demo:up`, `test`, `typecheck` | `IMPLEMENTED` (build wiring only) |
| Documentation suite | `docs/` | `BASELINE.md`, 11 ADRs, and this document set | `IMPLEMENTED` |

Totals under `packages/`, `services/` and `apps/`: **29 TypeScript files and 14 manifests**.

### 3.1 Conflict with `docs/BASELINE.md` — recorded, not hidden

`docs/BASELINE.md` §8 records implementation phases 1–21 as `COMPLETE`, and §4.3 records a "target
status" of `IMPLEMENTED` for the majority of components. **The measured working tree does not support
those claims.** Concretely: no API runtime source, no migrations, no applications, no tests, no
evaluation harness, no container artefacts, and three packages whose typechecks fail.

This document set does not restate the BASELINE's phase table as fact. Where the BASELINE and the
filesystem disagree, this document set follows the filesystem and labels the gap. The discrepancy is
also listed in Appendix A as a source ambiguity, because a reader must be told which of two committed
documents to believe.

### 3.2 What can honestly be said today

| Statement | Honest assessment |
|---|---|
| "MediKiosk implements an adaptive clinical interview." | **No.** The data structures for pathways, SOCRATES and triggers exist as source; the interview engine has no artefact. |
| "MediKiosk implements a deterministic red-flag engine." | **No.** `packages/safety-rules` is a manifest only. The design and the rule schema are specified in ADR-009. |
| "MediKiosk maps to FHIR R4." | **No.** `packages/fhir-models` is a manifest only. |
| "MediKiosk integrates with ABDM." | **No, and it never has been executed.** `BLOCKED — credentials`. See §8. |
| "MediKiosk runs on SQLite with no Docker." | **Not demonstrated.** The design is recorded in ADR-002 and the driver was probed on this machine (`better-sqlite3` 13.0.3 prebuilt loaded; `pg` 8.23.0 loaded), but no application exists to run against a database. |
| "The clinical concept ontology exists." | `PARTIALLY IMPLEMENTED` — six ontology files exist (`symptoms-cardiorespiratory.ts`, `symptoms-respiratory-systemic.ts`, `conditions.ts`, `labs.ts`, `vitals.ts`, `medications.ts`) and are curated content in Indian-language synonym form, but they are not yet loadable because the package does not typecheck. |

---

## 4. Model limitations

| # | Limitation | Status | Tracking |
|---|---|---|---|
| 4.1 | **Deterministic NER under-performs an LLM on unusual free text.** The default extractor is `NER_PROVIDER=deterministic` — a gazetteer-and-grammar matcher over the curated vocabulary in `packages/clinical-schema/src/concept-index.ts`, `concept-match.ts` and `src/ontology/*.ts`. It recognises authored terms and their Indian-language synonyms; it does **not** generalise to phrasing nobody curated. | `PARTIALLY IMPLEMENTED` (matching source and ontology exist; package typecheck fails) | ADR-003 |
| 4.2 | **An LLM extractor exists as an option but is not validated.** `NER_PROVIDER=llm` is an enumerated value. No comparison against the deterministic provider has been measured, and no clinician has reviewed either. | `PLANNED` | ADR-003 |
| 4.3 | **The default LLM is a deterministic local provider, not a language model.** `LLM_PROVIDER=mock`, `LLM_MODEL=medikiosk-deterministic-v1`. Per ADR-003 rule 5 it is a rule-and-template engine that produces schema-valid clinical text from the evidence store — deliberately *not* a stub returning filler, and never presented as a real model. Any claim that MediKiosk "uses an LLM" today means this. | `PLANNED` | TD-03 |
| 4.4 | **No clinical LLM validation has occurred.** No LLM output has been reviewed by a clinician; no hallucination, agreement or safety rate has been measured; no harness exists to measure one. | `NOT ESTABLISHED` — no clinical review performed | ADR-003, `../research/RESEARCH.md` §3 |
| 4.5 | **No generative model may influence triage.** Red flags, lab flagging, medication reconciliation, contradiction detection, triage level and range checks are deterministic by specification (ADR-003 rule 1, ADR-009). MediKiosk is therefore not, and must not be described as, an AI diagnostic system. | Design constraint | ADR-009 |
| 4.6 | **LLM failure falls back silently to the deterministic provider.** Invalid model output is retried once, then the deterministic provider answers (ADR-003 rule 2). Only `model_provider` on the artefact reveals that this happened. | Design constraint | ADR-003 |

Confidence constants used by the pipeline — `CONFIDENCE_RELIABLE = 0.7` and
`CONFIDENCE_REVIEW_REQUIRED = 0.5` in `packages/shared-types/src/provenance.ts` — are **design
thresholds, not calibrated** against any clinical dataset, and no sensitivity analysis has been run.

---

## 5. OCR limitations

| # | Limitation | Status | Tracking |
|---|---|---|---|
| 5.1 | **The default OCR provider is a deterministic synthetic OCR used for tests and demo.** `OCR_PROVIDER=mock`, `OCR_MODEL=medikiosk-synthetic-ocr-v1`. It is deterministic by construction so pipeline tests are reproducible. **It does not read pixels and performs no optical character recognition of a real document.** | `MOCKED` | TD-02 |
| 5.2 | **Real printed-document OCR requires an installed Tesseract binary** plus `OCR_PROVIDER=tesseract-local`. The provider value is enumerated in `.env.example`; no binary is vendored and none is installed in this environment. | `PLANNED`, `BLOCKED — environment` until a Tesseract binary exists | TD-02 |
| 5.3 | **HANDWRITING OCR IS NOT IMPLEMENTED.** No handwriting recognition exists in any provider — not in the mock, not in `tesseract-local`, not via any cloud provider. The original product concept referred to handwritten prescriptions; **that capability does not exist**, and a handwritten prescription uploaded to MediKiosk today yields no extracted content. Treating the synthetic provider as evidence of handwriting support would be a false claim. | `PLANNED` | TD-02 |
| 5.4 | **Poor-quality documents can inject false data** (risk `R-04`). The intended controls are a document-quality gate before OCR, per-entity confidence, and mandatory physician verification of low-confidence fields. None is implemented. | `PLANNED` | R-04 |
| 5.5 | **No real document has ever been processed**, so multi-column lab reports, regional report layouts and scanned-to-image PDFs are untested. | `NOT ESTABLISHED` — never measured | TD-02 |

---

## 6. Speech (ASR and TTS) limitations

| # | Limitation | Status | Tracking |
|---|---|---|---|
| 6.1 | **ASR is browser-only.** Default `ASR_PROVIDER=browser`, `ASR_MODEL=browser-webspeech-v1` — the browser's Web Speech API. There is no server-side ASR. | `PLANNED` (a configuration default, not an implementation artefact) | ADR-003 |
| 6.2 | **Indian-language coverage is browser-dependent and is not a validated multilingual ASR.** Whether a given Indian language is recognised at all depends on the browser vendor, the OS speech pack and the device. MediKiosk ships no acoustic model and makes no accuracy claim. | `NOT ESTABLISHED` — no accuracy measurement exists | ADR-003 |
| 6.3 | **Bhashini is `PLANNED`.** `ASR_PROVIDER=bhashini` is an enumerated value in `.env.example`; no client artefact exists and no API key is present. | `PLANNED` / `BLOCKED — credentials` if attempted | ADR-003 |
| 6.4 | **TTS is browser-only.** `TTS_PROVIDER=browser` (SpeechSynthesis), with `mock` available. Prosody — and therefore comprehension of medical instructions in Indian languages — depends entirely on the OS voice pack installed. | `PLANNED` | ADR-003 |
| 6.5 | **A patient whose browser lacks speech support cannot use voice at all.** Every question kind in `packages/clinical-schema/src/pathway.ts` must be answerable by touch; the intended UI states are `kiosk.voice_unavailable` and `kiosk.switch_to_touch`. Speech is an enhancement, never the only path. | Design constraint (the data model requires touch answerability) | ADR-003, ADR-008 |
| 6.6 | **No speech or TTS output has been evaluated for clinical-information fidelity.** The research question "does multilingual voice preserve clinical information?" is answered by no measurement. | `NOT ESTABLISHED` | `../research/RESEARCH.md` §2.4 |

Recognition of a low-confidence utterance is handled by explicit response states rather than by
guessing: `LOW_CONFIDENCE` and `NEEDS_CLARIFICATION` are first-class values in
`packages/shared-types/src/response-state.ts`, and `NOT_A_NEGATIVE_STATES` explicitly lists the states
that must never be coerced to "no".

---

## 7. Supported languages

Locale codes are BCP-47 and are defined in `packages/i18n/src/types.ts` (`LOCALE_CODES`,
`LOCALE_META`). The region subtag is carried from the start because persisted consent records store the
language the patient actually read.

| Code | Language | Script | Translation status |
|---|---|---|---|
| `en-IN` | English (India) | Latin | Reference locale; clinical content was authored in it |
| `hi-IN` | Hindi (हिन्दी) | Devanagari | **PROVISIONAL** — machine-drafted, REQUIRES native clinical review |
| `mr-IN` | Marathi (मराठी) | Devanagari | **PROVISIONAL** — machine-drafted, REQUIRES native clinical review |
| `gu-IN` | Gujarati (ગુજરાતી) | Gujarati | **PROVISIONAL** — machine-drafted, REQUIRES native clinical review |
| `ta-IN` | Tamil (தமிழ்) | Tamil | **PROVISIONAL** — machine-drafted, REQUIRES native clinical review |
| `te-IN` | Telugu (తెలుగు) | Telugu | **PROVISIONAL** — machine-drafted, REQUIRES native clinical review |
| `bn-IN` | Bengali (বাংলা) | Bengali | **PROVISIONAL** — machine-drafted, REQUIRES native clinical review |
| `kn-IN` | Kannada (ಕನ್ನಡ) | Kannada | **PROVISIONAL** — machine-drafted, REQUIRES native clinical review |

| # | Limitation | Status |
|---|---|---|
| 7.1 | **Every non-English catalogue is machine-drafted and REQUIRES native clinical review** before its wording may be treated as clinically usable. This is encoded as data rather than prose: `PROVISIONAL_LOCALES` (every locale except `en-IN`) and `CATALOGUE_REQUIRES_CLINICAL_REVIEW = true` in `packages/i18n/src/types.ts`, so the kiosk can render a "translation pending review" notice from the same source of truth as the catalogues. | `NOT ESTABLISHED` — no native-speaker clinical review has occurred |
| 7.2 | **Clinical terminology translations are PROVISIONAL.** `packages/i18n/src/clinical-terms.ts` exists, but a translated clinical term not reviewed by a native-speaking clinician is not a reviewed term. | `NOT ESTABLISHED` |
| 7.3 | **The eight catalogues do not exist yet.** `packages/i18n/src/catalogue.ts` imports `./locales/en-IN` … `./locales/kn-IN`; `src/locales/` is absent. Today **no language is served at all**, not even English. Verified by typecheck (`LIMITATIONS.md` §2.3). | `PARTIALLY IMPLEMENTED` |
| 7.4 | **The designed failure mode for missing text is visible, not silent.** Resolution order in `translate.ts` is requested locale → English → `⟦key⟧`. A patient may therefore see a bracketed key such as `⟦kiosk.listening⟧`, and a mixed-language screen. This is deliberate — a visibly missing string is safer than a blank button — but it is a real limitation of an incomplete translation set. | Design constraint |
| 7.5 | **No right-to-left language is supported.** `LocaleMeta.rtl` is typed as the literal `false` for all eight locales and `isRtl()` always returns `false`. | Design constraint |
| 7.6 | **No language outside the eight codes is available.** Adding one requires a new catalogue entry in `LOCALE_CODES`; because `CATALOGUES` is typed `Record<LocaleCode, Catalogue>`, omitting the catalogue becomes a compile error rather than a silent English fallback at the bedside. | `PLANNED` |

---

## 8. ABDM / ABHA status

**Status: `BLOCKED — credentials`.** No ABDM sandbox credentials exist, because onboarding requires a
registered health facility and approved client credentials (ADR-006, `TD-04`).

> **No ABDM exchange has ever been executed.** Not in production, not in sandbox, not in a test.
> The words "integrated with ABDM" must not be used about this system in any document, demonstration
> or submission. The correct description is: "the adapter boundary is designed, with a deterministic
> mock and a real sandbox client specified, and real exchange is blocked on credentials."

| Element | Status |
|---|---|
| ABDM/ABHA architecture and provider interface (`ABDMProvider`) | `PLANNED` |
| `MockABDMProvider` (deterministic, offline, tests and demo) | `PLANNED` |
| `SandboxABDMProvider` (real signed HTTP calls; cannot execute without credentials) | `PLANNED` as code; **`BLOCKED — credentials`** |
| `ProductionABDMProvider` | `PLANNED` |
| ABHA-based login at the kiosk | `PLANNED`; today `IDENTITY_PROVIDER=mock` is the only usable value |
| Care-context linking, consent artefacts, HIU/HIP roles | `PLANNED` |
| `FEATURE_ABDM_ENABLED` | Defaults to `false` in `.env.example` — deliberately off |

Activation checklist and the intended authentication/care-context sequence:
[`interoperability/ABDM.md`](interoperability/ABDM.md).

---

## 9. FHIR status

**Status: `PLANNED`.** ADR-006 describes the FHIR layer as "fully implemented, not mocked"; the working
tree does not support that claim — `packages/fhir-models` contains only a `package.json`. The
discrepancy is recorded in Appendix A.

| Element | Status |
|---|---|
| Resource mapper (Patient, Encounter, Condition, Observation, MedicationRequest, AllergyIntolerance, Procedure, DiagnosticReport, DocumentReference, Questionnaire, QuestionnaireResponse, Composition, Bundle) | `PLANNED` |
| Self-implemented validator (required fields, resource types, reference integrity, coding systems) | `PLANNED` |
| `FHIRResource` persistence with version | `PLANNED` |
| Terminology policy (LOINC/SNOMED CT/ICD-10/RxNorm only when a real code is known; otherwise a local system URI) | Specified in ADR-006 and implemented as a schema in `packages/clinical-schema/src/concept.ts` (`standardCodingSchema`) — `PARTIALLY IMPLEMENTED` |
| Coverage of validation checks | **Documented as intended, not measured.** The official HL7 validator cannot run in this environment (no Docker, no JVM toolchain recorded), so validation is self-implemented and its check coverage is enumerated in [`interoperability/FHIR.md`](interoperability/FHIR.md) §4. |
| Any FHIR Bundle ever produced | **No** |

---

## 10. Clinical validation status

**Status: `NOT ESTABLISHED`.**

- **No clinical validation study has been run.** Not a prospective study, not a retrospective one, not
  a reader study, not a usability study with clinicians.
- **No clinician has reviewed the red-flag rule set, the interview pathways, the ontology content or
  any AI output.** The rule and pathway content is a curated starter set (`TD-06`), and the repayment
  trigger is clinical advisory review.
- **The red-flag rule set is a curated starter set and is a safety NET, not a safety GUARANTEE.**
  This sentence is required wherever the safety engine is described.
- Sensitivity, specificity, false-negative rate and false-positive rate **have not been measured**.
  When they are measured, they will be measured against **synthetic ground truth**, and the result will
  be reported as `MEDIKIOSK BENCHMARK RESULT` with the explicit statement that **synthetic evaluation
  cannot substitute for prospective clinical validation**.
- **No regulatory clearance or certification exists** — not as a medical device, not under any Indian
  or international regime. No claim of the form "clinically validated", "CE marked", "CDSCO approved"
  or "FDA cleared" may be made.
- **No real patient data has ever been used.** All data is synthetic. This is a deliberate constraint:
  no real patient data has been available and none is permitted.

Measurement plan: [`clinical-safety/CLINICAL_SAFETY.md`](clinical-safety/CLINICAL_SAFETY.md) §8 and
[`research/RESEARCH.md`](research/RESEARCH.md) §3.

---

## 11. Hardware requirements

**Status: `MOCKED` (vitals providers are mock devices only); no physical device support exists.**

| Hardware capability | Status | Note |
|---|---|---|
| Blood-pressure monitor | `MOCKED` / `PLANNED` | No device driver exists; `TD-05` |
| Pulse oximeter (SpO2) | `MOCKED` / `PLANNED` | No driver exists; `TD-05` |
| Glucometer | `MOCKED` / `PLANNED` | No driver exists; `TD-05` |
| Thermometer | `MOCKED` / `PLANNED` | No driver exists |
| Weight / height scales | `MOCKED` / `PLANNED` | No driver exists |
| ECG or any waveform device | Not in scope | No design exists |
| Camera | Required in principle for document capture | `PLANNED`; no capture implementation |
| Microphone and speakers | Required for voice | `PLANNED`; touch-only operation is possible by design |
| Thermal printer / token dispenser | Not in scope | No design exists |
| Kiosk enclosure, touchscreen, power | Operator-provided | Not specified by any ADR |

`TD-05` records the debt and its repayment trigger: "When a device driver is implemented against
`VitalDeviceProvider`". **The `VitalDeviceProvider` interface itself is `PLANNED`** — the identifier is
named in the debt register, not yet in code. Any vitals value in a demonstration therefore comes from a
mock provider or from manual entry, and must be labelled as such.

<!-- MEDIKIOSK-APPEND -->