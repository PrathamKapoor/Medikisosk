# MediKiosk — Project Handoff

Written 2026-09-17 after the API-foundation subphase. Inspect the repository before acting on any
statement below; this document was written from the actual files on disk, not from memory.

---

## 1. Current Phase

- **Phase:** 1 of 21 (Foundation) — per the phase plan in `docs/BASELINE.md`.
- **Subphase:** Phase 1 completion — API foundation: config, dual-dialect DB layer, migrations, seed,
  auth service, auth routes, Fastify app, PHI-safe logging, audit writer.
- **Objective:** Get `services/api` from zero to a booting Fastify server with working staff login on
  SQLite, plus all domain packages compiling.
- **Status:** **Subphase complete for what it set out to do.** The API compiles, boots, and serves a
  verified login flow. Phases 2+ (kiosk, consent engine, interview engine, documents, physician
  console, FHIR, offline, evaluation) are **not started** — only their planning documents exist.

**Overall project objective:** MediKiosk — an AI-assisted, multimodal, multilingual clinical intake
platform for Indian OPDs, with deterministic safety rules, evidence-grounded AI, and FHIR/ABDM
interoperability. The master requirements are the ADRs (`docs/adr/ADR-001..011`) and the API contract
(`docs/api/CONTRACT.md`). `docs/BASELINE.md` records the audit and phase plan.

**Repository note:** git is initialised on branch `main` with **zero commits**. Everything is
untracked. An early commit should be made before further work.

---

## 2. Work Completed

### 2.1 Domain packages (all compile, all CommonJS output via `tsc`)

**`packages/shared-types`** — Primitives used everywhere:
- `ids.ts`: branded IDs (`TenantId`, `UserId`, `PatientId`, `EncounterId`), `IsoDateTime`,
  `IsoDate`, `Paged<T>`.
- `provenance.ts`: `ORIGIN_CLASSES` (`PATIENT_REPORTED | DOCUMENT_DERIVED | CLINICIAN_ENTERED |
  AI_INFERRED`), `VERIFICATION_STATES`, `Confidence` (branded locally so the module has no imports),
  `confidence()`, `CONFIDENCE_RELIABLE = 0.7`, `CONFIDENCE_REVIEW_REQUIRED = 0.5`, `CERTAINTIES`
  incl. `NEGATED`.
- `response-state.ts`: `RESPONSE_STATES` incl. `DECLINED`, `UNKNOWN`, `LOW_CONFIDENCE`,
  `CONTRADICTORY`; helpers `isAnswered`, `isOpen`, `isTerminal`, `NOT_A_NEGATIVE_STATES`.
- `triage.ts`: `TRIAGE_LEVELS`, `levelToPriority`, `maxTriageLevel`, `QUEUE_STATUSES`,
  `compareQueueOrder`.
- `errors.ts`: `ERROR_CODES` catalogue (50 codes), `ERROR_STATUS` map, `MediKioskError` with
  `.code/.status/.details`, and `errors.notFound/validation/consentMissing/forbidden/unauthenticated/
  conflict/aiDisabled/featureDisabled/dependency`.
- `result.ts`: `Result<T, MediKioskError>`, `ok`, `err`, `isOk`, `unwrap`, `mapResult`.
- `clock.ts`: `Clock`, `systemClock`, `fixedClock`, `steppingClock`, date helpers.

**`packages/clinical-schema`** — Canonical clinical model:
- `primitives.ts` (severity scale + ordinal, duration units, anatomical sites, Zod primitives),
  `answer.ts` (`normalisedAnswerSchema` with immutable `rawAnswer`, `quantitySchema` with
  `referenceSource`).
- `socrates.ts`: per-complaint SOCRATES profile, slots, `socratesCompleteness`.
- `trigger.ts` / `trigger-eval.ts` / `trigger-describe.ts`: the declarative trigger language used by
  **both** pathways and safety rules; `TriggerContext` is the shared evaluation context.
