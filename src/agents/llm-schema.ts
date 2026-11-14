import { z } from "zod";

/** Provider-compatible shape; semantic constraints remain in decisionSchema. */
export const llmDecisionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["orders", "reasoning", "strategy", "confidence", "memoryReferences"],
  properties: {
    orders: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["symbol", "side", "quantity"],
        properties: {
          symbol: { type: "string" },
          side: { type: "string", enum: ["buy", "sell"] },
          quantity: { type: "integer" },
        },
      },
    },
    reasoning: { type: "string" },
    strategy: { type: "string" },
    confidence: { type: "number" },
    memoryReferences: { type: "array", items: { type: "string" } },
  },
} as const;

export const openAiDecisionResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string(),
        message: z.object({
          content: z.string().nullable(),
          refusal: z.string().nullable().optional(),
        }),
      }),
    )
    .length(1),
  /** Kept for the per-call record (token usage). */
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative(),
      completion_tokens: z.number().int().nonnegative(),
      total_tokens: z.number().int().nonnegative(),
    })
    .optional(),
});
