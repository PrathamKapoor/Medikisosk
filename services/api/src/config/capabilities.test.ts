import { describe, expect, it } from "vitest";
import { capabilitiesFor } from "./capabilities";
import { loadConfig } from "./env";

function configWith(overrides: NodeJS.ProcessEnv = {}) {
  return loadConfig({
    MEDIKIOSK_JWT_SECRET: "test-jwt-secret",
    MEDIKIOSK_SESSION_ENCRYPTION_KEY: "test-session-key",
    MEDIKIOSK_HASH_PEPPER: "test-hash-pepper",
    ...overrides,
  }).config;
}

describe("capabilitiesFor", () => {
  it("reports configured feature flags instead of claiming disabled capabilities are enabled", () => {
    const capabilities = capabilitiesFor(
      configWith({
        FEATURE_VOICE_ENABLED: "false",
        FEATURE_TTS_ENABLED: "false",
        FEATURE_DOCUMENT_AI_ENABLED: "false",
        FEATURE_AYUSH_ENABLED: "false",
        FEATURE_OFFLINE_ENABLED: "false",
        FEATURE_RESEARCH_MODE_ENABLED: "false",
      }),
    );

    expect(capabilities.features).toMatchObject({
      voice_enabled: false,
      tts_enabled: false,
      document_ai_enabled: false,
      ayush_enabled: false,
      offline_enabled: false,
      research_mode_enabled: false,
    });
  });
  it("reports the mock OCR pipeline as MOCKED, never as a real integration", () => {
    const capabilities = capabilitiesFor(configWith({ OCR_PROVIDER: "mock" }));
    expect(capabilities.providers.ocr).toMatchObject({
      provider: "mock",
      isMock: true,
      status: "MOCKED",
    });
    expect(
      capabilities.limitations.some((line: string) =>
        line.includes("deterministic mock"),
      ),
    ).toBe(true);
  });
});
