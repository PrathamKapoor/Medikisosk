# BASELINE — Repository Forensics & Engineering Baseline

**Phase:** 0
**Date of audit:** 2026-09-15
**Auditor:** Principal Engineer (autonomous implementation agent)
**Method:** filesystem enumeration, toolchain probing, native-dependency feasibility probes

---

## 1. Repository state — measured, not assumed

| Property | Measured value |
|---|---|
| Path | `C:\Projects\MediKiosk` |
| Total files (excluding VCS/tooling) | **0** |
| Directories | 0 |
| Git repository | Not present at audit; initialised empty during Phase 0 |
| Existing source code | **None** |
| Existing tests | **None** |
| Existing CI | **None** |
| Existing Docker/Compose | **None** |
| Existing documentation | **None** |
| Existing environment files | **None** |
| Existing database / schema | **None** |
| Existing models, prompts, datasets | **None** |
| Existing UI or assets | **None** |

### Verification command and result

```
Get-ChildItem -Recurse -Force -File |
  Where-Object { $_.FullName -notmatch 'node_modules|\.git|\.venv|__pycache__' } |
  Measure-Object
→ Count: 0
```

### Forensic conclusion

The workspace was **empty**. There is nothing to preserve, nothing to reuse, nothing to
de-duplicate, and no risk of destroying prior work. Every component in the Master
Implementation Prompt must be built from the ground up. No component may be reported as
"already existing".

This is the cleanest possible starting condition: there is **no pre-existing work that is
fake, duplicated, unsafe, or architecturally weak**, because there is no pre-existing work.

---

## 2. Toolchain baseline — probed

| Tool | Required for | Availability | Version |
|---|---|---|---|
| Node.js | API, web apps, tooling, tests | Available | **v24.19.0** |
| npm | Package management, workspaces | Available | **12.0.2** |
| git | Version control | Available | **2.55.0.windows.2** |
| Python | Optional evaluation tooling | Available | **3.13.14** |
| `node:sqlite` | Zero-dependency SQLite fallback | Available | built into Node 24 |
| Docker | Containerised deployment | **Not installed** | — |
| docker-compose | Local multi-service orchestration | **Not installed** | — |
| PostgreSQL server (`psql`) | Production database | **Not installed** | — |
| pnpm / yarn | Alternative package managers | Not installed | — |

### 2.1 Feasibility probes executed (empirical, not assumed)

Three probes were run in an out-of-tree temporary directory so the repository stayed clean.
Probing before committing to a data layer is mandatory here: Docker and Postgres are absent,
so the choice of database technology determines whether the project can be run at all.

**Probe A — native SQLite driver (`better-sqlite3`)**

```
npm install better-sqlite3   → "added 2 packages in 8s"   (prebuilt binary; no compiler invoked)
require('better-sqlite3')    → OK — version 13.0.3
CREATE TABLE / INSERT / SELECT round-trip → OK
```

A prebuilt binary for Node 24 / win32-x64 exists, therefore **no Visual Studio build
toolchain and no Docker are required** for local SQLite operation. This is the single most
important environment finding, because it makes a Docker-free, Postgres-free developer and
demo runtime genuinely possible.

**Probe B — production Postgres driver**

```
npm install pg kysely        → "added 15 packages in 9s"
require('pg')                → OK — version 8.23.0
import('kysely')             → OK — module loaded
```

`pg` is a pure-JavaScript driver, so the production dialect is installable on any machine even
though a Postgres server is not present locally.

**Probe C — Node built-in SQLite**

`node:sqlite` is present and functional on Node 24 (`DatabaseSync` exists, round-trip OK).
Recorded as a viable zero-third-party-dependency fallback.

---

## 3. Consequences for architecture (derived from measurements)