- `pathway.ts` / `pathway-model.ts`: question kinds, categories with priority rank
  (SAFETY_CRITICAL=1 … COMPLETENESS=6), `PathwayQuestionInput` (`z.input` so defaults are optional
  when authoring), `InterviewPathway`, `validatePathway`.
- `concept*.ts`: vocabulary with local `MK-*` codes and multilingual synonyms, plus a two-pass
  matcher (exact longest match, then gapped co-occurrence). The gapped pass exists because
  "mere chest mein kal se pain hai" did not match "chest pain" without it; it requires all content
  words of a multi-word synonym and only skips stopwords.
- `ontology/`: symptoms, conditions (ICD-10 where known), 40 medications, 18 allergens +
  `CROSS_REACTIVITY_NOTES`, history facts, AYUSH, vital definitions, 11 lab definitions (LOINC,
  default ranges).
- `lab-analysis.ts`: `flagLabResult` with reference-range precedence (source document > tenant
  config > MediKiosk default > UNKNOWN); never defaults to NORMAL.
- `therapy-models.ts`: `reconcileMedications`, `summariseAllergies` (`safeToAssumeNoAllergy` true
  **only** for `CONFIRMED_NO_KNOWN_ALLERGIES`).
- `pathways/`: 9 pathways, `PATHWAY_VERSION = '1.0.0'`, 70 question keys, `validateAllPathways()`.

**`packages/safety-rules`** — Deterministic triage engine, **43 rules** (20 RED / 22 AMBER / 1
advisory). Rules are data using clinical-schema's `TriggerExpression`. `assess.ts:evaluateTriage` is
pure; non-advisory max severity sets the level; advisory hits set `requiresHumanReview`; rules
missing `evidenceRequired` facts are **not fired** and reported as evidence-gated; age-bounded rules
with unknown age are listed as skipped. `coverage.ts` reports unwatched facts.
`RULE_SET_VERSION = '1.0.0'`.

**`packages/auth`** — `permissions.ts` (6 roles, 40 permissions, explicit `ROLE_PERMISSIONS` table),
`tokens.ts` (jose HS256; audiences `medikiosk.staff` / `medikiosk.kiosk`; `kind` enforcement; TTLs
staff 12h / kiosk 45min), `passwords.ts` (bcrypt cost 12 + pepper folding `pepper:plain`,
`timingSafeEqual`, `maskIdentifier`), `index.ts` barrel.

**`packages/i18n`** — Built by a teammate before the inference cap: 8 locales, 14 files. **Not
re-verified this session.**

**Docs** — 11 ADRs, `docs/api/CONTRACT.md` (761 lines), 12 architecture docs, SECURITY / FHIR /
ABDM / BASELINE / LIMITATIONS. Written by a teammate; not line-by-line verified here.

### 2.2 API service (`services/api` — 43 source files, compiles clean, boots, login verified)

**Config**
- `config/env.ts`: Zod-validated env. `loadConfig` **refuses to boot** when: production mode +
  development-default secrets; postgres dialect without `DATABASE_URL`; `IDENTITY_PROVIDER=abha`
  without ABDM credentials. Feature flags read from raw env with defaults in `FEATURE_DEFAULTS`.
- `config/capabilities.ts`: `capabilitiesFor(config)` — labels every provider MOCKED / IMPLEMENTED /
  PLANNED so a mock can never be presented as real.
- `config/env-with-capabilities.ts`: re-export barrel used by `app.ts`.

**DB**
- `db/kysely.ts`: `createDatabase` → SQLite (better-sqlite3, WAL, **foreign_keys=ON**) or Postgres
  (pg pool with a fail-fast `tenants` probe). `transaction<T>()`. `AppDatabase = Kysely<Database>`.
- `db/tables*.ts`: row interfaces for all 40 tables. `tables-system.ts` **imports** row types from
  the other three files (this was the original TS2304 error source).
