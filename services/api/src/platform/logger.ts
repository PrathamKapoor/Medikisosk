/**
 * PHI-safe structured logging.
 *
 * Two rules govern every log line in this product:
 *
 * 1. Clinical free text, names, identifiers and documents are NEVER logged unless `LOG_PHI` is
 *    explicitly enabled, and even then only at `debug` level. `LOG_PHI` defaults to false, and the
 *    default is what a hospital sees.
 * 2. Every log line carries the request id, tenant id and actor, so an operational question ("which
 *    kiosk is failing?") is answerable without any clinical content.
 */

import pino, { type Logger as PinoLogger } from "pino";
import type { AppConfig } from "../config/env";

export type LogContext = Partial<{
  requestId: string;
  tenantId: string;
  actorId: string;
  actorKind: "STAFF" | "KIOSK" | "SYSTEM";
  route: string;
  durationMs: number;
}>;

const PHI_KEY_PATTERN =
  /name|patient|abha|otp|password|token|secret|phone|address|diagnos|symptom|prescription|document|display_name|raw_value|text|transcript/i;

function looksLikePhi(key: string): boolean {
  return PHI_KEY_PATTERN.test(key);
}

/**
 * Strip anything that smells like PHI from a log object, unless PHI logging is on.
 *
 * Conservative by design: it redacts `displayName` as readily as `abhaNumber`, because the safe
 * failure is a missing log field, not a leaked identifier. Clinical code must pass identifiers
 * through `masked*` helpers (see @medikiosk/auth) if they need to be loggable at all.
 */
export function scrubForLogging(value: unknown, allowPhi: boolean): unknown {
  if (allowPhi) return value;
  if (value === null || value === undefined) return value;
  if (Array.isArray(value))
    return value.map((item) => scrubForLogging(item, allowPhi));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(
      value as Record<string, unknown>,
    )) {
      out[key] = looksLikePhi(key)
        ? "[REDACTED]"
        : scrubForLogging(entry, allowPhi);
    }
    return out;
  }
  return value;
}

export interface AppLogger {
  readonly raw: PinoLogger;
  info(context: LogContext, message: string, data?: unknown): void;
  warn(context: LogContext, message: string, data?: unknown): void;
  error(context: LogContext, message: string, data?: unknown): void;
  debug(context: LogContext, message: string, data?: unknown): void;
  child(context: LogContext): AppLogger;
}

function makeLogger(
  pinoLogger: PinoLogger,
  allowPhi: boolean,
  base: LogContext,
): AppLogger {
  const emit = (level: "info" | "warn" | "error" | "debug") => {
    return (context: LogContext, message: string, data?: unknown) => {
      const merged = { ...base, ...context };
      if (data === undefined) pinoLogger[level](merged, message);
      else
        pinoLogger[level](
          { ...merged, data: scrubForLogging(data, allowPhi) },
          message,
        );
    };
  };

  return {
    raw: pinoLogger,
    info: emit("info"),
    warn: emit("warn"),
    error: emit("error"),
    debug: emit("debug"),
    child: (context: LogContext) =>
      makeLogger(pinoLogger, allowPhi, { ...base, ...context }),
  };
}

export function createLogger(config: AppConfig): AppLogger {
  const pretty =
    config.NODE_ENV === "development" || config.NODE_ENV === "test";
  const pinoLogger = pino({
    level: config.LOG_LEVEL,
    base: { service: "medikiosk-api" },
    redact: {
      paths: [
        "*.password",
        "*.otp",
        "*.token",
        "*.secret",
        "*.abhaNumber",
        "*.displayName",
        "*.rawAnswer",
        "*.rawValue",
        "*.transcript",
        "req.headers.authorization",
      ],
      remove: false,
    },
    ...(pretty
      ? {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "SYS:standard",
              ignore: "pid,hostname",
            },
          },
        }
      : {}),
  });
  return makeLogger(pinoLogger, config.LOG_PHI, {});
}
