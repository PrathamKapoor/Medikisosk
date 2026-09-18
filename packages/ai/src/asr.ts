/**
 * ASR provider abstraction and a deterministic mock.
 *
 * The kiosk's own WebSpeech adapter lives in `apps/kiosk/src/voice.ts`; this
 * package only defines the contract both sides agree on, so the interview
 * engine stays ASR-independent. Nothing here performs speech recognition.
 */
import { CONFIDENCE_RELIABLE } from "@medikiosk/shared-types";

/** A transcript, or a recognised failure the caller can turn into a notice. */
export interface AsrTranscript {
  isFinal: boolean;
  text: string;
  language: string;
  /** 0..1 where a provider reports it; `null` when a recogniser withholds
   * confidence (common for browser recognisers) — `null` is NEVER treated as
   * authoritative, only as "please confirm". */
  confidence: number | null;
  provider: string;
  model: string;
  durationMs: number;
  error?:
    | "NO_SPEECH"
    | "PERMISSION_DENIED"
    | "NOT_SUPPORTED"
    | "TIMEOUT"
    | "NETWORK"
    | "UNKNOWN";
}

export interface AsrInput {
  audio: { mimeType: string; bytesBase64?: string; blobRef?: string };
  language: string;
  sessionId?: string;
}

export interface AsrProvider {
  readonly id: string;
  supportsLanguage(locale: string): boolean;
  transcribe(input: AsrInput): Promise<AsrTranscript>;
}

/**
 * Whether a transcript needs explicit patient confirmation before it is
 * accepted into the record. `null` confidence (browser recognisers often
 * report none) and any confidence below the reliability threshold both demand
 * confirmation. A low-confidence answer is never silently trusted.
 */
export function needsConfirmation(transcript: AsrTranscript): boolean {
  return (
    transcript.confidence === null ||
    transcript.confidence < CONFIDENCE_RELIABLE
  );
}

export interface MockAsrSample {
  text: string;
  confidence: number | null;
}

/**
 * Deterministic ASR stand-in for offline/demo runs and unit tests.
 *
 * MOCKED: this provider never listens to audio or recognises speech. It maps a
 * language code to a canned transcript and returns it verbatim. It exists so
 * the voice flow is testable end-to-end without a real recogniser; in
 * production it must be replaced by a real browser/cloud provider.
 */
export class MockAsrProvider implements AsrProvider {
  readonly id = "mock-asr";
  readonly model = "deterministic-mock-asr";
  /** Keyed by full locale, falling back to the base language code. */
  private readonly samples: Record<string, MockAsrSample>;

  constructor(samples: Record<string, MockAsrSample>) {
    this.samples = samples;
  }

  supportsLanguage(locale: string): boolean {
    const base = locale.split("-")[0]!;
    return (
      Object.prototype.hasOwnProperty.call(this.samples, locale) ||
      Object.prototype.hasOwnProperty.call(this.samples, base)
    );
  }

  async transcribe(input: AsrInput): Promise<AsrTranscript> {
    const base = input.language.split("-")[0]!;
    const sample = this.samples[input.language] ?? this.samples[base];
    if (!sample) {
      // No canned content for this language — deterministically a no-speech
      // style failure rather than a fabricated transcription.
      return {
        isFinal: false,
        text: "",
        language: input.language,
        confidence: null,
        provider: this.id,
        model: this.model,
        durationMs: 0,
        error: "NO_SPEECH",
      };
    }
    return {
      isFinal: true,
      text: sample.text,
      language: input.language,
      confidence: sample.confidence,
      provider: this.id,
      model: this.model,
      durationMs: 0,
    };
  }
}
