/**
 * Unit tests for @medikiosk/ai provider abstractions and deterministic mocks.
 *
 * Pins: mock determinism, `needsConfirmation` on null/<threshold, OCR hash +
 * unknown-content handling, and the LLM fallback's schema-validity, prompt
 * version recording and unknown-promptKey error.
 */
import { describe, it, expect } from "vitest";
import {
  needsConfirmation,
  MockAsrProvider,
  DeterministicMockOcrProvider,
  base64ToBytes,
  sha256Hex,
  DeterministicFallbackLlmProvider,
  type AsrTranscript,
} from "../index";

const CANNED_EN = "I am having chest pain";
const CANNED_HI = "मुझे सीने में दर्द है";

function enTranscript(overrides: Partial<AsrTranscript> = {}): AsrTranscript {
  return {
    isFinal: true,
    text: CANNED_EN,
    language: "en-IN",
    confidence: 0.9,
    provider: "mock-asr",
    model: "deterministic-mock-asr",
    durationMs: 0,
    ...overrides,
  };
}

describe("needsConfirmation", () => {
  it("returns true when confidence is null (browser recognisers often withhold it)", () => {
    expect(needsConfirmation(enTranscript({ confidence: null }))).toBe(true);
  });
  it("returns true below the reliability threshold (0.7)", () => {
    expect(needsConfirmation(enTranscript({ confidence: 0.6 }))).toBe(true);
    expect(needsConfirmation(enTranscript({ confidence: 0 }))).toBe(true);
  });
  it("returns false at and above the threshold", () => {
    expect(needsConfirmation(enTranscript({ confidence: 0.7 }))).toBe(false);
    expect(needsConfirmation(enTranscript({ confidence: 0.95 }))).toBe(false);
  });
});

describe("MockAsrProvider", () => {
  const provider = new MockAsrProvider({
    "en-IN": { text: CANNED_EN, confidence: 0.9 },
    hi: { text: CANNED_HI, confidence: null },
  });

  it("is deterministic for the same input", async () => {
    const input = {
      audio: { mimeType: "audio/webm" },
      language: "en-IN",
    };
    const a = await provider.transcribe(input);
    const b = await provider.transcribe(input);
    expect(a).toEqual(b);
    expect(a.text).toBe(CANNED_EN);
    expect(a.provider).toBe("mock-asr");
    expect(a.isFinal).toBe(true);
  });

  it("matches a full locale by its base language code", async () => {
    expect(provider.supportsLanguage("hi-IN")).toBe(true);
    const out = await provider.transcribe({
      audio: { mimeType: "audio/webm" },
      language: "hi-IN",
    });
    expect(out.text).toBe(CANNED_HI);
    expect(out.confidence).toBeNull();
  });

  it("reports NO_SPEECH for an unsupported language instead of fabricating", async () => {
    expect(provider.supportsLanguage("ta-IN")).toBe(false);
    const out = await provider.transcribe({
      audio: { mimeType: "audio/webm" },
      language: "ta-IN",
    });
    expect(out.error).toBe("NO_SPEECH");
    expect(out.text).toBe("");
  });
});

describe("SHA-256 helper", () => {
  it("matches the canonical empty-string digest", () => {
    expect(sha256Hex(new Uint8Array(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
  it("matches the canonical 'abc' digest", () => {
    // bytes 61 62 63
    expect(sha256Hex(new Uint8Array([0x61, 0x62, 0x63]))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
  it("decodes base64 to the original bytes", () => {
    // "abc" → "YWJj"
    expect(Array.from(base64ToBytes("YWJj"))).toEqual([0x61, 0x62, 0x63]);
  });
});

describe("DeterministicMockOcrProvider", () => {
  const knownHash = sha256Hex(base64ToBytes("YWJj")); // bytes of "abc"
  const provider = new DeterministicMockOcrProvider({
    [knownHash]: { text: "Patient reports prior surgery", confidence: 0.88 },
  });

  it("recognises pre-registered content by content hash", async () => {
    const out = await provider.extract({
      documentId: "doc-1",
      pages: [
        { pageNumber: 1, mimeType: "application/pdf", bytesBase64: "YWJj" },
      ],
    });
    expect(out.pages).toHaveLength(1);
    expect(out.pages[0]!.text).toBe("Patient reports prior surgery");
    expect(out.pages[0]!.confidence).toBe(0.88);
    expect(out.pages[0]!.issues).toEqual([]);
    expect(out.artefactHash).toBe(knownHash);
    expect(out.overallConfidence).toBeCloseTo(0.88);
  });

  it("flags UNRECOGNISED_SYNTHETIC_CONTENT for unknown pages without fabricating", async () => {
    const out = await provider.extract({
      documentId: "doc-2",
      pages: [
        { pageNumber: 1, mimeType: "image/png", bytesBase64: "dW5rbm93bg==" },
      ],
    });
    expect(out.pages[0]!.text).toBe("");
    expect(out.pages[0]!.confidence).toBe(0);
    expect(out.pages[0]!.issues).toContain("UNRECOGNISED_SYNTHETIC_CONTENT");
    expect(out.artefactHash).not.toBe(knownHash);
  });

  it("averages confidence across recognised pages", async () => {
    const out = await provider.extract({
      documentId: "doc-3",
      pages: [
        { pageNumber: 1, mimeType: "application/pdf", bytesBase64: "YWJj" },
      ],
    });
    expect(out.overallConfidence).toBeCloseTo(0.88);
  });
});

describe("DeterministicFallbackLlmProvider", () => {
  const provider = new DeterministicFallbackLlmProvider({
    "summary.triage": (ctx: unknown) => {
      const c = (ctx as { symptomCount?: number }) ?? {};
      return { symptomCount: c.symptomCount ?? 0, draft: "auto" };
    },
  });
  const schema = {
    parse: (json: string) => {
      const v = JSON.parse(json) as { symptomCount: number };
      if (typeof v.symptomCount !== "number") throw new Error("bad shape");
      return v;
    },
  };

  it("produces a schema-valid, deterministic output and records the prompt version", async () => {
    const a = await provider.complete({
      promptKey: "summary.triage",
      promptVersion: "1.2.0",
      schema,
      contextJson: { symptomCount: 4 },
    });
    const b = await provider.complete({
      promptKey: "summary.triage",
      promptVersion: "1.2.0",
      schema,
      contextJson: { symptomCount: 4 },
    });
    expect(a.output).toEqual(b.output);
    expect(a.output).toEqual({ symptomCount: 4, draft: "auto" });
    expect(a.promptVersion).toBe("1.2.0");
    expect(a.model).toBe("deterministic-template-engine");
    expect(a.latencyMs).toBe(0);
  });

  it("throws on an unknown promptKey instead of fabricating", async () => {
    await expect(
      provider.complete({
        promptKey: "prompt.that.does.not.exist",
        promptVersion: "1",
        schema,
        contextJson: {},
      }),
    ).rejects.toThrow(/unknown promptKey/);
  });
});
