# Local development

MediKiosk currently targets synthetic development use. No clinical deployment, real ABHA, OCR, voice or offline intake is established. See the latest phase report and `handoff.md` before running a demonstration.

## Prerequisites

- Node.js >=20.11 and npm; this workstation uses Node 24.
- Install dependencies with `npm ci` from the repository root.
- SQLite uses `better-sqlite3`; install must provide a native binary compatible with your Node version and platform.

## Configure

Copy `.env.example` to `.env` locally and set its three `MEDIKIOSK_*` secrets. Development defaults are for local synthetic use only; production rejects those values. Never commit `.env`.

Use an absolute `MEDIKIOSK_SQLITE_PATH` so root and workspace-launched commands target the same database. Example:

```text
MEDIKIOSK_DB_DIALECT=sqlite
MEDIKIOSK_SQLITE_PATH=C:/Projects/MediKiosk/.medikiosk-data/medikiosk.sqlite
API_HOST=127.0.0.1
API_PORT=8080
KIOSK_ORIGIN=http://localhost:5173
IDENTITY_PROVIDER=mock
```

The CLI loads `.env` relative to its working directory. The explicit root invocations below avoid confusing that with `services/api/.env`.

## Initialize and run

From the repository root:

```sh
npm run build
node node_modules/tsx/dist/cli.mjs services/api/src/db/migrate-cli.ts
node node_modules/tsx/dist/cli.mjs services/api/src/db/seed-cli.ts --profile demo
node services/api/dist/index.js
```

In a second terminal:

```sh
npm run dev:kiosk -- --host 127.0.0.1
```

Open `http://localhost:5173`. Vite proxies `/api` to `http://127.0.0.1:8080`; set `API_PROXY_TARGET` before starting Vite to use a different API address. No device secret is compiled into the client bundle. An operator supplies the seeded device id and device token on the provisioning screen. Keep production device tokens separate from synthetic demo credentials.

Base seed staff: hospital `demo-hospital`, accounts `dr.rao`, `nurse.mehta`, `triage.desk`, `admin.patil`; synthetic password `demo-pass-1234`. Demo kiosk token: `dev-kiosk-token-opd-a-2-replace-me`. Obtain the kiosk id from the seed output or the local `kiosks` table; it is generated per database.

## Interview smoke

Phase 3 makes the kiosk drive a real clinical interview after consent:

1. On the saved-receipt screen choose **Begin clinical interview** — the app `POST`s the
   encounter and renders whatever `GET …/interview/next` returns (the UI never decides
   branching). For a demo patient who reported "chest pain", the first question is
   `q.chest_pain.safety_dyspnoea`; otherwise answer whatever the runtime asks.
2. Answer via touch cards / yes-no / text; a priority banner appears when `safetyStatus` is
   amber/red or human review is required (never a diagnosis — staff routing only).
3. Submit when the interview ends → `READY_FOR_REVIEW` with the triage level; finish clears the
   screen. An incomplete interview (declined/skipped questions) still submits and reports the
   outstanding list.

The interview works with no network and no AI: it is deterministic domain logic persisted in
SQLite. See `docs/interview/DOMAIN.md`.

## Expected boundary

Registration, consent and interview do not replace the physician. Finishing clears
patient-facing session state while retaining consent/audit and clinical records under server
retention policy. Reload behavior, inactivity policy and operational limitations are recorded in
the phase report.

## Verification

Run `npm run build`, `npm run typecheck` and `npm test`. The root build enumerates implemented workspaces in dependency order; manifest-only future packages are not buildable features. A passing SQLite test does not validate PostgreSQL. Lint and formatting status are reported independently; no silent empty workspace command counts as validation.
