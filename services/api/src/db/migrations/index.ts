/**
 * Migration catalogue.
 *
 * Order is load-bearing: each migration builds on tables the previous one created. Adding a migration
 * appends to this list; renumbering after data exists would replay history out of order, so ids are
 * stable once published.
 */

import type { Migration } from "../migrate";
import { MIGRATION_0001_IDENTITY } from "./0001-identity";
import { MIGRATION_0002_IDENTITY_ACCESS } from "./0002-identity-access";
import { MIGRATION_0003_CLINICAL } from "./0003-clinical";
import { MIGRATION_0004_CLINICAL_FACTS } from "./0004-clinical-facts";
import { MIGRATION_0005_ALLERGY_LABS } from "./0005-allergy-labs";
import { MIGRATION_0006_HISTORY } from "./0006-history";
import { MIGRATION_0007_DOCUMENTS } from "./0007-documents";
import { MIGRATION_0008_EVIDENCE } from "./0008-evidence";
import { MIGRATION_0009_TRIAGE } from "./0009-triage";
import { MIGRATION_0010_SUMMARY } from "./0010-summary";
import { MIGRATION_0011_INTEROP } from "./0011-interop";
import { MIGRATION_0012_AUDIT } from "./0012-audit";
import { MIGRATION_0013_ADMIN } from "./0013-admin";
import { MIGRATION_0014_SESSION_LIFECYCLE } from "./0014-session-lifecycle";
import { MIGRATION_0015_INTERVIEW_RUNTIME } from "./0015-interview-runtime";

export const MIGRATIONS: readonly Migration[] = [
  MIGRATION_0001_IDENTITY,
  MIGRATION_0002_IDENTITY_ACCESS,
  MIGRATION_0003_CLINICAL,
  MIGRATION_0004_CLINICAL_FACTS,
  MIGRATION_0005_ALLERGY_LABS,
  MIGRATION_0006_HISTORY,
  MIGRATION_0007_DOCUMENTS,
  MIGRATION_0008_EVIDENCE,
  MIGRATION_0009_TRIAGE,
  MIGRATION_0010_SUMMARY,
  MIGRATION_0011_INTEROP,
  MIGRATION_0012_AUDIT,
  MIGRATION_0013_ADMIN,
  MIGRATION_0014_SESSION_LIFECYCLE,
  MIGRATION_0015_INTERVIEW_RUNTIME,
];
