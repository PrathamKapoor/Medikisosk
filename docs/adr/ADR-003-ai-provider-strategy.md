# ADR-003 — AI provider strategy: capability-based adapters with deterministic defaults

**Status:** Accepted
**Date:** 2026-09-15

## Context

MediKiosk needs several AI capabilities: speech recognition (ASR), speech synthesis (TTS),
optical character recognition (OCR), clinical named-entity extraction (NER), question selection,
case summarisation, and contradiction detection.

Constraints:
- No API keys or model weights are available in this environment.
- Clinical logic must be **testable and reproducible** without a paid third party.
- A hospital may require on-premise inference and may forbid sending PHI to an external cloud.
- Vendors must be replaceable without rewriting clinical logic.

## Decision

Every AI capability is defined by a **provider interface**, and the concrete provider is chosen
by configuration. Five provider families:

| Capability | Providers | Default |
|---|---|---|
| ASR | `browser` (Web Speech API), `bhashini`, `mock`, `disabled` | `browser` |
| TTS | `browser` (SpeechSynthesis), `mock`, `disabled` | `browser` |
| OCR | `mock` (deterministic synthetic), `tesseract-local`, `disabled` | `mock` |
| NER / clinical extraction | `deterministic` (gazetteer + grammar), `llm`, `disabled` | `deterministic` |
| LLM (question selection, synthesis, contradiction narration) | `mock` (deterministic rules-driven), `openai`, `ollama`, `disabled` | `mock` |

Hard rules enforced in code:

1. **No clinical decision is made by an LLM.** Red-flag detection, lab flagging, medication
   reconciliation, contradiction *detection*, triage level, and range checking are 100%
   deterministic. The LLM may only *narrate* or *suggest wording*, always over facts that
   already exist in the evidence store.
2. **Every AI output is schema-constrained.** LLM responses must validate against a Zod schema
   before use; invalid output is retried once and then falls back to the deterministic provider.
3. **Every LLM call is recorded** with provider, model, model version, prompt id, prompt version,
   latency, and token usage.
4. **A mock provider is never presented as real.** The active provider is surfaced in
   `/api/v1/health` and in the admin console, and every artifact records `model_provider`.
5. **The deterministic mock LLM is not a stub that returns filler.** It is a real
   rule-and-template engine that produces well-formed, schema-valid clinical text from the actual
   evidence store, so the entire product is demonstrable and testable end-to-end offline.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Direct `openai` SDK calls inside feature modules | Couples clinical logic to one vendor; untestable without a key and network |
| A single "AI service" microservice | Premature extraction with no independent scaling need; adds deployment complexity for no benefit at this stage. The provider-interface boundary inside the modular monolith achieves the same isolation, and can be extracted later if a GPU node is introduced |
| LangChain / LlamaIndex orchestration | Heavy abstraction over what is, in MediKiosk, a small number of schema-constrained calls. The value we need — typed structured output + validation + provenance — is provided directly by Zod and a thin client, with far less surface area |
| Use the LLM for triage and red flags | Explicitly rejected on safety grounds: an LLM is not an acceptable authority for emergency routing. Non-determinism is unacceptable in a safety path |

## Consequences

**Positive**
- `npm test` exercises the complete pipeline with zero network access and zero API keys.
- Swapping to a real cloud LLM or a local Ollama model is a config change, and the exact model
  and prompt version used for each clinical artifact is recorded for audit and research.
- Hospital on-premise deployments can set every provider to a local implementation.
- The evaluation harness can compare providers on identical inputs, because the interface is fixed.

**Negative / accepted**
- There is more indirection than a direct SDK call. Mitigated by keeping each provider to a single
  small module and a single factory function.
- The deterministic NER/extraction provider will under-perform a large model on unusual free text.
  This is measured and reported honestly in the evaluation suite; the LLM provider is available
  when quality matters more than offline determinism.
- **TD-02, TD-03** as recorded in the baseline.