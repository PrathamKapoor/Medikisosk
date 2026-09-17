# MediKiosk — Project Handoff

Written 2026-09-17 after the kiosk registration + consent subphase. Inspect the repository before
acting on any statement below; this document was written from the actual files on disk and from
fresh verification runs, not from memory. There is no handoff-generation script in the repository;
the procedure is to rewrite this file to match the measured repository state after each subphase.

---

## 1. Current Phase

- **Phase:** 2 of 21, subphase "kiosk registration + consent lifecycle" — per `docs/BASELINE.md`
  roadmap (Phases 0–1 foundation complete; hard-won corrections below).
- **Status:** **Complete.** The API boots with device-authenticated kiosk sessions, synthetic
  identity, granular consent with a service-layer guard, idempotent mutations, TTL/locale
  handling and wipe. The patient kiosk (React 18 + Vite 6) drives the real endpoints end-to-end.
  All quality gates pass (build, typecheck, ESLint, 27 tests, Prettier check).
- **Remaining phases (not started):** interview runtime, voice/ASR/TTS, document/OCR, vitals,
  physician console, AYUSH runtime, FHIR, ABDM, offline/sync, analytics, evaluation harness,
  deployment artefacts, security hardening, E2E clinical validation, SIH polish, startup
  readiness.

**Overall project objective:** MediKiosk — an AI-assisted, multimodal, multilingual clinical
intake platform for Indian OPDs, with deterministic safety rules, evidence-grounded AI, and
FHIR/ABDM interoperability. The master prompt's later phases are separate work; the contract and
the ADRs remain the design authority.

**Repository note:** git is on `main`; commits `4e497c8` (Phase 1 foundation) and **`0a4a28e`
(this subphase)**. Working tree is clean.

---

## 2. Work Completed

### 2.1 Foundation closure (from the interrupted session, now verified)

- **Root tooling:** `package.json` `build` runs `build:foundation` (six implemented workspaces in
  dependency order: shared-types → clinical-schema → auth → i18n → safety-rules → api) then the
  kiosk workspace. Manifest-only packages (`evidence-model`, `fhir-models`, `ui`, `console`) are
  **not** built — they have no `tsconfig.json` and no source. No empty shared tsconfig was added;
  missing implementations stay visible.
- **Quality gates:** root `typecheck` (build:foundation + kiosk `tsc --noEmit` + `tsconfig.test.json`),
  real ESLint 9 flat config `eslint.config.mjs` (@eslint/js + typescript-eslint; unicode-safety
  rules enforced), Prettier `format`/`format:check` scoped to implemented code, `vitest` root suite
  with `pretest` that builds foundations first. `tsconfig.test.json` type-checks tests; production
  builds exclude `**/*.test.ts`.
- **Tests:** `vitest.config.ts` (root), `services/api/src/testing/test-app.ts` (`buildTestApp` —
  in-memory SQLite, FK ON, migrations, base + demo seed, frozen clock `TEST_NOW`, injected
  logger/now), `services/api/src/db/migrate.test.ts` (idempotence + ledger preservation),
  `services/api/src/auth/routes/auth.routes.test.ts` (6 tests: login/me/logout, timing-equalised
  unknown-user vs wrong-password, disabled accounts, last-login failure absorbed without leaking
  DB payload, token expiry at advertised instant via injected clock, per-IP login throttle).
- **Auth fixes:** `touchLastLogin` wired into successful login (best-effort, absorbed errors);
  `AuthService`/`authenticateStaff`/routes/`signStaffToken` take an injectable `now`;
  **`classifyRejection` fixed** in `packages/auth/src/tokens.ts` — audience check now runs first,
  because jose's audience-failure text contains "unexp**exp**ected", whose "exp" substring was
  misread as token expiry (broke the staff-wipe fallback). Regression test in
  `packages/auth/src/__tests__/tokens.test.ts` (2 tests).
