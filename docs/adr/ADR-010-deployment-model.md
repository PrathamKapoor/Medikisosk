# ADR-010 — Deployment model: environment-configurable runtime, containers authored but not required

**Status:** Accepted
**Date:** 2026-09-15

## Context

Measured environment facts: **Docker is not installed** and `docker-compose` is unavailable. Yet
the product must be deployable by a hospital, and must be demonstrable by a judge or a fresh
engineer **on the machine at hand**.

The commercial model (see the Startup section of the final report) also requires that MediKiosk can
be sold as cloud SaaS, hospital private cloud, on-premise, offline-first kiosk, or hybrid. The
architecture must permit all of these even if not all are implemented on day one.

## Decision

**The runtime is configured entirely by environment variables and requires no container to start.**
A production container image is authored as the deployment artefact of record, and its execution is
reported as `BLOCKED — environment` locally rather than being claimed as tested.

Three supported deployment modes:

| Mode | Database | AI providers | Containers |
|---|---|---|---|
| **LOCAL DEVELOPMENT** | SQLite file | browser/mock/deterministic | none |
| **STAGING** | PostgreSQL | real providers where configured | containerised or native |
| **PRODUCTION** | PostgreSQL (managed or self-hosted), TLS, backups | real providers, on-premise inference permitted | containerised |

Concretely:
- `MEDIKIOSK_DB_DIALECT` selects the Kysely dialect at runtime (ADR-002).
- Every provider is selected by environment variable (ADR-003), so an on-premise hospital can run
  with all local providers and no outbound network access.
- `MEDIKIOSK_DEPLOYMENT_MODE` (`local | staging | production`) gates behaviour that must differ:
  demo identity provider enablement, verbose errors, seed endpoints, TLS enforcement, and
  whether insecure default secrets are tolerated.
- **Startup validates configuration with Zod and refuses to start on a fatal misconfiguration** —
  for example, `NODE_ENV=production` with a development default secret, or
  `IDENTITY_PROVIDER=abha` without credentials. Failing loudly at boot is far better than silently
  running a hospital on placeholder secrets.
- `.env.example` is committed; `.env` never is. `docs/deployment/` documents local, staging and
  production, including TLS, backup and restore.
- Container artefacts (`infra/docker/Dockerfile.api`, `infra/docker/Dockerfile.web`,
  `infra/docker/docker-compose.yml`) are authored so that adding Docker is the only remaining step;
  they are **not** reported as executed here.
- `scripts/demo-up.mjs` is the single-command demo entry point. It deliberately does **not** require
  Docker, so that "can I see this work?" has a one-line answer.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Kubernetes from day one | Operationally absurd for a first pilot; a modular monolith plus one database does not need an orchestrator. Would also make the product un-demoable locally |
| Docker Compose as the *only* supported run mode | Docker is absent here, so the Final Acceptance Test would fail; also raises the barrier for a hospital IT team |
| Serverless functions per endpoint | Cold starts are unacceptable for a kiosk waiting to be used; connection pooling to Postgres becomes awkward; and it would fragment the modular monolith prematurely |
| A cloud-managed database only | Hospitals frequently mandate on-premise data residency; ABDM data handling makes this a real constraint |
| Requiring TLS certificates to run locally | Blocks development; TLS is enforced by `MEDIKIOSK_DEPLOYMENT_MODE=production` and documented for staging/production instead |

## Consequences

**Positive**
- A fresh clone runs with `npm install` and two commands, verified in this environment.
- Production deployment is a configuration change plus a container build, with no code change.
- The same artefact supports cloud SaaS and on-premise, which is required for commercial viability.
- Configuration errors fail fast at boot rather than becoming silent production incidents.

**Negative / accepted**
- Two database dialects must be kept honest (ADR-002 / TD-01). The CI pipeline is designed to run
  the suite against Postgres so drift is caught in CI, not in production.
- Container artefacts ship without having been executed locally (**TD-07**), which is an explicit
  and disclosed gap, not a silent one.
- Environment sprawl is a genuine risk as the product grows. Mitigated by validating the entire
  environment in one Zod schema at startup, so a new variable cannot be half-added.