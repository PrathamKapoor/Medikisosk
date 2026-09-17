/**
 * Capability declaration for `GET /api/v1/capabilities`.
 *
 * Generated from the same configuration the providers are constructed from, so the declaration can
 * never drift from reality. This is the mechanism by which the product never presents a mock as a
 * real capability.
 */

import type { AppConfig } from './env';

type CapabilityStatus = { provider: string; isMock: boolean; status: string };

const mock = (provider: string): CapabilityStatus => ({ provider, isMock: true, status: 'MOCKED' });
const real = (provider: string): CapabilityStatus => ({
  provider,
  isMock: false,
  status: 'IMPLEMENTED',
});
const planned = (provider: string): CapabilityStatus => ({
  provider,
  isMock: false,
  status: 'PLANNED',
});

export function capabilitiesFor(config: AppConfig): {
  readonly deploymentMode: string;
  readonly providers: Record<string, CapabilityStatus>;
  readonly features: Record<string, boolean>;
  readonly supportedLocales: readonly string[];
  readonly limitations: readonly string[];
} {
  return {
    deploymentMode: config.MEDIKIOSK_DEPLOYMENT_MODE,
    providers: {
      identity: config.IDENTITY_PROVIDER === 'mock' ? mock('mock') : real('abha'),
      llm:
        config.LLM_PROVIDER === 'mock'
          ? mock('mock')
          : config.LLM_PROVIDER === 'disabled'
            ? planned('disabled')
            : real(config.LLM_PROVIDER),
      asr:
        config.ASR_PROVIDER === 'mock'
          ? mock('mock')
          : config.ASR_PROVIDER === 'disabled'
            ? planned('disabled')
            : real(config.ASR_PROVIDER),
      tts:
        config.TTS_PROVIDER === 'mock'
          ? mock('mock')
          : config.TTS_PROVIDER === 'disabled'
            ? planned('disabled')
            : real(config.TTS_PROVIDER),
      ocr:
        config.OCR_PROVIDER === 'mock'
          ? mock('mock')
          : config.OCR_PROVIDER === 'disabled'
            ? planned('disabled')
            : real(config.OCR_PROVIDER),
      ner: config.NER_PROVIDER === 'deterministic' ? real('deterministic') : planned(config.NER_PROVIDER),
      abdm: mock('mock'),
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
    supportedLocales: ['en-IN', 'hi-IN', 'mr-IN', 'gu-IN', 'ta-IN', 'te-IN', 'bn-IN', 'kn-IN'],
    limitations: [
      'Handwritten document OCR is not supported.',
      'The red-flag rule set is a curated starter set and has not been prospectively clinically validated.',
      'Non-English translations are machine-drafted and require native clinical review.',
    ],
  };
}