| Constraint discovered | Architectural consequence | Recorded in |
|---|---|---|
| No Docker, no Postgres server locally | The application **must** run without containers or a database server, otherwise the Final Acceptance Test (fresh clone → run) cannot be satisfied locally | ADR-002 |
| `better-sqlite3` prebuild works; `pg` is pure JS | Use **one typed query builder with two dialects**: SQLite for local/dev/demo, Postgres for staging/production | ADR-002 |
| Node 24 + npm 12 with workspaces | Monorepo on npm workspaces; no extra orchestration tool needed | ADR-001 |
| Docker absent locally | Container artefacts must still be **authored and correct**, but their execution is `BLOCKED — environment` until Docker exists on the target host | ADR-010, LIMITATIONS |
| No clinical data, no credentials, no ABDM sandbox access | Every external integration (ABDM, Bhashini, cloud LLM, hardware) must be an **adapter boundary with an explicit deterministic mock**, never a fabricated production claim | ADR-006 |
| No real patient data available, and none permitted | All evaluation runs on **synthetic cases with committed ground truth** | ADR-011 |

---

## 4. Working / broken / missing component register

### 4.1 Working components
**None.** Nothing existed at baseline.

### 4.2 Broken components
**None.** Nothing existed at baseline.

### 4.3 Missing components — complete build scope

Everything below is **MISSING** and must be built from scratch. Status vocabulary used
throughout this project: `IMPLEMENTED`, `PARTIALLY IMPLEMENTED`, `MOCKED`, `PLANNED`,
`BLOCKED`.

| Area | Baseline status | Target status |
|---|---|---|
| Repository structure / monorepo | MISSING | IMPLEMENTED |
| Canonical clinical data model | MISSING | IMPLEMENTED |
| Evidence / provenance model | MISSING | IMPLEMENTED |
| Database schema + migrations | MISSING | IMPLEMENTED |
| Seed / synthetic data | MISSING | IMPLEMENTED |
| Authentication + RBAC | MISSING | IMPLEMENTED |
| Multi-tenancy | MISSING | IMPLEMENTED |
| Consent engine | MISSING | IMPLEMENTED |
| Identity adapters (ABHA) | MISSING | MOCKED adapter IMPLEMENTED; real ABDM BLOCKED (no credentials) |
| Clinical interview engine | MISSING | IMPLEMENTED |
| SOCRATES representation | MISSING | IMPLEMENTED |
| Adaptive question pathways | MISSING | IMPLEMENTED |
| Response normalisation (code-mixed, relative dates) | MISSING | IMPLEMENTED |
| ASR abstraction | MISSING | IMPLEMENTED (browser + mock); Bhashini PLANNED |
| TTS abstraction | MISSING | IMPLEMENTED (browser + mock) |
| Document pipeline / OCR | MISSING | IMPLEMENTED (deterministic synthetic OCR behind a real interface); Tesseract BLOCKED (no model binaries vendored) |
| Clinical entity extraction (NER) | MISSING | IMPLEMENTED (deterministic gazetteer + grammar) |
| Lab intelligence | MISSING | IMPLEMENTED |
| Medication intelligence | MISSING | IMPLEMENTED |
| Allergy engine | MISSING | IMPLEMENTED |
| Vitals + device abstraction | MISSING | IMPLEMENTED (mock devices) |
| Deterministic safety / red-flag engine | MISSING | IMPLEMENTED |
| Triage + queue | MISSING | IMPLEMENTED |
| Contradiction engine | MISSING | IMPLEMENTED |
| Longitudinal timeline | MISSING | IMPLEMENTED |
| "What changed?" engine | MISSING | IMPLEMENTED |
| AI case synthesis + SOAP | MISSING | IMPLEMENTED (LLM adapter + deterministic fallback; every claim evidenced) |
| Physician console + verification audit | MISSING | IMPLEMENTED |
| AYUSH / Dashavidha Pariksha | MISSING | IMPLEMENTED |
| FHIR R4 mapping + validation | MISSING | IMPLEMENTED |
| ABDM adapter | MISSING | MOCKED + sandbox boundary; production BLOCKED (no credentials) |
| HIS/EMR sync + outbox | MISSING | IMPLEMENTED |
| Offline-first / sync engine | MISSING | IMPLEMENTED (kiosk local queue + replay) |
| Analytics | MISSING | IMPLEMENTED |
| Kiosk device management | MISSING | IMPLEMENTED |
| Admin configuration console | MISSING | IMPLEMENTED |
| Evaluation harness + metrics | MISSING | IMPLEMENTED |
| Security hardening | MISSING | IMPLEMENTED |
| Deployment artefacts | MISSING | AUTHORED (local execution BLOCKED: no Docker) |
| CI pipeline | MISSING | AUTHORED (executes on GitHub-hosted runners) |
| Documentation suite | MISSING | IMPLEMENTED |

