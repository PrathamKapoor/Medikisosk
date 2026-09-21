# ADR-013 — Console stack: vanilla HTML/CSS/JS; React kiosk retained

## Status

Accepted.

## Context

The product brief requires the user-facing application to be fundamentally vanilla HTML/CSS/JS,
with an exception only where an existing dependency is strictly required for an already-working
subsystem whose removal would break the project. The repository contained two frontend
situations:

1. `apps/kiosk`: a working React/Vite patient kiosk (language → identity → consent → adaptive
   interview → submit), live-verified against the real API, with voice/TTS, i18n and session
   lifecycle deeply integrated.
2. `apps/console`: a `package.json` only — no working subsystem, no screens, no users.

## Decision

- The clinical console (doctor + admin workstations) is built in **vanilla HTML/CSS/JS** with no
  build step: static files served by a small Node static server, hash routing, direct DOM
  rendering, ES modules. The GradientWaves backdrop is reproduced in vanilla JS against the
  same `ogl` shaders (import map over a vendored copy).
- The React patient kiosk is **retained and extended** under the existing-dependency exception:
  removing React would break a working, verified subsystem (consent-gated interview runtime,
  voice, session wipe). New kiosk screens are built inside that subsystem rather than as a
  parallel rewrite.

## Consequences

- Two UI stacks ship: React (kiosk) and vanilla (console). This is deliberate and documented
  here rather than hidden.
- The console has no build, no bundle and no framework upgrade surface; correctness is carried
  by API tests plus the E2E journeys.
- Any future kiosk rewrite must re-prove the interview-runtime contract (golden case +
  security suite) before replacing the React subsystem.
