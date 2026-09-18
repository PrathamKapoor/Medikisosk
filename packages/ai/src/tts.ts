/**
 * TTS provider abstraction and controller.
 *
 * Interfaces only: speech synthesis itself is browser-native
 * (`speechSynthesis`) in the kiosk; this contract lets a richer cloud/edge TTS
 * provider be swapped in without touching the interview UI.
 */

export interface TtsRequest {
  text: string;
  language: string;
  rate?: number;
}

export interface TtsResult {
  provider: string;
  ok: boolean;
  durationMs: number;
  error?: string;
}

export interface TtsProvider {
  readonly id: string;
  speak(request: TtsRequest): Promise<TtsResult>;
}

/** Stops any in-flight utterance (used when the patient interacts mid-read). */
export interface TtsController {
  stop(): void;
}
