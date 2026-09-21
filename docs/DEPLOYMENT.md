# MediKiosk deployment (local demo)

## Prerequisites

Node.js ≥ 20.11, npm ≥ 10. No external credentials, no Docker.

## Steps

```powershell
npm ci
Copy-Item .env.example .env
npm run demo:up        # migrate + seed synthetic cohort
npm run dev:api        # http://127.0.0.1:8080
npm run dev:kiosk      # http://127.0.0.1:5173 (proxies /api to 8080)
npm run dev:console    # http://127.0.0.1:5174 (proxies /api to 8080)
```

Production builds: `npm run build` (API `tsc`, kiosk `vite build`). The console needs no
build. `npm run verify` is the release gate.

## Configuration

`.env.example` is the complete reference. For any non-local deployment replace the three
`dev-only-insecure-*` secrets (production refuses to boot on them), set `DATABASE_URL` with
`MEDIKIOSK_DB_DIALECT=postgres`, and terminate TLS in front of the API. Uploads live under
`MEDIKIOSK_UPLOAD_DIR` (default `./.medikiosk-data/`).

## What is NOT production-ready

Postgres has never been executed (SQLite is the exercised path); no containers, no TLS, no
backups, no monitoring, no ABDM credentials, no DPDPA review. See LIMITATIONS.md — do not
deploy this against real patient data without those reviews.