- `db/schema.ts`: barrel re-export of every row type + `Database`.
- `db/migrate.ts`: `runMigrations` using Kysely `db.schema` + `sql` template. Ledger
  `schema_migrations` (id, applied_at) accessed via raw SQL because it is deliberately **not** typed
  in `Database`. `create table if not exists` is valid on both engines.
- `db/migrations/0001..0013` + `index.ts`: 13 migrations, all 40 tables. Types: `varchar(26)` ULIDs,
  `varchar(30)` ISO-8601 UTC timestamps, `integer` for 0/1 booleans, `double precision` measurements,
  `text` JSON.
- `db/migrate-cli.ts`: dotenv → loadConfig → createDatabase → runMigrations → destroy.
- `db/seed.ts`: `seedBase(db, pepper)` — idempotent tenant `demo-hospital`, 4 staff (`dr.rao`,
  `nurse.mehta`, `triage.desk`, `admin.patil`; all password `demo-pass-1234`), 1 kiosk
  (`OPD Block A Kiosk 2`; `DEMO_KIOSK_DEVICE_TOKEN = 'dev-kiosk-token-opd-a-2-replace-me'`, sha256
  hashed), 3 consent versions (1.0.0 × en/hi/mr).
- `db/seed-demo-patient.ts` (patient + encounters), `seed-demo-prior.ts` (prior facts: metformin,
  Hb 11.2), `seed-demo-current.ts` (chest pain + dyspnoea, Hb 9.2, SpO2 93, "no medications"
  statement **contradicted** by metformin, contradiction row), `seed-demo.ts` (orchestrator).
  **Fixed ids** `01JDEMO00000000000000001..3` so the demo is addressable.
- `db/seed-cli.ts`: `--profile base|demo`.

**Platform**
- `platform/logger.ts`: pino with PHI key-pattern scrub + pino `redact.paths`; pretty only in
  dev/test.
- `platform/audit.ts`: `appendAuditEvent` — append-only, PHI-free, returns boolean, never throws.
  Full `AuditAction` union (~50 actions).
- `platform/http-errors.ts`: one error handler → contract envelope; ZodError → 400 with field list;
  Fastify 4xx → generic code; unknown → 500 with cause logged server-side only. Also not-found
  handler, `X-Request-Id` echo, and a guard that **rejects any `X-Tenant-Id` header**.

**Auth (under `auth/`)**
- `auth/types.ts`: `LoginRequest`, `AuthenticatedPrincipal`, `LoginOutcome`.
- `auth/repository/user.repo.ts`: `createUserSchema`, `parseRoles` (fails closed), `findUserByUsername`,
  `findUserById`, `insertUser` (pepper passed in, never read from env here), `touchLastLogin`.
- `auth/repository/tenant.repo.ts`: `findTenantBySlug`, `parseBranding`, `parseEnabledLocales`.
- `auth/service/auth.service.ts`: `AuthService.login()` — check order tenant → user → password →
  active → roles. **Unknown user performs a bcrypt compare against a cached dummy hash so the
  unknown-user path costs the same as wrong-password** (prevents username enumeration by timing).
  Byte-identical message for both: "Invalid username or password." Audit on every outcome.
  Also `logout()`, `can()`, `permissionsFor()`.
- `auth/middleware/authenticate.ts`: `authenticateStaff(request, config)` — audience
  `medikiosk.staff` + `kind==='STAFF'`; expired → "session expired" message; other rejections →
  generic 401.
- `auth/routes/auth.routes.ts`: `POST /api/v1/auth/login` (200 token/expiresAt/user/permissions/
  tenant), `POST /api/v1/auth/logout` (204), `GET /api/v1/auth/me` (200 user/tenant/permissions).
  Login body uses `password: min(1)` deliberately — do not disclose the policy at login.

