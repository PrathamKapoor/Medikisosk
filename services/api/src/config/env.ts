/**
 * Environment configuration, validated once at start-up.
 *
 * The runtime is configured entirely by environment variables, and a fatal misconfiguration refuses
 * to boot. Failing loudly here prevents a hospital from running silently on placeholder secrets or
 * on a mock identity provider it believed was ABHA. See ADR-010.
 */

import { z } from "zod";

const booleanString = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.enum(["true", "false", "1", "0", "yes", "no"]))
  .transform((value) => value === "true" || value === "1" || value === "yes");

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  MEDIKIOSK_DEPLOYMENT_MODE: z
    .enum(["local", "staging", "production"])
    .default("local"),

  API_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PUBLIC_URL: z.string().url().default("http://localhost:8080"),
  KIOSK_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  CONSOLE_ORIGIN: z.string().min(1).default("http://localhost:5174"),

  MEDIKIOSK_DB_DIALECT: z.enum(["sqlite", "postgres"]).default("sqlite"),
  MEDIKIOSK_SQLITE_PATH: z
    .string()
    .min(1)
    .default("./.medikiosk-data/medikiosk.sqlite"),
  MEDIKIOSK_UPLOAD_DIR: z.string().min(1).default("./.medikiosk-data/uploads"),
  DOCUMENT_MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(50).default(10),
  DATABASE_URL: z.string().min(1).optional(),

  MEDIKIOSK_JWT_SECRET: z.string().min(1),
  MEDIKIOSK_SESSION_ENCRYPTION_KEY: z.string().min(1),
  MEDIKIOSK_HASH_PEPPER: z.string().min(1),

  MEDIKIOSK_SESSION_TTL_MINUTES: z.coerce
    .number()
    .int()
    .min(5)
    .max(480)
    .default(45),
  MEDIKIOSK_TEMP_RETENTION_MINUTES: z.coerce
    .number()
    .int()
    .min(10)
    .max(10080)
    .default(120),

  IDENTITY_PROVIDER: z.enum(["mock", "abha"]).default("mock"),
  ABDM_CLIENT_ID: z.string().optional().default(""),
  ABDM_CLIENT_SECRET: z.string().optional().default(""),
  ABDM_BASE_URL: z.string().url().default("https://sandbox.abdm.gov.in"),
  ABDM_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),

  LLM_PROVIDER: z
    .enum(["mock", "openai", "ollama", "disabled"])
    .default("mock"),
  LLM_MODEL: z.string().min(1).default("medikiosk-deterministic-v1"),
  LLM_BASE_URL: z.string().optional().default(""),
  LLM_API_KEY: z.string().optional().default(""),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(20000),

  ASR_PROVIDER: z
    .enum(["browser", "bhashini", "mock", "disabled"])
    .default("browser"),
  ASR_MODEL: z.string().min(1).default("browser-webspeech-v1"),
  OCR_PROVIDER: z.enum(["mock", "tesseract-local", "disabled"]).default("mock"),
  OCR_MODEL: z.string().min(1).default("medikiosk-synthetic-ocr-v1"),
  TTS_PROVIDER: z.enum(["browser", "mock", "disabled"]).default("browser"),
  NER_PROVIDER: z
    .enum(["deterministic", "llm", "disabled"])
    .default("deterministic"),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  LOG_PHI: z
    .string()
    .optional()
    .transform((value) => (value ?? "false").trim().toLowerCase() === "true"),
  METRICS_ENABLED: z
    .string()
    .optional()
    .transform((value) => (value ?? "true").trim().toLowerCase() !== "false"),
});

export type RawConfig = z.input<typeof envSchema>;
export type AppConfig = Omit<
  z.output<typeof envSchema>,
  "LOG_PHI" | "METRICS_ENABLED"
> & {
  readonly LOG_PHI: boolean;
  readonly METRICS_ENABLED: boolean;
  readonly FEATURE_VOICE_ENABLED: boolean;
  readonly FEATURE_TTS_ENABLED: boolean;
  readonly FEATURE_DOCUMENT_AI_ENABLED: boolean;
  readonly FEATURE_AYUSH_ENABLED: boolean;
  readonly FEATURE_ABDM_ENABLED: boolean;
  readonly FEATURE_OFFLINE_ENABLED: boolean;
  readonly FEATURE_LOCAL_LLM_ENABLED: boolean;
  readonly FEATURE_RESEARCH_MODE_ENABLED: boolean;
  /** True when any development-default secret is in use. Never true in production. */
  readonly usingDevelopmentSecrets: boolean;
};

