/**
 * OCR provider abstraction and a deterministic hash-addressed mock.
 *
 * Pure TS: the document hash is computed with a self-contained SHA-256 so the
 * package runs identically in Node (tests, server) and the browser (kiosk)
 * with no platform crypto or network/IO dependency.
 */

export interface OcrPageSource {
  pageNumber: number;
  mimeType: string;
  bytesBase64: string;
}

export interface OcrPageResult {
  pageNumber: number;
  text: string;
  confidence: number;
  issues: string[];
}

export interface OcrResult {
  provider: string;
  model: string;
  pages: OcrPageResult[];
  overallConfidence: number;
  /** Unambiguous fingerprint of the submitted document content. */
  artefactHash: string;
}

export interface OcrInput {
  documentId: string;
  pages: OcrPageSource[];
  languageHint?: string;
}

export interface OcrProvider {
  readonly id: string;
  extract(input: OcrInput): Promise<OcrResult>;
}

// ---------------------------------------------------------------------------
// Minimal self-contained SHA-256 (FIPS 180-4), hex output.
// ---------------------------------------------------------------------------

const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/** SHA-256 of an arbitrary byte array, returned as lower-case hex. */
export function sha256Hex(data: Uint8Array): string {
  const len = data.length;
  const padded = new Uint8Array(((len + 72) >> 6) << 6); // >= len + 1 + 8, % 64 === 0
  padded.set(data);
  padded[len] = 0x80;
  // 64-bit big-endian bit length in the final 8 bytes (upper word for len < 2^29 is 0).
  const bitLo = (len * 8) >>> 0;
  const L = padded.length;
  padded[L - 8] = 0;
  padded[L - 7] = 0;
  padded[L - 6] = 0;
  padded[L - 5] = 0;
  padded[L - 4] = (bitLo >>> 24) & 0xff;
  padded[L - 3] = (bitLo >>> 16) & 0xff;
  padded[L - 2] = (bitLo >>> 8) & 0xff;
  padded[L - 1] = bitLo & 0xff;

  let h0 = 0x6a09e667,
    h1 = 0xbb67ae85,
    h2 = 0x3c6ef372,
    h3 = 0xa54ff53a;
  let h4 = 0x510e527f,
    h5 = 0x9b05688c,
    h6 = 0x1f83d9ab,
    h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let i = 0; i < padded.length; i += 64) {
    for (let t = 0; t < 16; t++) {
      const o = i + 4 * t;
      w[t] =
        (padded[o]! << 24) |
        (padded[o + 1]! << 16) |
        (padded[o + 2]! << 8) |
        padded[o + 3]!;
    }
    for (let t = 16; t < 64; t++) {
      const s0 =
        rotr(w[t - 15]!, 7) ^ rotr(w[t - 15]!, 18) ^ (w[t - 15]! >>> 3);
      const s1 = rotr(w[t - 2]!, 17) ^ rotr(w[t - 2]!, 19) ^ (w[t - 2]! >>> 10);
      w[t] = (w[t - 16]! + s0 + w[t - 7]! + s1) >>> 0;
    }
    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4,
      f = h5,
      g = h6,
      h = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K256[t]! + w[t]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((word) => (word >>> 0).toString(16).padStart(8, "0"))
    .join("");
}

/** Base64 → bytes (pure, tolerant of missing padding). */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/=+$/, "");
  const table =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = table.indexOf(clean[i]!);
    const c1 = clean[i + 1] !== undefined ? table.indexOf(clean[i + 1]!) : 0;
    const c2 = clean[i + 2] !== undefined ? table.indexOf(clean[i + 2]!) : 0;
    const c3 = clean[i + 3] !== undefined ? table.indexOf(clean[i + 3]!) : 0;
    const n = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    out.push((n >> 16) & 0xff);
    if (clean[i + 1] !== undefined) out.push((n >> 8) & 0xff);
    if (clean[i + 2] !== undefined) out.push(n & 0xff);
  }
  return new Uint8Array(out);
}

/**
 * Deterministic OCR stand-in for offline/demo runs and unit tests.
 *
 * MOCKED: this provider reads no pixels and performs no document recognition.
 * It looks up the SHA-256 of each submitted page's bytes in an entry map and
 * returns the pre-registered text verbatim; content it has never seen resolves
 * to an explicit `UNRECOGNISED_SYNTHETIC_CONTENT` issue rather than fabricated
 * text. Never present this as "OCR on real documents".
 */
export class DeterministicMockOcrProvider implements OcrProvider {
  readonly id = "mock-ocr";
  readonly model = "deterministic-mock-ocr";
  private readonly entries: Record<
    string,
    { text: string; confidence: number }
  >;

  constructor(entries: Record<string, { text: string; confidence: number }>) {
    this.entries = entries;
  }

  async extract(input: OcrInput): Promise<OcrResult> {
    const pages = input.pages.map((page) => {
      const hash = sha256Hex(base64ToBytes(page.bytesBase64));
      const entry = this.entries[hash];
      return entry
        ? {
            pageNumber: page.pageNumber,
            text: entry.text,
            confidence: entry.confidence,
            issues: [] as string[],
          }
        : {
            pageNumber: page.pageNumber,
            text: "",
            confidence: 0,
            issues: ["UNRECOGNISED_SYNTHETIC_CONTENT"],
          };
    });
    const overallConfidence =
      pages.length === 0
        ? 0
        : pages.reduce((sum, p) => sum + p.confidence, 0) / pages.length;
    const artefactHash = sha256Hex(
      new Uint8Array(
        input.pages.flatMap((p) => Array.from(base64ToBytes(p.bytesBase64))),
      ),
    );
    return {
      provider: this.id,
      model: this.model,
      pages,
      overallConfidence,
      artefactHash,
    };
  }
}