**App + entry**
- `app.ts`: `buildApp({ config, db, logger, now? })` factory (not a singleton; tests need injection).
  helmet, cors (origins from config), rate-limit global 300/min. `GET /health` (no DB),
  `GET /ready` (DB probe), `GET /api/v1/capabilities`, auth routes. `trustProxy: true`,
  `bodyLimit: 1 MiB`, custom `genReqId`.
- `index.ts`: dotenv → loadConfig → logger (mock + dev-secrets warnings) → createDatabase → buildApp
  → listen → SIGINT/SIGTERM graceful shutdown.

---

## 3. Files Changed (this subphase)

Created (all new; the repo had no prior source):

| Path | Why it matters |
|---|---|
| `packages/shared-types/src/{ids,provenance,response-state,triage,result,errors,clock,index}.ts` | Shared vocabulary; every other package imports from here. |
| `packages/clinical-schema/src/**` (16 files incl. `ontology/` and `pathways/`) | Canonical clinical model, ontology, pathways, normalisation. |
| `packages/safety-rules/src/{types,engine,assess,coverage,index}.ts` + `rules/{cardio-respiratory,neuro-infection,bleeding-metabolic,electrolyte-special}.ts` | Deterministic triage; 43 rules. |
| `packages/auth/src/{permissions,tokens,passwords,index}.ts` | Reusable auth primitives. |
| `services/api/src/config/{env,capabilities,env-with-capabilities}.ts` | Validated boot config + capability declaration. |
| `services/api/src/db/{kysely,tables,tables-clinical,tables-evidence,tables-system,schema}.ts` | Row types + dual-dialect connection. |
| `services/api/src/db/migrate.ts`, `db/migrate-cli.ts` | Migration runner + CLI. |
| `services/api/src/db/migrations/0001..0013` + `index.ts` | All 40 tables. |
| `services/api/src/db/{seed,seed-cli,seed-demo-patient,seed-demo-prior,seed-demo-current,seed-demo}.ts` | Idempotent seed + longitudinal demo case. |
| `services/api/src/platform/{logger,audit,http-errors}.ts` | PHI-safe logging, audit writer, error mapping. |
| `services/api/src/auth/{types.ts,middleware/authenticate.ts,repository/{user,tenant}.repo.ts,service/auth.service.ts,routes/auth.routes.ts}` | Working staff auth. |
| `services/api/src/{app,index}.ts` | Fastify factory + bootstrap. |
| `package.json`, `tsconfig.base.json`, `.gitignore`, `.env.example` | Workspace + toolchain. |
| `docs/**` (29 markdown files) | ADRs, contract, architecture. |

Pre-existing from teammates (unchanged this subphase): `packages/i18n/**` (14 files),
`packages/{evidence-model,fhir-models,ui}/package.json` (manifests only, **no source**),
`apps/{kiosk,console}/package.json` (manifests only, **no source**),
`docs/**`.

Deleted: none of consequence. `packages/clinical-schema/src/lab-models.ts` was replaced by
`lab-analysis.ts`; `index.ts` was updated accordingly. A broken `services/api/src/auth/repository/
user.repo.ts` draft was rewritten in place (it had imported from a non-existent `../tokens.js`).

Not created (manifests exist, source does not): `packages/evidence-model/src`,
`packages/fhir-models/src`, `packages/ui/src`, `apps/kiosk/src`, `apps/console/src`,
`infra/*`, `.github/workflows/*`, `scripts/*`, `data/*`, `evaluation/*`, `tests/*`.

---

## 4. Current Architecture / State

```
apps/kiosk (manifest only)   apps/console (manifest only)
        │                            │
        └──────────── HTTP ──────────┘
                     │
        services/api  (Fastify 5, CommonJS)
        ├─ config/    env (Zod) + capabilities
        ├─ db/        Kysely (sqlite | postgres), tables, migrations, seed
        ├─ auth/      repository → service → routes, middleware
        └─ platform/  logger (pino, PHI scrub), audit, http-errors
                     │
   packages/: shared-types ← clinical-schema ← safety-rules
                              clinical-schema ← auth (peer via @medikiosk/auth)
```

