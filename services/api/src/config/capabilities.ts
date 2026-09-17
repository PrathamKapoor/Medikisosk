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
      asr: planned(config.ASR_PROVIDER),
      tts: planned(config.TTS_PROVIDER),
      ocr: planned(config.OCR_PROVIDER),
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
      voice_enabled: false,
      tts_enabled: false,
      document_ai_enabled: false,
      ayush_enabled: false,
      abdm_enabled: false,
      offline_enabled: false,
      local_llm_enabled: false,
      research_mode_enabled: false,
    },
    supportedLocales: ["en-IN", "hi-IN", "mr-IN"],
    limitations: [
      "Identity verification is synthetic demonstration only, not ABHA or real patient matching.",
      "Clinical interview, voice, document extraction, summaries and external ABDM workflows are not implemented.",
      "Deterministic concept matching and safety rules exist as domain libraries, not clinical workflow endpoints.",
      "The red-flag rule set is a curated starter set and has not been prospectively clinically validated.",
      "Non-English translations are machine-drafted and require native clinical review.",
      "DPDPA compliance is NOT ESTABLISHED; no legal review has occurred.",
    ],
  };
}
