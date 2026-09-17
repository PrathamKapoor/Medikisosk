# ADR-001 — Repository and build architecture: TypeScript monorepo on npm workspaces

**Status:** Accepted
**Date:** 2026-09-15
**Deciders:** Principal Engineer

## Context

MediKiosk needs: 4 user interfaces (patient kiosk, doctor console, triage console, admin
console), a backend API, a set of shared clinical domain types, a shared safety rule engine, a
shared FHIR mapper, and shared localisation. These artefacts must share types — a clinical
schema that drifts between the API and the UI is a direct clinical-safety risk.

Environment measurement: Node 24.19.0 and npm 12.0.2 are available. pnpm and yarn are not.

## Decision

Use a **single TypeScript monorepo** managed by **npm workspaces**.

- `packages/*` — libraries with no runtime of their own (pure, testable, dependency-light)
- `services/*` — deployable backend runtime (currently one: `services/api`)
- `apps/*` — browser applications (kiosk, console)
- `data/`, `evaluation/`, `tests/`, `docs/`, `infra/`, `scripts/`

Shared code is imported by package name (`@medikiosk/clinical-schema`), never by relative path
crossing workspace boundaries. This is what makes the boundaries real rather than decorative.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Four independent repositories | Clinical types would be duplicated or published on every change; safety-critical drift risk; devastating for a small team |
| Separate frontend repos consumed via published npm packages | Requires a private registry and a release cycle for every clinical-schema change; unacceptable for a system whose schema is still evolving |
| pnpm workspaces | pnpm is not installed; npm workspaces are sufficient and already present, so this removes a dependency for no benefit |
| Nx / Turborepo | Adds a build orchestrator dependency; npm workspaces plus `tsc -b` project references cover the need; avoid tooling theatre |

## Consequences

**Positive**
- One `npm install`, one type system, one test runner, one schema version across UI and API.
- A change to the clinical schema breaks the build everywhere it matters (`tsc -b`), which is
  exactly the safety property we want.
- CI is a single pipeline.

**Negative / accepted**
- `npm install` installs the union of all workspace dependencies. Mitigated by keeping test-only
  and framework-only dependencies in the workspace that needs them.
- `tsc -b` project references must be kept correct when new packages are added; enforced by
  `tsconfig.build.json`.