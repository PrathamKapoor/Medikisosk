# MediKiosk — 5-minute demo script

All data is synthetic. Password for every demo account: `demo-pass-1234`.

## Setup (2 minutes, once)

```powershell
npm ci
Copy-Item .env.example .env
npm run demo:up
npm run dev:api      # terminal 1 — http://127.0.0.1:8080
npm run dev:kiosk     # terminal 2 — http://127.0.0.1:5173
npm run dev:console   # terminal 3 — http://127.0.0.1:5174
```

The seed prints the kiosk ID and device token. Use them at the kiosk "Prepare this kiosk"
screen.

## Minute 1 — Patient intake (kiosk, English)

1. Start → Guest → grant the treatment purpose with the SYMPTOMS category → receipt →
   "Begin clinical interview".
2. Pick **Chest pain** → answer **Yes** to "Are you short of breath?" → the priority banner
   appears (an attention signal, never a diagnosis).
3. Finish the questions (Unknown/Skip are always available) → **Check and submit** path:
   add a medicine (Metformin), record "no known allergies", enter SpO2 93, attach the
   **demo prescription** and confirm its extraction.
4. Review everything → **Confirm and submit** → receive token **A-0xx** with priority.

## Minute 2 — Queue and urgent case (console, dr.rao)

1. Sign in at `http://127.0.0.1:5174` as `dr.rao`.
2. The queue shows EMERGENCY first: **A-005 Aarav Patel** (fever, cough, SpO2 91 —
   HYPOXIA_001 fired through the real rule engine) above the routine cases.
3. Open Aarav → safety signals with rule rationale → documents → evidence trace.

## Minute 3 — Verification and longitudinal story

1. In Aarav's case: add a note, record a diagnosis, set disposition, complete the encounter.
2. Open **Sunita Deshmukh** (search "Sunita"): three visits — diagnosis (HbA1c 8.2) →
   control (5.6, atorvastatin added) → current follow-up (5.9 from a confirmed lab document).
3. Run the compare: labs, medications and symptoms diffed deterministically.
4. Verify her UNVERIFIED HbA1c entity — the fact row flips to VERIFIED with an audit trail.

## Minute 4 — Admin (admin.patil)

Overview metrics (live from the database, demo data labelled), the fleet table (Online /
Offline / Maintenance), the audit log, and system health showing the MOCKED document
processor. Export a FHIR bundle from any case — meta-tagged as a demo representation.

## Minute 5 — Privacy and honesty

1. Kiosk: start a session, then reset — the next patient sees nothing. Add `?idle=15` to the
   kiosk URL to watch the "Are you still there?" reset in seconds.
2. `GET /api/v1/capabilities`: every mock is declared (identity, OCR); ABDM is BLOCKED;
   browser speech is browser-dependent with touch fallback.
