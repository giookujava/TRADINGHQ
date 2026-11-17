/**
 * OpenAI models offered in Settings, with standard prices in USD per 1M tokens
 * (developers.openai.com/api/docs/pricing, checked 2026-11-17). Used only to ESTIMATE spend for the
 * monthly budget cap — the OpenAI dashboard is the source of truth for billing.
 */
export const AI_MODELS = {
  "gpt-6-luna": { label: "GPT-6 Luna — fastest, lowest cost", input: 0.1, cached: 0.01, output: 0.5 },
  "gpt-6.1-terra": { label: "GPT-6.1 Terra — balanced", input: 1, cached: 0.05, output: 5 },
  "gpt-6.1-sol": { label: "GPT-6.1 Sol — recommended", input: 2, cached: 0.1, output: 10 },
  "gpt-6-astra": { label: "GPT-6 Astra — most capable, expensive", input: 10, cached: 1, output: 50 },
} as const;
export type AiModelId = keyof typeof AI_MODELS;
export const DEFAULT_AI_MODEL: AiModelId = "gpt-6.1-sol";

export function isAiModel(v: unknown): v is AiModelId {
  return typeof v === "string" && v in AI_MODELS;
}

/** Estimated cost in USD. `inputTokens` includes cached tokens (OpenAI usage semantics). */
export function estimateCost(model: string, inputTokens: number, cachedTokens: number, outputTokens: number): number {
  const p = AI_MODELS[isAiModel(model) ? model : DEFAULT_AI_MODEL];
  const uncached = Math.max(0, inputTokens - cachedTokens);
  return (uncached * p.input + cachedTokens * p.cached + outputTokens * p.output) / 1_000_000;
}
