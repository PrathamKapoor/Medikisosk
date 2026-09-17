# ADR-002 — Data layer: one typed query builder, two dialects (SQLite dev / Postgres prod)

**Status:** Accepted
**Date:** 2026-09-15

## Context

Two hard constraints collide:

1. The Final Acceptance Test requires that a fresh clone can be installed, migrated, seeded,
   started and demonstrated **on this machine**.
2. The production deployment must target a real, concurrent, backed-up relational database
   suitable for hospital use.

Measured environment facts: **Docker is not installed** and **no PostgreSQL server is present**.
Therefore constraint (1) cannot be satisfied by Postgres or by containers.

A second, clinical constraint applies: the internal clinical representation is deliberately
**not** a FHIR mirror, and queries are dominated by *relational* patterns — encounters joining
symptoms, evidence joining claims, timelines spanning many tables, tenant-scoped traversal,
"what changed" comparisons. This is not a document database workload.

## Decision

Use **Kysely** as the single typed SQL query builder, configured with one of two dialects at
runtime:

| Environment | Dialect | Driver | Rationale |
|---|---|---|---|
| local / dev / demo / test | SQLite | `better-sqlite3` (prebuilt binary verified working on Node 24 / win32-x64) | Zero infrastructure; a file on disk; the demo runs anywhere |
| staging / production | PostgreSQL | `pg` (pure JavaScript) | Real concurrency, transactional integrity, proven hospital-grade operations, backup/restore tooling |

Rules:
- **All application queries go through Kysely.** No raw SQL strings in feature code.
- **Migrations are written dialect-neutrally** via a small set of column-type helpers
  (`id`, `text`, `integer`, `real`, `boolean`, `timestamp`, `json`) so a single migration set
  produces correct DDL on both engines. No SQLite-only or Postgres-only syntax in migrations.
- Identifiers are **application-generated ULIDs/UUIDs (TEXT)**, never engine-specific
  auto-increment types, precisely because those differ between dialects.
- Timestamps are stored as **ISO-8601 UTC text**, so ordering and comparison behave identically
  in both engines and no timezone conversion happens inside the database.
- Booleans are stored as `INTEGER 0/1` because SQLite has no native boolean; the repository
  layer maps them to TypeScript `boolean` at the boundary so application code never sees the
  difference.
- JSON columns are a **text column plus `JSON.parse` at the repository boundary**, with a Zod
  schema validating on read.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Prisma | A single `schema.prisma` is bound to exactly one provider; supporting both SQLite and Postgres requires either duplicate schemas (drift) or the `provider` being changed on every environment switch. Its migration engine also rewrites history when providers change. Wrong tool for genuine dual-dialect support |
| Drizzle | Viable, but its strongest mode is code-first DDL generation per dialect; dual-dialect support still needs dialect-aware schema files. Kysely's explicit, hand-controlled migrations give us the neutrality we need with less magic |
| TypeORM | Heavier, decorator/metadata driven, weaker type inference than Kysely, historically poor SQLite/Postgres parity |
| Raw `pg` + hand-written SQL | Maximum control, zero type safety on rows, and would make the SQLite dev path a second codebase. Unacceptable maintenance burden |
| MongoDB | The clinical model is relational and evidence-graph oriented; losing foreign keys and transactional guarantees on medical data is not acceptable |
| Require Postgres everywhere (drop local runnability) | Fails the Final Acceptance Test in the target environment; makes the demo un-runnable by a judge or a fresh engineer |
| Require Docker | Docker is not installed, and demanding it as a prerequisite for a demo is a real adoption barrier |

`better-sqlite3` was chosen over the built-in `node:sqlite` (which is also present and works)
because Kysely ships an **official** SQLite dialect for it, removing the need to hand-write and
maintain a dialect adapter. The built-in remains a documented fallback.

## Consequences

**Positive**
- The entire stack starts with `npm run db:migrate && npm run db:seed && npm run dev:api`
  with no Docker and no database server (verified empirically by probe A).
- The same typed queries, the same repository layer, and the same tests run against both engines.
- Deterministic tests are fast because SQLite can be an in-memory or temp-file database.
- There is a real, honest production path to Postgres by changing one environment variable.

**Negative / accepted**
- **TD-01:** SQLite is not Postgres. Differences that could bite are concurrency (SQLite is
  single-writer), type affinity, and a subset of DDL. Mitigations: writes are short and
  transactional, foreign keys are explicitly enabled (`PRAGMA foreign_keys = ON`), and the CI
  pipeline is designed to run the suite against Postgres so dialect drift is caught there rather
  than in production.
- Some Postgres features (partial indexes, `JSONB` operators, `LISTEN/NOTIFY`) are unavailable in
  the SQLite path, so the application must not depend on them. Background work therefore uses a
  database-backed job table rather than Postgres `LISTEN/NOTIFY`.