import type { AppConfig } from "./env";

type CapabilityStatus = { provider: string; isMock: boolean; status: string };
const planned = (provider: string): CapabilityStatus => ({
  provider,
  isMock: false,
  status: "PLANNED",
});

/** Declares executable functionality, never merely configured provider names. */
export function capabilitiesFor(config: AppConfig) {
  return {
    deploymentMode: config.MEDIKIOSK_DEPLOYMENT_MODE,
    providers: {
      identity:
        config.IDENTITY_PROVIDER === "mock"
          ? { provider: "mock", isMock: true, status: "MOCKED" }
          : { provider: "abha", isMock: false, status: "BLOCKED" },
      llm: planned(config.LLM_PROVIDER),
      asr:
        config.ASR_PROVIDER === "browser"
          ? { provider: "browser", isMock: false, status: "IMPLEMENTED" }
          : planned(config.ASR_PROVIDER),
      tts:
        config.TTS_PROVIDER === "browser"
          ? { provider: "browser", isMock: false, status: "IMPLEMENTED" }
          : planned(config.TTS_PROVIDER),
      ocr:
        config.OCR_PROVIDER === "mock"
          ? {
              provider: "mock",
              isMock: true,
              status: "MOCKED",
            }
          : planned(config.OCR_PROVIDER),
      ner:
        config.NER_PROVIDER === "deterministic"
          ? {
              provider: "deterministic",
              isMock: false,
              status: "PARTIALLY IMPLEMENTED",
            }
          : planned(config.NER_PROVIDER),
      abdm: { provider: "abdm", isMock: false, status: "BLOCKED" },
    },
    features: {
      voice_enabled: config.FEATURE_VOICE_ENABLED,
      tts_enabled: config.FEATURE_TTS_ENABLED,
      document_ai_enabled: config.FEATURE_DOCUMENT_AI_ENABLED,
      ayush_enabled: config.FEATURE_AYUSH_ENABLED,
      abdm_enabled: config.FEATURE_ABDM_ENABLED,
      offline_enabled: config.FEATURE_OFFLINE_ENABLED,
      local_llm_enabled: config.FEATURE_LOCAL_LLM_ENABLED,
      research_mode_enabled: config.FEATURE_RESEARCH_MODE_ENABLED,
    },
    supportedLocales: ["en-IN", "hi-IN", "mr-IN"],
    limitations: [
      "Identity verification is synthetic demonstration only, not ABHA or real patient matching.",
      "Browser speech recognition (ASR) and TTS are implemented client-side; they depend on the browser, OS speech packs and the microphone, are NOT validated for Indian languages, and always fall back to touch.",
      "Document extraction is a deterministic mock: only registered synthetic files are recognised, everything else extracts to an explicit empty result. Clinical summaries are deterministic drafts, never LLM output. External ABDM workflows are not implemented.",
      "Deterministic concept matching and safety rules are domain libraries wired into the clinical workflow endpoints.",
      "The red-flag rule set is a curated starter set and has not been prospectively clinically validated.",
      "Non-English translations are machine-drafted and require native clinical review.",
      "DPDPA compliance is NOT ESTABLISHED; no legal review has occurred.",
    ],
  };
}