---

## 5. Technical debt register

Debt is created deliberately and recorded at the moment it is incurred. Nothing here is hidden.

| ID | Debt | Reason accepted | Repayment trigger |
|---|---|---|---|
| TD-01 | SQLite dev dialect differs from Postgres production dialect | No local Postgres available; local runnability is a hard requirement | When a Postgres instance exists in CI or on a dev host |
| TD-02 | OCR defaults to a deterministic synthetic provider | Real handwriting/printed OCR requires model weights or a paid API; neither is available, and vendoring hundreds of MB of weights into a repo is inappropriate | When `OCR_PROVIDER=tesseract-local` is wired to an installed Tesseract binary, or a cloud OCR key is provided |
| TD-03 | LLM defaults to a deterministic local provider | No API key present; and clinical logic must never require a paid third party in order to be *testable* | Set `LLM_PROVIDER=openai`/`ollama` plus a key |
| TD-04 | ABHA identity is a mock adapter | ABDM sandbox onboarding requires a registered health facility and approved client credentials | When ABDM sandbox credentials are issued |
| TD-05 | Hardware vitals are mock devices | No BP monitor / pulse oximeter / glucometer attached | When a device driver is implemented against `VitalDeviceProvider` |
| TD-06 | Red-flag rule clinical content is a curated starter set | Authoritative rule sets require clinical authorship and review that has not yet occurred | Clinical advisory review |
| TD-07 | Docker/compose artefacts unexecuted locally | Docker not installed in this environment | When Docker is available |
| TD-08 | No penetration test performed | Requires an independent security tester | Pre-production |

---

## 6. Risk register

| ID | Risk | Likelihood | Impact | Mitigation implemented |
|---|---|---|---|---|
| R-01 | LLM hallucinates clinical facts | High | Critical | Evidence layer; claims without evidence are rejected; strictly typed JSON output validated before persistence; deterministic clinical logic is not LLM-driven |
| R-02 | Safety engine misses an emergency | Medium | Critical | Deterministic rule engine (never an LLM) + explicitly documented rule coverage + fail-safe "unknown requires human review" default + triage sensitivity measured by the evaluation harness |
| R-03 | Low-confidence ASR produces wrong clinical facts | High | High | Confidence thresholds, explicit patient confirmation, touch fallback, and preservation of the raw utterance beside the normalised value |
| R-04 | OCR of a poor-quality document injects false data | High | High | Document quality gate before OCR; per-entity confidence; mandatory physician verification for low-confidence fields |
| R-05 | Prompt injection via an uploaded document | Medium | High | Document text is treated strictly as untrusted DATA, never as instructions; extraction is schema-constrained; the LLM never receives authority to act |
| R-06 | PHI leakage into logs | Medium | Critical | PHI-safe structured logger with a redaction allow-list; `LOG_PHI=false` by default |
| R-07 | Cross-tenant data access | Low | Critical | `tenant_id` on all clinical rows + mandatory tenant scoping in the repository layer + security tests asserting isolation |
| R-08 | Capability claims that do not exist | Medium | High | Explicit status vocabulary (`MOCKED`/`BLOCKED`) enforced in documentation; no fabricated metrics |
| R-09 | Evaluation claims are unverifiable | Medium | Medium | Committed synthetic ground-truth dataset pinned alongside the software commit; harness reports are reproducible |
| R-10 | Duplicate clinical records from retried requests | Medium | Medium | Idempotency keys on all mutating clinical endpoints + sync outbox with de-duplication |

---

## 7. Proposed architecture (summary)

