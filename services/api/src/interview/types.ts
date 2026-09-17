/**
 * Interview runtime — shared route/service types.
 *
 * These are the request/response shapes the encounter + interview endpoints expose. The domain
 * types the engine reasons over (`InterviewInput`, `ResponseRecord`, `QuestionView`, ...) come from
 * `@medikiosk/interview-engine`; this module only spells out the API boundary (contract §6–§7).
 */

import type { AppDatabase } from "../db/kysely";
import type { AppConfig } from "../config/env";
import type { AppLogger } from "../platform/logger";

/** The interview service dependencies, mirroring the kiosk/identity module pattern. */
export interface InterviewServiceDeps {
  readonly db: AppDatabase;
  readonly config: AppConfig;
  readonly logger: AppLogger;
  /** Injected clock so tests can freeze time. */
  readonly now: () => Date;
}

/** Body of `POST /api/v1/encounters`. */
export interface CreateEncounterBody {
  readonly patientId: string;
  readonly sessionId: string;
  readonly encounterType: "OPD";
  readonly chiefComplaintCodes: readonly string[];
  readonly chiefComplaintVerbatim?: string;
  readonly locale: string;
  readonly ayushMode?: boolean;
  readonly questionnaireVersion?: string;
}

/** Body of `POST .../interview/response`. */
export interface ResponseBody {
  readonly questionKey: string;
  readonly state?:
    "ANSWERED" | "SKIPPED" | "DECLINED" | "UNKNOWN" | "NOT_APPLICABLE";
  readonly rawAnswer?: string;
  readonly modality: "VOICE" | "TOUCH" | "STAFF_ASSISTED" | "IMPORTED";
  readonly asrConfidence?: number;
  readonly asrLanguage?: string;
  readonly normalisedAnswer?: unknown;
}