- **Package dependency direction:** `shared-types` has no workspace deps. `clinical-schema` depends
  on `shared-types` + `zod`. `safety-rules` depends on `clinical-schema` + `shared-types` + `zod`
  (it reuses `evaluateTrigger` / `TriggerContext` rather than defining a second expression language).
  `auth` depends on `shared-types` + `bcryptjs` + `jose` + `zod`. `services/api` depends on all of
  the above + `fastify` + `kysely` + `better-sqlite3` + `pg` + `pino` + `ulid` + `dotenv`.
- **Data flow (auth):** request → `auth.routes` → `AuthService.login` → `tenant.repo.findTenantBySlug`
  → `user.repo.findUserByUsername` → `verifyPassword` (bcrypt + pepper) → `signStaffToken` →
  `appendAuditEvent`. Subsequent requests: `Authorization: Bearer` → `authenticateStaff` →
  `verifyToken` (audience + kind) → principal.
- **Storage conventions:** every clinical table has `tenantId` + index; timestamps are ISO-8601 UTC
  `varchar(30)`; booleans are `integer` 0/1; JSON is `text` with Zod parsing at the repository
  boundary; ids are 26-char ULIDs via `ulid()`.
- **Env required to boot locally:** `MEDIKIOSK_JWT_SECRET`, `MEDIKIOSK_SESSION_ENCRYPTION_KEY`,
  `MEDIKIOSK_HASH_PEPPER` (dev defaults accepted outside production),
  `MEDIKIOSK_SQLITE_PATH` (default `./.medikiosk-data/medikiosk.sqlite`). See `.env.example`.
- **Build:** each package compiles independently with `tsc -p tsconfig.json` (CommonJS, `dist/`).
  `services/api` imports workspace packages via their `dist/` (`main`/`types` in package.json), so
  **packages must be built before `services/api` type-checks against them**.
- **Feature flags** are env-driven (`FEATURE_*`), read in `env.ts::readFeatureFlag`, exposed via
  `/api/v1/capabilities`. No DB-backed flag store yet.

---

## 5. Decisions Made

1. **Dual-dialect DB via Kysely, not Prisma.** Prisma binds one schema to one provider. Kysely's
   `db.schema` builder is dialect-neutral and maintained by the query library. Consequence:
   `db/migrate-types.ts` (a custom `MigrationBuilder` abstraction) is now **dead code** — the runner
   does not use it. Consider deleting it in the next phase.
2. **Migration ledger via raw SQL.** `schema_migrations` is infrastructure, not domain data; typing it
   in `Database` would invite application code to read it.
3. **Booleans as `integer` 0/1; timestamps as ISO `varchar(30)`.** SQLite has no native boolean and no
   shared time function with Postgres. Repositories must map to `boolean` at the boundary.
4. **Unknown-user login burns a bcrypt compare.** Prevents username enumeration by timing. The dummy
   hash is cached per process (a full bcrypt per failed lookup would be a DoS vector). Preserve this.
5. **Single error handler in `platform/http-errors.ts`.** Routes throw `MediKioskError`; they never
   map status codes. Adding an error code means editing `ERROR_CODES`/`ERROR_STATUS` in
   `packages/shared-types/src/errors.ts` and nothing else.
6. **`X-Tenant-Id` header is rejected.** Tenant always comes from the token.
7. **Login body `password: min(1)`, creation `min(8)`.** Do not disclose the password policy from the
   login endpoint.
8. **`packages/safety-rules` reuses clinical-schema's trigger language.** One grammar for pathways and
   rules. Changing `TriggerContext` affects both; rebuild clinical-schema before safety-rules.