- **Formatting:** Prettier normalized the pre-existing domain sources (large but cosmetic diff).

### 2.2 Kiosk session lifecycle (new)

Files: `services/api/src/kiosk/{session.repo.ts, replay.ts, kiosk.service.ts, kiosk.routes.ts,
lifecycle.test.ts}`, migration `services/api/src/db/migrations/0014-session-lifecycle.ts`
(idempotency_keys gains `sessionId`), `services/api/src/db/migrations/index.ts`,
`services/api/src/db/tables-system.ts`.

- `POST /api/v1/kiosk/sessions` — device-auth via `X-Kiosk-Id` + `X-Kiosk-Token` headers (sha256
  hash compare), tenant-scoped, ACTIVE kiosk only, cross-tenant → 404. Returns
  `{ sessionId, token, expiresAt, ttlMinutes, kiosk: {id,name}, tenant: {id,name,slug} }`.
  `MEDIKIOSK_SESSION_TTL_MINUTES` honored (default 45).
- `GET /api/v1/kiosk/sessions/:sessionId` — bearer session token; returns
  `{ sessionId, patientId, locale, status, expiresAt, remainingSeconds, step, consent? }` with
  `step` = IDENTITY | CONSENT | STOPPED | COMPLETE.
- `PATCH /api/v1/kiosk/sessions/:sessionId` `{locale}` — state-preserving language switch;
  existing consent's recorded locale is NOT rewritten (consent keeps the language originally
  presented). Requires published consent wording for the target locale.
- `POST /api/v1/kiosk/sessions/:sessionId/wipe` — session-token owner OR staff with
  `kiosk.manage` (staff fallback catches only `UNAUTHENTICATED`, now correctly classified).
  Deletes identity challenges + the session's replay buffers; marks session ENDED/wiped; retains
  clinical record + audit. Response distinguishes transient vs record:
  `{ wiped, transientArtifactsDeleted, identityChallengesDeleted, clinicalRecordRetained }`.
