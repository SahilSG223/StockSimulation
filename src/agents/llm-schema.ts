import { z } from "zod";
import { decisionSchema } from "./decision-schema.js";

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

/** Constrain generation and response validation to this observation's action space. */
export function decisionSchemasForSymbols(symbols: readonly string[]) {
  if (symbols.length === 0) throw new Error("Agent market observation has no available symbols");
  const allowed = new Set(symbols);
  return {
    jsonSchema: {
      ...llmDecisionJsonSchema,
      properties: {
        ...llmDecisionJsonSchema.properties,
        orders: {
          ...llmDecisionJsonSchema.properties.orders,
          items: {
            ...llmDecisionJsonSchema.properties.orders.items,
            properties: {
              ...llmDecisionJsonSchema.properties.orders.items.properties,
              symbol: { type: "string", enum: [...allowed] },
            },
          },
        },
      },
    },
    schema: decisionSchema.superRefine((decision, context) => {
      decision.orders.forEach((order, index) => {
        if (!allowed.has(order.symbol)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["orders", index, "symbol"],
            message: "Order symbol must exactly match an observed symbol",
          });
        }
      });
    }),
  };
}

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