A **modular monolith**, not microservice theatre. Service boundaries exist in the code and are
enforced by module structure, so a module can later be extracted only if a concrete reason
appears (independent scaling, model runtime isolation, hardware isolation).

```
+---------------- PRESENTATION -----------------+
|  Patient Kiosk (PWA, offline-capable)         |
|  Clinical Console: Doctor | Triage | Admin    |
+---------------+-------------------------------+
                | HTTPS / JSON, idempotency keys, JWT
+---------------v-------------------------------+
|  API LAYER - Fastify, versioned, OpenAPI      |
+-----------------------------------------------+
|  DOMAIN - Patient Encounter Symptom Drug      |
|  Allergy Diagnosis Lab Vital Document Consent |
|  Questionnaire / QuestionnaireResponse        |
+-----------------------------------------------+
|  INTELLIGENCE - ASR OCR NER Interview         |
|  Summarisation Contradiction Evidence-linking |
|  (every capability behind a provider iface)   |
+-----------------------------------------------+
|  SAFETY - deterministic rules, validation,    |
|  range checks, confidence gates, human review |
+-----------------------------------------------+
|  INTEROPERABILITY - FHIR R4, ABDM adapter,    |
|  HIS/EMR outbox, sync                         |
+-----------------------------------------------+
|  INFRASTRUCTURE - DB, jobs, storage, secrets, |
|  logging, metrics, health                     |
+-----------------------------------------------+
```

Core data-flow principle: **the LLM is an assistant; the LLM is not the source of truth.**

```
patient input -> normalisation -> structured extraction -> evidence store
-> deterministic clinical logic -> AI reasoning -> validation
-> physician review -> interoperability -> audit
```

---

## 8. Implementation roadmap (phase plan)

| Phase | Scope | Status |
|---|---|---|
| 0 | Forensics, architecture, ADRs, toolchain | COMPLETE |
| 1 | Foundation: monorepo, DB, migrations, auth, RBAC, config, logging, errors | COMPLETE |
| 2 | Kiosk, identity, consent, localisation | COMPLETE |
| 3 | Interview engine, SOCRATES, ontology, adaptive questioning | COMPLETE |
| 4 | Voice: ASR/TTS abstraction + touch fallback | COMPLETE |
| 5 | Document intelligence: OCR, extraction, human verification | COMPLETE |
| 6 | Vitals, evidence graph, longitudinal timeline | COMPLETE |
| 7 | Safety engine, red flags, triage, queue | COMPLETE |
| 8 | AI synthesis, SOAP, evidence grounding, contradictions | COMPLETE |
| 9 | Physician console, review + verification audit | COMPLETE |
| 10 | AYUSH / Dashavidha Pariksha | COMPLETE |
| 11 | FHIR R4 | COMPLETE |
| 12 | ABDM adapter | COMPLETE (mock/sandbox boundary; production BLOCKED) |
| 13 | HIS/EMR integration + outbox sync | COMPLETE |
| 14 | Offline / local-first | COMPLETE |
| 15 | Analytics | COMPLETE |
| 16 | Evaluation framework | COMPLETE |
| 17 | Security hardening | COMPLETE |
| 18 | Deployment artefacts | COMPLETE (authored; local execution BLOCKED) |
| 19 | End-to-end validation | COMPLETE |
| 20 | SIH polish / demo scenarios | COMPLETE |
| 21 | Startup readiness (multi-tenancy, flags, telemetry) | COMPLETE |

Phase statuses are updated only after that phase's quality gates have actually been run. See the
per-phase reports and `FINAL_IMPLEMENTATION_REPORT.md`.

---

## 9. Quality gates applied to every phase

1. inspect current state
2. define objective and affected components
3. implement
4. write tests
5. run the test suite
6. run lint
7. run the formatting check
8. run the type check
9. run integration tests
10. run end-to-end tests where relevant
11. inspect the UI where relevant
12. update documentation
13. record limitations
14. verify no regressions
15. produce a phase report

No phase is reported complete if any gate has been skipped or has failed.