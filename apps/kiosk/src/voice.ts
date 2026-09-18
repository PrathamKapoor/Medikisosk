/**
 * Browser voice + TTS adapter for the kiosk.
 *
 * This is the browser side of `@medikiosk/ai`'s ASR contract: it wraps the
 * Web Speech API (`SpeechRecognition`, `speechSynthesis`) so the interview can
 * offer a mic, while the interview engine itself stays ASR-independent. The
 * engine only ever sees raw answer text + an optional confidence.
 *
 * Browser recognisers do NOT expose per-utterance confidence: transcripts come
 * back with `confidence: null`, so every voice answer is routed through the
 * patient-confirmation step before submission (never silently trusted).
 */
import { needsConfirmation } from "@medikiosk/ai";

export { needsConfirmation };

/** Canonical mic error codes surfaced to the UI (maps onto voice.* i18n keys). */
export type MicErrorCode =
  | "NO_SPEECH"
  | "PERMISSION_DENIED"
  | "NOT_SUPPORTED"
  | "TIMEOUT"
  | "NETWORK"
  | "UNKNOWN";

/** Best-effort language support map for browser recognition. Full locales and
 * their base codes are accepted; anything else is unsupported so the kiosk
 * never offers a mic it cannot service. */
const RECOGNISED_BASES: Record<string, true> = { en: true, hi: true, mr: true };
const baseOf = (locale: string): string => locale.split("-")[0] ?? locale;

/** True when this browser exposes speech recognition for the given locale. */
export function speechAvailable(locale: string): boolean {
  const SR =
    (window as unknown as { SpeechRecognition?: SpeechCtor })
      .SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: SpeechCtor })
      .webkitSpeechRecognition;
  return Boolean(SR) && RECOGNISED_BASES[baseOf(locale)] === true;
}

type SpeechCtor = new () => unknown;
const SpeechRecognitionCtor = (): SpeechCtor | undefined =>
  (window as unknown as { SpeechRecognition?: SpeechCtor }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: SpeechCtor })
    .webkitSpeechRecognition;

interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  isFinal: boolean;
  item(index: number): RecognitionAlternative;
}
interface RecognitionEvent {
  resultIndex: number;
  results: { length: number; item(index: number): RecognitionResult };
}

interface SpeechSessionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export interface SpeechSessionCallbacks {
  /** Live (non-final) text for an aria-live readout. */
  onPartial(text: string): void;
  /** Final recognised text (confidence unknown to the browser → null). */
  onFinal(text: string): void;
  onError(code: MicErrorCode): void;
  onEnd(): void;
}

export interface SpeechSession {
  start(): void;
  stop(): void;
}

function mapMicError(code: string): MicErrorCode {
  switch (code) {
    case "no-speech":
      return "NO_SPEECH";
    case "not-allowed":
    case "service-not-allowed":
      return "PERMISSION_DENIED";
    case "audio-capture":
    case "not-supported":
      return "NOT_SUPPORTED";
    case "network":
      return "NETWORK";
    case "aborted":
      return "TIMEOUT";
    default:
      return "UNKNOWN";
  }
}

/**
 * A streaming WebSpeech recognition session. `onPartial` fires for interim
 * results, `onFinal` once per final result; `onEnd` fires only when the session
 * ends without a final result (no-speech, error, or stop).
 */
export function createSpeechSession(
  language: string,
  callbacks: SpeechSessionCallbacks,
): SpeechSession {
  const Ctor = SpeechRecognitionCtor();
  if (!Ctor) throw new Error("NOT_SUPPORTED");
  const rec = new Ctor() as SpeechSessionLike;
  let hasFinal = false;

  rec.lang = language;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  rec.onresult = (event: RecognitionEvent) => {
    let final = "";
    let interim = "";
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results.item(i);
      const transcript = result.item(0).transcript;
      if (result.isFinal) {
        final += transcript;
        hasFinal = true;
      } else {
        interim += transcript;
      }
    }
    if (final) callbacks.onFinal(final.trim());
    else if (interim) callbacks.onPartial(interim.trim());
  };

  rec.onerror = (event) => callbacks.onError(mapMicError(event.error));

  rec.onend = () => {
    if (!hasFinal) callbacks.onEnd();
  };

  return {
    start() {
      hasFinal = false;
      try {
        rec.start();
      } catch {
        callbacks.onError("UNKNOWN");
      }
    },
    stop() {
      try {
        rec.abort();
      } catch {
        /* already stopped */
      }
    },
  };
}

/** Speak `text` aloud (browser TTS); a prior utterance is cancelled first. */
export function speak(
  text: string,
  language: string,
  onend?: () => void,
): void {
  if (!("speechSynthesis" in window)) return;
  stopSpeaking();
  if (typeof SpeechSynthesisUtterance === "undefined") return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language;
  if (onend) utterance.onend = () => onend();
  window.speechSynthesis.speak(utterance);
}

/** Cancel any in-flight utterance (used to stop a read-aloud on interaction). */
export function stopSpeaking(): void {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}