9. **Gapped concept matching added.** Exact longest-match alone missed code-mixed input ("chest mein
   kal se pain"). The gapped pass requires all content words and only skips stopwords — do not loosen
   it without a false-positive check.
10. **Seed uses fixed ids** (`01JDEMO...`) so demo and evaluation can address fixtures.
11. **`app.ts` is a factory**, not a module-level instance, so tests can inject config/db/clock.
12. **CommonJS everywhere** (`tsconfig.base.json`, moduleResolution Node). Imports in `services/api`
    are **extensionless**; `.js` extensions in relative imports broke resolution earlier.
13. **`sync_jobs` (interop outbox) vs `jobs` (internal background work)** are separate tables on
    purpose — a backlog in one must not starve the other.

---

## 6. Requirements and Constraints

- **The LLM is never the triage authority.** Only `packages/safety-rules` (deterministic) may set a
  triage level (ADR-009).
- **No clinical claim without evidence.** Claims reference `evidence` rows; `originClass` is one of
  four values and is never silently converted (ADR-005).
- **"Not asked" is never "no".** `allergy_status` is separate from `allergy_records`;
  `RESPONSE_STATES.DECLINED` / `UNKNOWN` are terminal and must never be coerced to a negative.
- **PHI never in logs.** `platform/logger.ts` scrubs; `platform/audit.ts` writes codes/keys/counts
  only. `LOG_PHI` defaults false.
- **Tenant isolation.** Every clinical row has `tenantId`; repositories take the tenant from the
  principal, never the request body; cross-tenant reads should 404, not 403.
- **Audit is append-only.** No update/delete path for `audit_events`.
- **Mocks must be declared.** `/api/v1/capabilities` must keep reporting OCR/LLM/identity as MOCKED
  while they are mocks.
- **Production refuses dev-default secrets** (`env.ts`). Do not weaken this.
- **Relative imports in `services/api` are extensionless** (moduleResolution Node). Do not add `.js`.
- **Consent guard before sensitive processing** — not yet implemented. When adding it, put the guard
  in the service/domain layer, not the route (ADR-007).
- **Idempotency-Key** on mutating endpoints — not yet implemented; the ledger table exists.
- **Never renumber `MK-*` concept codes** or pathway question keys once published; evidence and
  localisation reference them.
- **Never fabricate capability claims.** Statuses are IMPLEMENTED / PARTIALLY IMPLEMENTED / MOCKED /
  PLANNED / BLOCKED (see `docs/LIMITATIONS.md`).

---

## 7. Testing and Verification

**Actually executed this session (all passed):**

| Check | Command | Result |
|---|---|---|
| Type-check ×5 | `node_modules\.bin\tsc.cmd --project <tsconfig>` for shared-types, clinical-schema, safety-rules, auth, services/api | exit 0 for all five |
| Migrations on fresh SQLite | `node node_modules/tsx/dist/cli.mjs services/api/src/db/migrate-cli.ts` | "Applied 13 migration(s): 0001_identity … 0013_admin" |
| Seed base + demo | `… seed-cli.ts --profile demo` | "Seeded tenant …: 4 staff, 1 kiosk(s), 3 consent version(s)" + "Seeded demo case" |
| Server boot | `node services/api/dist/index.js` (port 8099) | Boot logs with four mock/dev-secrets warnings, then listens |
| `GET /health` | HTTP GET | **200** `{"status":"ok","version":"0.1.0","uptimeSeconds":5}` |
| `GET /api/v1/capabilities` | HTTP GET | **200** |
| `POST /api/v1/auth/login` valid | `{"tenantSlug":"demo-hospital","username":"dr.rao","password":"demo-pass-1234"}` | **200**, JWT with roles `["PHYSICIAN"]` |
| `POST /api/v1/auth/login` unknown user | `username:"ghost"` | **401** |
| `POST /api/v1/auth/login` unseeded tenant | against migrated-but-unseeded DB | **403** (UNKNOWN_TENANT) — correct |

**Not executed / not verified:**
- **No vitest tests exist.** `vitest run` finds zero `*.test.ts` files; nothing is under automated
  test. The verification above was manual against a running server.
- `GET /api/v1/auth/me` and `POST /api/v1/auth/logout` were **not** called (routes compile; the guard
  path is unexercised).
- **Postgres dialect never executed** (no Postgres available). The pg path compiles; only SQLite ran.
- `packages/i18n` compile/tests were not re-run this session.
- No root `npm run build` / `npm run test` / lint / format check was run; there is no root vitest
  config yet.

---

## 8. Known Issues / Risks

**Confirmed:**
1. **Zero automated tests.** The clinical schema, safety engine and auth flow have no unit tests.
2. **`db/migrate-types.ts` is dead code** (the runner uses Kysely's schema builder directly).
3. **Zero git commits.** All work is untracked on `main`.
4. `packages/evidence-model`, `packages/fhir-models`, `packages/ui`, both apps, `infra/`,
   `.github/workflows/`, `scripts/`, `data/`, `evaluation/`, `tests/` have **manifests but no source**.
5. `db/seed.ts` still declares a `SeedReport` interface no longer used as its return type.

**Might be problems (unverified):**
6. Kysely `createIndex(...).unique()` — migrations ran, but uniqueness was not tested with duplicate
   inserts.
7. Postgres column-type acceptance (`double precision`, `varchar(30)`) is reasoned, not executed.
8. Rate limiting is global 300/min with no per-route login throttling yet (contract calls for 429 on
   brute force).
9. Contract endpoints beyond auth (encounters, interview, documents, triage, summary, FHIR, ABDM,
   admin) are specified but **not implemented**.

---

## 9. Unfinished Work

- **No vitest config or tests** — implied by "Definition of endpoint done" (contract §17).
- **`/auth/me`, `/auth/logout` untested**, even manually.
- **`touchLastLogin` defined but never called** by `AuthService.login` — call it or remove it.
- **Kiosk device-token auth** (`X-Kiosk-Id` + `X-Kiosk-Token`) and `POST /api/v1/kiosk/sessions` are
  not implemented; `kiosks.deviceTokenHash` and `signKioskToken` exist unused.
- **Idempotency middleware** not implemented despite the table.
- **Per-route rate limit on login** not configured.
- **`migrate-types.ts` dead code** to delete.
- **Git initial commit** not made.
- **`infra/`, `.github/workflows/`, `scripts/`** were planned but never created (teammate failed).

---

## 10. Next Subphase

Recommended order (Phase 2 per `docs/BASELINE.md`: kiosk, identity, consent, localisation — but close
the foundation gaps first):

1. **Make an initial git commit** of the current state.
2. **Add a root `vitest.config.ts`** (include `packages/**/*.test.ts`, `services/**/*.test.ts`,
   `tests/**/*.test.ts`) and first tests: `evaluateTriage` (determinism, chest-pain+dyspnoea → RED,
   chest-pain alone → GREEN, SpO2/systolic thresholds, DATA_INCOMPLETE advisory), `AuthService.login`
   (unknown-user and wrong-password produce identical messages), migration idempotence, and
   `/health` + login/me/logout via `app.inject`.
3. **Wire `touchLastLogin`** into a successful login.
4. **Implement kiosk session endpoints** (`POST /api/v1/kiosk/sessions`, `.../wipe`,
   `GET /api/v1/kiosk/sessions/:id`) using `signKioskToken` and the sha256 device-token compare —
   this unblocks the kiosk app.
5. **Implement consent endpoints** (`GET /api/v1/consent/versions`,
   `POST /api/v1/kiosk/consent`, `POST /api/v1/consent/:id/revoke`) with the guard in the service
   layer.
6. **Then** start `apps/kiosk` (Vite + React 18 + Tailwind 3; manifest exists) against the seeded
   demo data.
7. Keep `/api/v1/capabilities` in sync with every provider introduced.

Files likely involved: `services/api/src/auth/**`, new `services/api/src/kiosk/**`,
new `services/api/src/consent/**`, `vitest.config.ts`, `apps/kiosk/src/**`.

---

## 11. Critical Context

- **Rebuild order matters:** `shared-types` → `clinical-schema` → (`safety-rules`, `auth`) →
  `services/api`. `services/api` resolves workspace packages through their `dist/`, so a stale
  `dist/` causes phantom type errors.
- **Running tsx (Windows PowerShell):** the working invocation is
  `node 'C:/Projects/MediKiosk/node_modules/tsx/dist/cli.mjs' '<script.ts>'` with env vars set via
  `;`-separated statements. tsx lives at the **repo root**, not in `services/api/node_modules`.
- **Path style:** use `C:/...` forward slashes; `&&` is **not** a valid separator in this PowerShell
  environment — use `;`.
- **better-sqlite3 ships prebuilt binaries** inside the npm package — no compiler needed.
  `allowScripts` in the root `package.json` whitelists `esbuild`; blocking `node-gyp` for
  better-sqlite3 is harmless.
- **`evaluateTrigger` is total and never throws**; a missing fact makes a positive predicate false.
  Correct for pathway entry, but safety handles missing data separately via the advisory rule
  `DATA_INCOMPLETE_SAFETY_001`, keyed off `safetyCriticalUnresolvedQuestionKeys`.
- **Vitals in the trigger context are double-keyed**: `MK-VIT-001:SYSTOLIC` and plain `MK-VIT-001`,
  so blood-pressure rules can target a component. Implausible vitals are **excluded** from rule
  evaluation but still stored and flagged.
- **Demo credentials:** tenant `demo-hospital`; users `dr.rao`, `nurse.mehta`, `triage.desk`,
  `admin.patil`, all password `demo-pass-1234`; kiosk device token
  `dev-kiosk-token-opd-a-2-replace-me`.
- **Dev secrets (local only):** `dev-only-insecure-jwt-secret-replace-me`,
  `dev-only-insecure-session-key-replace-me`, `dev-only-insecure-pepper-replace-me`.
- **Teammates:** the four agents spawned earlier all failed (inference cap / connectivity). What
  survived from them: `packages/i18n/**` and `docs/**`. `infra/`, `.github/workflows/`, `scripts/`
  were **not** created despite the plan.
- **`.medikiosk-data/`** holds local SQLite DBs (`medikiosk.sqlite`, `verify-handoff.sqlite`) and
  server logs; it is git-ignored.

---

## 12. Agent Instructions

**State:** five packages compile clean; `services/api` compiles, boots and serves a verified staff
login on SQLite; 13 migrations apply cleanly; seed is idempotent; **zero tests, zero commits, no UI,
no infra, no CI**.

**Inspect first, in this order:**
1. `docs/api/CONTRACT.md` — the authoritative endpoint spec.
2. `docs/adr/ADR-001..011` — the binding architectural decisions.
3. `packages/clinical-schema/src/pathways/index.ts` and `packages/safety-rules/src/assess.ts` — the
   two engines everything else will call.
4. `services/api/src/app.ts` and `auth/service/auth.service.ts` — the working pattern to copy for
   every new module (types.ts / repository / service / routes; routes do validate → call → format).

**Do not rewrite:** the domain packages, the migration set, the auth service's timing-equalisation
behaviour, the central error handler and envelope, the PHI-scrubbing logger, or the seed fixtures'
fixed ids.

**Preserve:** the rules in §6 (they are the product's safety spine) and the working dev workflow in
§11 (tsx path, PowerShell `;` separators, forward-slash paths).

**Next objective:** close the foundation gaps (git commit, vitest + first tests, `touchLastLogin`,
kiosk session endpoints, consent endpoints), then begin `apps/kiosk` against the seeded demo data.