---

## 3. Provider matrix (ADR-003) with measured status

| Capability | Enumerated providers | Default | Measured status of every provider |
|---|---|---|---|
| ASR | `browser`, `bhashini`, `mock`, `disabled` | `browser` | All `PLANNED`. `bhashini` additionally `BLOCKED — credentials`. |
| TTS | `browser`, `mock`, `disabled` | `browser` | All `PLANNED` |
| OCR | `mock`, `tesseract-local`, `disabled` | `mock` | All `PLANNED`; `tesseract-local` additionally `BLOCKED — environment` (no binary installed, none vendored — `TD-02`) |
| NER / clinical extraction | `deterministic`, `llm`, `disabled` | `deterministic` | `PLANNED`. The ontology the deterministic provider would match against exists (`packages/clinical-schema/src/ontology/*.ts`, 6 files) but is not loadable yet. |
| LLM | `mock`, `openai`, `ollama`, `disabled` | `mock` | All `PLANNED`; `openai`/`ollama` `BLOCKED — credentials` / `BLOCKED — no local model weights` (`TD-03`) |

Configuration names are fixed by `.env.example`: `ASR_PROVIDER`, `ASR_MODEL`, `TTS_PROVIDER`,
`OCR_PROVIDER`, `OCR_MODEL`, `NER_PROVIDER`, `LLM_PROVIDER`, `LLM_MODEL`, `LLM_BASE_URL`,
`LLM_API_KEY`, `LLM_TIMEOUT_MS`. The active provider is required to be surfaced in `/api/v1/health`
and in the admin console (ADR-003 rule 4) — that endpoint is `PLANNED`.

## 4. Hard rules enforced in code (ADR-003)

| # | Rule | Mechanism | Status |
|---|---|---|---|
| 1 | **No clinical decision is made by an LLM.** Red-flag detection, lab flagging, medication reconciliation, contradiction *detection*, triage level and range checking are 100% deterministic. The LLM may only narrate or suggest wording over facts that already exist in the evidence store. | Safety engine is a separate package (`packages/safety-rules`) that does not import any LLM provider | `PLANNED` (structural separation is easy to verify once both exist) |
| 2 | **Every AI output is schema-constrained.** LLM responses must validate against a Zod schema before use; invalid output is retried once, then falls back to the deterministic provider. | Zod schemas in `packages/clinical-schema` / `packages/shared-types` (present); the call wrapper is `PLANNED` | `PARTIALLY IMPLEMENTED` |
| 3 | **Every LLM call is recorded** with provider, model, model version, prompt id, prompt version, latency and token usage. | Per-call record; `generated_by` on `ClinicalClaim` carries "provider + model + prompt version" (ADR-005) | `PLANNED` |
| 4 | **A mock provider is never presented as real.** The active provider is surfaced in `/api/v1/health` and in the admin console, and every artefact records `model_provider`. | Health payload + admin console view + `model_provider` column | `PLANNED` |
| 5 | **The deterministic mock LLM is not a stub returning filler.** It is a rule-and-template engine producing well-formed, schema-valid clinical text from the actual evidence store, so the product is demonstrable and testable end-to-end offline. | `LLM_MODEL=medikiosk-deterministic-v1` | `PLANNED` |

## 5. Failure modes and fallbacks

| Failure | Designed behaviour | Status |
|---|---|---|
| No API key / no network | Every capability has a local provider, so extraction, safety, triage and summarisation work offline (ADR-004 tier 3). Only cloud providers require connectivity. | `PLANNED` |
| Model returns invalid JSON | Retry once, then deterministic fallback. The clinician sees a valid result; only `model_provider` reveals the fallback. | `PLANNED` |
| Model returns clinically wrong but schema-valid text | Not detectable by schema validation. This is the reason the LLM's role is restricted to rephrasing and narrating over existing evidence, and the reason claims require non-empty `evidence_ids`. | Design constraint; see `../LIMITATIONS.md` §4.4 |
| Prompt injection through a document or patient text | Document and patient text is treated strictly as untrusted **DATA**, never as instructions; extraction is schema-constrained; the LLM has no authority to act (ADR-009 reason 4, risk `R-05`). The trigger language in `packages/clinical-schema/src/trigger.ts` deliberately excludes arbitrary code and configuration-supplied regular expressions "so that untrusted patient or document input can never change which clinical question is asked". | `PARTIALLY IMPLEMENTED` (trigger language is real code; the prompt layer is `PLANNED`) |
| Adversary with provider access | A hospital can set every provider to a local implementation and run with no outbound network access (ADR-010). | `PLANNED` |
| A model is withdrawn or changes behaviour | Every artefact records provider, model and prompt version, so a behaviour change is attributable to a version rather than appearing as random variation. | `PLANNED` |

## 6. Status line

| Capability | Status |
|---|---|
| Provider interfaces, factories, provider selection by environment variable | `PLANNED` |
| Deterministic NER (gazetteer + grammar) | `PARTIALLY IMPLEMENTED` — matcher and ontology source exist; `packages/clinical-schema` typecheck fails |
| Deterministic local LLM (rule-and-template) | `PLANNED` |
| Real model providers (`openai`, `ollama`) | `PLANNED` / `BLOCKED — credentials` |
| Any AI capability has produced output a clinician has reviewed | **No** — no clinical review has occurred |
| Any AI capability has been benchmarked | **No** — the harness does not exist; no `MEDIKIOSK BENCHMARK RESULT` numbers exist anywhere in this document set |

<!-- MEDIKIOSK-APPEND -->