const FEATURE_DEFAULTS: Record<string, boolean> = {
  FEATURE_VOICE_ENABLED: true,
  FEATURE_TTS_ENABLED: true,
  FEATURE_DOCUMENT_AI_ENABLED: true,
  FEATURE_AYUSH_ENABLED: true,
  FEATURE_ABDM_ENABLED: false,
  FEATURE_OFFLINE_ENABLED: true,
  FEATURE_LOCAL_LLM_ENABLED: false,
  FEATURE_RESEARCH_MODE_ENABLED: true,
};

function readFeatureFlag(env: NodeJS.ProcessEnv, name: string): boolean {
  const raw = env[name];
  if (raw === undefined) return FEATURE_DEFAULTS[name] ?? false;
  const normalised = raw.trim().toLowerCase();
  return normalised === "true" || normalised === "1" || normalised === "yes";
}

const DEVELOPMENT_DEFAULTS = new Set([
  "dev-only-insecure-jwt-secret-replace-me",
  "dev-only-insecure-session-key-replace-me",
  "dev-only-insecure-pepper-replace-me",
]);

/**
 * Load and validate the environment.
 *
 * Throws on a fatal misconfiguration: starting in an unsafe state is worse than not starting.
 * Returns non-fatal warnings separately, so the boot log states exactly which integrations are
 * mocked. Operators act on these; patients never see them.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): {
  readonly config: AppConfig;
  readonly warnings: readonly string[];
} {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  const raw = parsed.data;
  const isProduction =
    raw.NODE_ENV === "production" ||
    raw.MEDIKIOSK_DEPLOYMENT_MODE === "production";

  const usingDevelopmentSecrets =
    DEVELOPMENT_DEFAULTS.has(raw.MEDIKIOSK_JWT_SECRET) ||
    DEVELOPMENT_DEFAULTS.has(raw.MEDIKIOSK_SESSION_ENCRYPTION_KEY) ||
    DEVELOPMENT_DEFAULTS.has(raw.MEDIKIOSK_HASH_PEPPER);

  // The one refusal that matters most: production must never run on placeholder secrets.
  if (isProduction && usingDevelopmentSecrets) {
    throw new Error(
      "Refusing to start: deployment is production but secrets still use development defaults.",
    );
  }

  if (raw.MEDIKIOSK_DB_DIALECT === "postgres" && !raw.DATABASE_URL) {
    throw new Error(
      "Refusing to start: postgres dialect selected but DATABASE_URL is not set.",
    );
  }

  if (
    raw.IDENTITY_PROVIDER === "abha" &&
    (!raw.ABDM_CLIENT_ID || !raw.ABDM_CLIENT_SECRET)
  ) {
    throw new Error(
      "Refusing to start: IDENTITY_PROVIDER is abha but ABDM credentials are not set. " +
        "Obtain approved sandbox credentials; until then use IDENTITY_PROVIDER=mock.",
    );
  }

  const warnings: string[] = [];
  if (raw.IDENTITY_PROVIDER === "mock") {
    warnings.push(
      "Identity uses the deterministic mock provider. This is NOT ABHA.",
    );
  }
  if (raw.LLM_PROVIDER === "mock") {
    warnings.push(
      "LLM provider is configured as mock, but no summary generation pipeline is implemented.",
    );
  }
  if (raw.OCR_PROVIDER === "mock") {
    warnings.push(
      "OCR provider is configured as mock, but no document extraction pipeline is implemented.",
    );
  }
  if (raw.ASR_PROVIDER === "browser" || raw.TTS_PROVIDER === "browser") {
    warnings.push(
      "Browser ASR/TTS are client-side, browser-dependent enhancements with touch fallback; Indian-language fidelity is not clinically validated.",
    );
  }
  warnings.push("External ABDM integration is not implemented.");

  const config: AppConfig = {
    ...raw,
    FEATURE_VOICE_ENABLED: readFeatureFlag(env, "FEATURE_VOICE_ENABLED"),
    FEATURE_TTS_ENABLED: readFeatureFlag(env, "FEATURE_TTS_ENABLED"),
    FEATURE_DOCUMENT_AI_ENABLED: readFeatureFlag(
      env,
      "FEATURE_DOCUMENT_AI_ENABLED",
    ),
    FEATURE_AYUSH_ENABLED: readFeatureFlag(env, "FEATURE_AYUSH_ENABLED"),
    FEATURE_ABDM_ENABLED: readFeatureFlag(env, "FEATURE_ABDM_ENABLED"),
    FEATURE_OFFLINE_ENABLED: readFeatureFlag(env, "FEATURE_OFFLINE_ENABLED"),
    FEATURE_LOCAL_LLM_ENABLED: readFeatureFlag(
      env,
      "FEATURE_LOCAL_LLM_ENABLED",
    ),
    FEATURE_RESEARCH_MODE_ENABLED: readFeatureFlag(
      env,
      "FEATURE_RESEARCH_MODE_ENABLED",
    ),
    usingDevelopmentSecrets,
  };
  return { config, warnings };
}