- `sweep()` on app ready + every minute (unref'd timer, cleared on close): expires ACTIVE
  sessions past TTL, deletes expired challenges and expired idempotency rows.
- `app.ts`: `trustProxy: false` (per-IP throttle needs the real IP; behind a proxy the operator
  must set it deliberately), routes registered, sweep timer wired.

### 2.3 Identity (synthetic only)

`services/api/src/identity/identity.service.ts`.

- `POST /api/v1/kiosk/identity/start` `{method: GUEST|ABHA_OTP|ABHA_QR|RETURNING}`. Guest →
  creates a minimal patient row bound to the session, returns
  `{ guestRef, patientId, providerName:'mock', verified:false }`. OTP-style methods → mock
  challenge `{ challengeId, otpLength:6, expiresAt, providerName:'mock' }`; demo OTP is always
  `123456` (HMAC-SHA256 digest stored with the hash pepper; never the raw OTP).
- `POST /api/v1/kiosk/identity/verify` — timing-safe compare, max 5 attempts, 5-minute challenge
  TTL, one challenge per session (replaced on restart), consumed/patient-bound → 409.
  Success binds the patient to the session and returns
  `{ patientId, verified:true, providerName:'mock', displayNameMasked:'Synthetic demo participant' }`.
- **Honesty:** `IDENTITY_PROVIDER !== 'mock'` → `IDENTITY_PROVIDER_UNAVAILABLE`. No real ABHA is
  ever collected or claimed; the UI says so. Real ABDM/ABHA remains BLOCKED (no credentials).

### 2.4 Consent engine

`services/api/src/consent/{versions.ts, consent.service.ts}`, migration 0014 publishes consent
**v1.1.0** (en-IN, hi-IN, mr-IN) with per-purpose `statementKey, statement, action, destination,
translationVersion`; **v1.0.0 is preserved** (not rewritten).

- `GET /api/v1/consent/versions?locale=` — no auth (wording must be readable pre-auth).
- `POST /api/v1/kiosk/consent` — `{ sessionId, patientId, consentVersion, locale, method:
  TOUCH_CONFIRMED, decisions:[{purpose,granted,categories,action?,destination?}] }`. Validates
  against the published version: decisions must cover every purpose, categories must be a subset,
  declined purposes carry no categories, action/destination must match the published scope.
  Partial consent is a first-class 201; declining everything is a 201 with `stopRequired:true`
  (declining is valid input, never a coerced error). `granted:true` with empty categories grants
  nothing. Consent `expiresAt` = session expiry; `sessionConsent` reads the latest row.
- `POST /api/v1/consent/:consentId/revoke` `{reason:'PATIENT_REQUEST'}` — immediate; every
  subsequent `requireConsent` guard fails. `stopRequired` reflects revocation/expiry/missing
  treatment scope.
- **`requireConsent(db, {tenantId, patientId, sessionId, purpose, category, action, destination})`**
  — the domain-layer guard (ADR-007): session must exist/be active and patient-bound, consent
  must exist, not revoked, not expired, and the exact purpose+category+action+destination must be
  granted. Called inside the same transaction as the protected operation.
- `GET /api/v1/patients/:patientId/consents` — staff `patient.read`.

### 2.5 Idempotency (replay)

`services/api/src/kiosk/replay.ts`. All mutating kiosk endpoints accept `Idempotency-Key`
(UUID or ULID; anything else → 400). Scope = `tenant:actor:route`; stored key is a sha256 of
that scope + key (actor :: `device:<id>` / `session:<id>` / `staff:<id>`); canonical-payload
sha256 prevents offline OTP guessing; response cached **AES-256-GCM encrypted** with
`MEDIKIOSK_SESSION_ENCRYPTION_KEY` (never a plaintext token/OTP). Same key+payload replays the
original response; same key different payload → `409 IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD`;
expired replay window → 409. `INSERT ... ON CONFLICT DO NOTHING` serializes concurrent same-key
requests on both dialects.

### 2.6 Patient kiosk UI

`apps/kiosk/{index.html, vite.config.ts, tsconfig.json, src/{main.tsx, App.tsx, Consent.tsx,
api.ts, styles.css}}`, i18n additions `packages/i18n/src/registration.ts` + catalogue keys
(en-IN, hi-IN, mr-IN). React 18, plain CSS (teal/ink patient-first tokens), no UI framework.

- Flow: **operator setup** (device id + token entered in-memory only, never bundled/stored) →
  welcome (4-step progress, language grid: en/hi/mr enabled; gu/ta/te/bn/kn visibly disabled with
  "Consent translation unavailable") → **Begin registration** (POST session, "45 min remaining"
  shown) → identity (Continue as guest / synthetic demo OTP field `#demo-otp`) → consent screen
  (purpose "Allow this purpose" + granular category checkboxes: Identity details, Symptoms and
  history, Documents you upload, Voice recordings, Vitals, Session metrics; "Save my choices" /
  "Decline all and save") → saved receipt → "Withdraw consent" → "Finish and clear this screen".
- Language tiles call `changeLanguage` (GET consent/versions for locale + PATCH session when one
  exists); in-memory state is preserved; no sessionStorage/localStorage anywhere.
- Inactivity: warning dialog at 4 min, wipe + clear at 5 min OR server `expiresAt` (checked every
  second + on visibilitychange). Wipe posts to the server, clears all patient state, shows a
  cleared notice. No fake interview/OCR/offline capability; the receipt tells the patient
  registration is saved and staff will continue (interview engine is not implemented).
- Vite dev proxy `/api` → `API_PROXY_TARGET` (default `http://localhost:8080`); run from repo
  root: `node node_modules/vite/bin/vite.js apps/kiosk --port 5173`.

### 2.7 Capability honesty

`services/api/src/config/{env.ts, capabilities.ts}` — boot warnings/capabilities now say the
truth: identity MOCKED, llm/asr/tts/ocr PLANNED (no pipelines exist), abdm BLOCKED, all feature
flags false. `docs/BASELINE.md` phase roadmap corrected (no phase is release-complete; statuses
re-labelled); `docs/api/CONTRACT.md` gained an implementation-boundary note, the session `token`
field, `PATCH` locale, guest `patientId`, and a synthetic-identity boundary note; `docs/deployment/LOCAL.md` written; `docs/PHASE-2-PLAN.md` records intent.

### 2.8 Verification harness

`scripts/smoke-kiosk.cjs` — throwaway-but-kept HTTP harness covering open/replay/409, guest,
OTP failure cap, partial consent, locale PATCH, revoke→STOPPED, wipe, staff wipe.

---

## 3. Files changed this subphase (all uncommitted)

Created: `services/api/src/kiosk/{session.repo,replay,kiosk.service,kiosk.routes,lifecycle.test}.ts`,
`services/api/src/identity/identity.service.ts`, `services/api/src/consent/{versions,consent.service}.ts`,
`services/api/src/db/migrations/0014-session-lifecycle.ts`, `services/api/src/testing/test-app.ts`,
`services/api/src/db/migrate.test.ts`, `services/api/src/auth/routes/auth.routes.test.ts`,
`services/api/src/kiosk/...`, `packages/auth/src/__tests__/tokens.test.ts`, `vitest.config.ts`,
`tsconfig.test.json`, `eslint.config.mjs`, `packages/i18n/src/registration.ts`,
`apps/kiosk/**` (index.html, vite.config.ts, tsconfig.json, src/*), `docs/deployment/LOCAL.md`,
`docs/PHASE-2-PLAN.md`, `scripts/smoke-kiosk.cjs`.

Modified: root `package.json` (build/typecheck/lint/format/test wiring, kiosk appended),
`package-lock.json`, `tsconfig.base.json` (format), all domain package sources (Prettier only),
`services/api/src/{app,index}.ts`, `config/{env,capabilities,env-with-capabilities}.ts`,
`db/{kysely,schema,migrate,migrate-cli,tables-system,migrations/index,seed,seed-cli,seed-demo*}.ts`,
`db/migrations/0001..0013` (Prettier only), `auth/**` (now-injectable clock, touchLastLogin),
`platform/*` (Prettier only), `docs/{BASELINE.md, api/CONTRACT.md}`. Deleted:
`services/api/src/db/migrate-types.ts` (dead code, no callers).

---

## 4. Architecture / state

```
apps/kiosk (React 18, Vite 6, plain CSS)  ── /api proxy ──►  services/api (Fastify 5, CJS)
services/api: config(Zod) → db(Kysely sqlite|postgres, 14 migrations) → auth + kiosk + identity
              + consent modules (types/repo/service/routes pattern) → platform(logger/audit/errors)
packages: shared-types ← clinical-schema ← safety-rules ; auth ; i18n (8 locales, en/hi/mr
          + registration keys; others marked review-pending/unavailable)
```

- **Dependency order / staleness rule:** `services/api` resolves `@medikiosk/*` through their
  compiled `dist/`. After changing any package, rebuild **that package** (`npm run build --workspace
  @medikiosk/<name>`) and restart the API process — the smoke run caught this exact footgun
  (auth fix + stale auth dist + running process = old behavior).
- **Conventions kept:** timestamps ISO-8601 UTC `varchar(30)`, booleans `integer` 0/1, JSON
  `text` + Zod at repo boundary, ULID ids, `tenantId` on every clinical row, tenant from the
  principal (client-supplied `X-Tenant-Id` is rejected, 404 not 403 for cross-tenant), audit
  append-only and PHI-free, extensionless relative imports, CommonJS.
- **Boot:** `node services/api/dist/index.js` reads `.env` (git-ignored; dev defaults accepted
  outside production). Smoke env: `MEDIKIOSK_SQLITE_PATH=…/phase2-smoke.sqlite`,
  `API_PORT=8099` (8080 is occupied on this machine by Windows services; EACCES risk).

---

## 5. Decisions made this subphase (by Main or coordination)

1. **Root build excludes manifest-only workspaces.** No empty `tsconfig.json` placeholder —
   missing implementation must stay visible. Repayment: add the workspace to `build` when source
   lands.
2. **Classification fix is load-bearing:** audience error text ("unexpected") contains "exp";
   check audience before expiry or staff tokens get mislabelled EXPIRED (broke staff wipe).
3. **Idempotency scope = tenant+actor+route,** response cached encrypted (never plaintext
   credentials), canonical-body HMAC keyed by the session key.
4. **Consent 1.1.0 published; 1.0.0 preserved** (never silently rewrite published wording).
5. **Wipe deletes only transient data** (challenges, replay buffers); clinical records, consent
   and audit are retained (ADR-007); response makes the distinction explicit.
6. **Synthetic identity only; `providerName:'mock'` everywhere**; demo OTP `123456`; real ABHA
   BLOCKED. UI states this.
7. **`trustProxy:false`** so the login throttle sees real IPs; operators behind a proxy must set
   it deliberately.
8. **Language switch preserves clinical state;** recorded consent locale is immutable (already
   granted wording stays as presented).
9. **Deterministic-lint wins over regex cosmetics:** script-union regexes replaced with Unicode
   `\p{Script=…}` property escapes (also fixed ESLint `no-misleading-character-class` pairing
   artifacts); behavior verified identical before committing the change.

---

## 6. Requirements and constraints (unchanged, re-affirmed)

- The LLM is never the triage authority; no clinical claim without evidence; "not asked" is never
  "no"; PHI never in logs; mocks must be declared (`/api/v1/capabilities`); production refuses
  dev secrets; consent guard lives in the domain layer; never renumber `MK-*` codes / question
  keys; never fabricate capability claims.
- New: every mutating kiosk endpoint requires `Idempotency-Key` (UUID/ULID). Consent decisions
  are validated against the published version. Sessions, challenges, idempotency rows all expire.

---

## 7. Testing and verification (all executed fresh this session)

| Gate | Result |
|---|---|
| `npm run build` (foundation + kiosk) | PASS — 6 packages tsc + kiosk tsc+vite (44 modules) |
| `npm run typecheck` (kiosk tsc + tsconfig.test.json) | PASS |
| `npm run lint` (`eslint . --max-warnings 0`) | PASS |
| `npm test` (vitest, 5 files) | **27/27 PASS** — triage 10, migrate 2, auth 6, lifecycle 7, tokens 2 |
| `npm run format:check` | PASS (after Prettier pass + tokens test format fix) |
| Live HTTP smoke (`scripts/smoke-kiosk.cjs` vs real API on 8099, fresh migrate+seed) | ALL PASS: open+token, replay same key=same session, same key diff payload=409, guest, consent partial (analytics declined), view COMPLETE, PATCH locale hi-IN (consent locale stays en-IN), revoke→STOPPED, wipe→token SESSION_EXPIRED, 5 OTP fails + 6th correct=ATTEMPTS_EXCEEDED, staff wipe (identityChallengesDeleted=1) |
| Browser (Vite dev, real API) | Provisioning screen, welcome 4-step + language grid (unavailable locales labelled), Begin → R200 consent/versions + R201 sessions ("45 min remaining"), guest → R201 identity/start, consent screen with purpose + granular categories, Save → consent row persisted (verified in DB: session `01M2R4VH…` + consent v1.1.0, en-IN). Withdraw/finish proven via HTTP smoke + app logic (inactivity/TTL wipe also in code). |

**Not verified:** Postgres dialect (never executed here), no real ABHA/OCR/ASR (blocked by
design), no formal security review, no clinical validation.

---

## 8. Known issues / risks

1. ~~All this subphase's work is uncommitted.~~ **Resolved** — committed as `0a4a28e`.
2. **Vite dev harness flakiness observed:** one-time "optimized dependencies… reload" reloads
   destroy in-browser execution contexts mid-flow — a dev-server artifact, not an app defect,
   but it makes browser automation flaky on first interaction after dependency optimization.
3. **Trusted users restore `trustProxy:true`** when deploying behind a reverse proxy — otherwise
   the login throttle keys on the proxy IP.
4. `docs/BASELINE.md` §2–§6 still contain wording that reads like completed mitigations; the
   continuity correction + corrected roadmap at the top/§8 govern.
5. `MEDIKIOSK_TEMP_RETENTION_MINUTES` is unused by any real temp-artifact pipeline (none exists);
   it now bounds only the sweep interval floor via `Math.min(60_000, …)`.
6. Consent v1.1.0 hi-IN/mr-IN wording is machine-drafted (`PROVISIONAL` — native clinical review
   required per LIMITATIONS §7).
7. `apps/console`, `packages/{evidence-model,fhir-models,ui}` remain manifest-only; `data/`,
   `evaluation/`, `infra/`, `.github/workflows/` empty.

---

## 9. Unfinished work / next steps

- **Commit** the subphase (recommended: split into foundation closure, lifecycle API, kiosk UI,
  docs).
- Phase 3 (interview engine runtime): the domain vocabulary, pathways (70 question keys) and
  safety rules exist; the stateful `InterviewSession → policy → question → response → evidence`
  loop, enc/encounter routes, and the `POST /encounters/:id/submit` triage/queue wiring do not.
- Then: voice/touch fallback (Phase 4), documents (Phase 5), physician console (Phase 9) —
  each must replicate the types/repo/service/routes pattern and the idempotency + audit +
  consent-guard conventions now established.
- `docs/LIMITATIONS.md` should be re-snapshotted (its §2.3 measured state predates this work).

---

## 10. Critical context

- **PowerShell:** `;`, not `&&`; use `C:/` paths; tsx lives at repo root
  (`node node_modules/tsx/dist/cli.mjs …`).
- **Smoke recipe:** `.env` with `API_PORT=8099`, `MEDIKIOSK_SQLITE_PATH=…
  /phase2-smoke.sqlite`; `node node_modules/tsx/dist/cli.mjs services/api/src/db/migrate-cli.ts`;
  `… seed-cli.ts --profile demo` (prints kiosk id — kiosk 2 id `01M2QB2V9XGWNFTT8YJXTTWHPP` in
  the smoke DB; device token `dev-kiosk-token-opd-a-2-replace-me`); `node services/api/dist/index.js`;
  `node node_modules/vite/bin/vite.js apps/kiosk --port 5173` with `API_PROXY_TARGET=http://127.0.0.1:8099`.
- Rebuild-order rule (§4) — package dist staleness caused a real regression during this session.
- Staff demo login: tenant `demo-hospital`, `dr.rao`/`nurse.mehta`/`triage.desk`/`admin.patil`,
  password `demo-pass-1234`. Staff wipe requires `kiosk.manage` (admin.patil holds it).
- **Audit actions now in play:** SESSION_OPENED, SESSION_WIPED, INTERVIEW_LANGUAGE_CHANGED,
  IDENTITY_FLOW_STARTED, IDENTITY_VERIFIED, IDENTITY_VERIFICATION_FAILED, CONSENT_GRANTED /
  CONSENT_PARTIAL / CONSENT_DECLINED, CONSENT_REVOKED, CONSENT_VIEWED (+ staff auth actions).

**Next objective:** commit this subphase, then begin Phase 3 interview runtime against the
existing pathways/evidence model, keeping the lifecycle + idempotency + consent-guard conventions.