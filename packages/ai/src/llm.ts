/**
 * LLM provider abstraction and a deterministic template fallback.
 *
 * The interview/triage/selection engines never use an LLM (ADR-009/012). This
 * contract exists for future AI_DERIVED summary drafting, gated behind mandatory
 * physician review. The fallback provider is a rule/template engine, NOT a
 * model, and is labelled MOCKED accordingly.
 */

/** Minimal structural validator the caller supplies (e.g. a zod schema's parse). */
export interface LlmSchema {
  parse(json: string): unknown;
}

export interface LlmInput {
  promptKey: string;
  promptVersion: string;
  schema: LlmSchema;
  contextJson: unknown;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmResult {
  output: unknown;
  model: string;
  promptVersion: string;
  latencyMs: number;
  tokenUsage?: { input: number; output: number };
}

export interface LlmProvider {
  readonly id: string;
  complete(input: LlmInput): Promise<LlmResult>;
}

/** promptKey → deterministic builder producing a schema-valid output from context. */
export type LlmTemplate = (contextJson: unknown) => unknown;

/**
 * Deterministic LLM stand-in for offline/demo runs and unit tests.
 *
 * MOCKED: this is a rule/template engine, not a model — it maps a `promptKey`
 * to a pure function of the context JSON and validates the result against the
 * caller's schema. It never generates free-form text, makes no network calls,
 * and is fully synchronous (latency 0). Unknown `promptKey`s throw rather than
 * fabricating an answer.
 */
export class DeterministicFallbackLlmProvider implements LlmProvider {
  readonly id = "deterministic-fallback-llm";
  readonly model = "deterministic-template-engine";
  private readonly templates: Readonly<Record<string, LlmTemplate>>;

  constructor(templates: Record<string, LlmTemplate>) {
    this.templates = templates;
  }

  async complete(input: LlmInput): Promise<LlmResult> {
    const template = this.templates[input.promptKey];
    if (!template) {
      throw new Error(
        `DeterministicFallbackLlmProvider: unknown promptKey "${input.promptKey}"`,
      );
    }
    const output = template(input.contextJson);
    // Enforce the caller's schema before returning — an invalidly-shaped
    // result is a contract violation, not a "model being creative".
    input.schema.parse(JSON.stringify(output));
    return {
      output,
      model: this.model,
      promptVersion: input.promptVersion,
      latencyMs: 0,
      tokenUsage: { input: 0, output: 0 },
    };
  }
}
