# MediKiosk

**AI-assisted clinical intake infrastructure for Indian OPDs.**

MediKiosk is a safety-conscious modular monolith for consent-gated patient intake. It provides a multilingual, touch-first kiosk flow, deterministic adaptive interview pathways, patient-reported evidence, configured safety signals, and a clinician-review-oriented data model. It is not a diagnostic, prescribing, or autonomous clinical-decision system.

## What is included

- React/Vite patient kiosk with English, Hindi, and Marathi interview support
- Browser speech and text-to-speech enhancement with touch fallback
- Deterministic clinical interview and triage engines; no LLM is used for selection or safety decisions
- Evidence, longitudinal comparison, clinical-schema, authentication, and safety-rule packages
- Fastify API, Kysely migrations, SQLite local mode, and PostgreSQL dialect support
- Synthetic seed data, migration tests, security tests, and an end-to-end chest-pain golden case

## Requirements

- Node.js 20.11 or later
- npm 10 or later

No external credentials are needed for the local synthetic demonstration. Production deployments require operator-managed secrets, a Postgres database, TLS, and any credentials required for enabled integrations.

## Quick start

```powershell
npm ci
Copy-Item .env.example .env
npm run db:migrate
npm run db:seed
```

The API loads its environment from its working directory. For local development, start it from the repository root with the values in `.env` exported by your shell, or copy the required values into `services/api/.env` before running it. Never commit either file.

```powershell
# API
npm run dev:api

# Kiosk, in a second terminal
$env:API_PROXY_TARGET='http://127.0.0.1:8080'
npm run dev:kiosk
```

Open `http://127.0.0.1:5173`. The operator must enter a seeded kiosk ID and synthetic device token; these are development-only values emitted by the seed process.

## Verification

```powershell
npm run build
npm run typecheck
npm run lint
npm run format:check
npm test
```

## Configuration

Use `.env.example` as the complete configuration reference. Keep `.env` local and provide your own values for production, especially:

```text
MEDIKIOSK_JWT_SECRET=your_random_secret
MEDIKIOSK_SESSION_ENCRYPTION_KEY=your_random_encryption_key
MEDIKIOSK_HASH_PEPPER=your_random_pepper
DATABASE_URL=postgres://user:password@host:5432/medikiosk
LLM_API_KEY=
ABDM_CLIENT_ID=
ABDM_CLIENT_SECRET=
```

External ABDM integration is blocked without approved credentials. Browser ASR/TTS is browser- and device-dependent, not clinically validated for Indian languages, and always falls back to touch. See [LIMITATIONS](docs/LIMITATIONS.md), [local deployment](docs/deployment/LOCAL.md), and the architecture/ADR documents in `docs/`.

## Safety and data handling

This repository contains only synthetic demo data. Do not use it with real patient data without a security, privacy, legal, clinical-governance, and deployment review. Never place patient records, production databases, keys, certificates, or `.env` files in Git.

## License

UNLICENSED — rights are reserved unless a license is added by the repository owner.
