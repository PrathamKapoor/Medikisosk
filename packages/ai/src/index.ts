/**
 * @medikiosk/ai — provider abstractions (ASR/TTS/OCR/LLM) with deterministic
 * mocks, plus shared voice-confidence helpers.
 *
 * Pure package: no network/IO, no timers, no `Date.now()` (deterministic).
 * Every mock is named `*Mock*`/`Deterministic*` and documented as MOCKED — a
 * mock is never presented as a real provider.
 */
export * from "./asr";
export * from "./tts";
export * from "./ocr";
export * from "./llm";
