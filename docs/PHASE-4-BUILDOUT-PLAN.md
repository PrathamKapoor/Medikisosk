# Phase 4+ build-out — implementation plan (Master directive)

Binding plan for the multi-phase build to release-candidate. Repository reality first; honest
capability registry in `services/api/src/config/capabilities.ts` is updated with every pass.
Phase 3 baseline: HEAD `5e24bb5`, 62 tests, all gates green.

## Pass order (dependency-locked)

| Pass | Phases | Deliverables | Depends on |
|---|---|---|---|
| P1 | 4, 5(partial) | `packages/ai` provider abstractions (ASR/TTS/OCR/LLM + deterministic mocks); kiosk voice+TTs+low-confidence-confirm+touch fallback; capabilities truth (asr/tts IMPLEMENTED browser-dependent); Phase 5 registry audit | — |
| P2 | 9, 10, 11 | `packages/longitudinal` (timeline, what-changed) + `packages/evidence-model` (evidence graph, contradiction types); API timeline/compare/evidence endpoints | P1 (ai only not needed) |
| P3 | 6, 7, 12 | Document pipeline (upload→validate→mock OCR→extract→evidence DOCUMENT_DERIVED→verification states→staff accept/edit/reject); contradiction engine server-side | P1, P2 |
| P4 | 13, 14, 16 | LLM gateway + deterministic evidence-grounded SOAP synthesis (AI_DERIVED) + summary tables + physician review state machine + endpoints | P2, P3 |
| P5 | 15, 26 | `apps/console` physician workstation (queue, case, timeline, documents, AI draft edit/verify, contradictions, evidence trace) + admin (kiosks, audit, health) | P2–P4 |
| P6 | 18 | `packages/fhir-models` (FHIR R4 subset mapper + validator) + export endpoint + round-trip tests | canonical model |
| P7 | 19, 20 | ABDM adapter interface + sandbox/mock + BLOCKED labels + contract tests; HIS FHIR-server adapter + sync outbox | P6 |
| P8 | 21 | Offline kiosk local queue + sync API + connectivity UI (honest scope) | P3, P4 |
| P9 | 24, 25, 31, 32, 36 | Tenant config endpoints, kiosk heartbeat, metrics/health, jobs worker, migration hardening tests | — |
| P10 | 22, 23, 33 | Security/privacy/failure test expansion | — |
| P11 | 34, 35 | Docker/compose + CI workflow + deployment docs | — |
| P12 | 28, 29, 30 | Evaluation harness + golden case library + AI eval | P2–P5 |
| P13 | 37, 38, 56 | OpenAPI, demo mode, accessibility polish, WOW wiring | all |
| Final | — | Release audit, capability matrix, docs/architecture diagrams, handoff | all |

## Cross-cutting contracts

- Provider interfaces live in `packages/ai` (new, pure). Mocks named `Deterministic*` and
  status MOCKED everywhere. No LLM in triage/selection (ADR-009/012) — LLM only for summary
  drafts with AI_DERIVED provenance and mandatory physician review.
- Documents/OCR/voice never silently trusted: confidence gates, confirmation, verification
  states. `DOCUMENT_DERIVED` evidence rows before facts that cite them.
- All new mutations use `replayMutation`; consent guard before clinical writes; audit
  PHI-free; tenant from principal; 404 not 403.
- Determinism: no `Date.now()` in pure packages (injected `now`); no LLM inside domain
  decisions.
- Every pass: scoped tsc/vitest by the implementer; Main runs full gates; commit per pass.
- Capability registry + LIMITATIONS/BASELINE updated per pass; statuses only what is measured.

## Honesty rules (also from the directive)
- Browser ASR/TTS: IMPLEMENTED (browser-dependent; not validated for Indian languages) — never
  "multilingual ASR".
- OCR mock: MOCKED — never "OCR works on real documents".
- ABDM: adapter + sandbox contract tests; production BLOCKED without credentials — never
  "ABDM integrated".
- Offline: genuinely implemented local queue + sync; never a fake offline button.
- Phase 5 multilingual: en-IN/hi-IN/mr-IN interview with machine-drafted PROVISIONAL
  translations; five locales browseable-only. PARTIALLY IMPLEMENTED until native review.