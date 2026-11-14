import { readFileSync } from "node:fs";
import OpenAI from "openai";
import { getOpenAIApiKey } from "../config.js";
import { ARCHETYPES, createArchetypeProvider, type Archetype } from "./archetypes.js";
import { decisionSchemasForSymbols, openAiDecisionResponseSchema } from "./llm-schema.js";
import type { DecisionProvider } from "./runtime.js";

export const AGENT_PROMPT_VERSION = "llm-agent-v6";

const REQUEST_TIMEOUT_MS = 60_000;
/** Upper bound on retrieved memories sent to the model (prompt size and attention). */
export const MAX_MEMORIES_IN_PROMPT = 5;

/**
 * The slice of the OpenAI SDK the agents use, so tests can inject a stub.
 * Same `openai` package and config getters as `OpenAIEmbedder`.
 */
export interface ChatClient {
  chat: {
    completions: {
      create(
        body: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
        options: { timeout: number; maxRetries: number },
      ): Promise<unknown>;
    };
  };
}

export function createOpenAIChatClient(): ChatClient {
  return new OpenAI({ apiKey: getOpenAIApiKey() });
}

/** One record per model call (provider, model, latency, tokens, outcome). Never contains bodies. */
export interface LlmCallRecord {
  provider: "openai";
  model: string;
  archetype: Archetype;
  latencyMs: number;
  outcome: "ok" | "http_error" | "transport_error" | "invalid_output";
  httpStatus?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

const sharedPrompt = readFileSync(new URL("./prompts/shared.md", import.meta.url), "utf8");

export function createLlmProvider(options: {
  archetype: Archetype;
  model: string;
  client: ChatClient;
  onCall?: (record: LlmCallRecord) => void;
}): DecisionProvider {
  const { archetype, model, client } = options;
  const baseline = createArchetypeProvider(archetype);
  const archetypePrompt = readFileSync(
    new URL(`./prompts/${archetype}.md`, import.meta.url),
    "utf8",
  );
  // SYSTEM holds instructions only; every observation, memory and news item goes in USER.
  const system = [
    sharedPrompt,
    archetypePrompt,
    `Starting baseline parameters: ${JSON.stringify(ARCHETYPES[archetype])}. These are guidance, not mandatory rules.`,
  ].join("\n\n");

  return async (context) => {
    const availableSymbols = Object.keys(context.observation.prices);
    const { jsonSchema, schema } = decisionSchemasForSymbols(availableSymbols);
    // Fail closed before the model call rather than truncating silently.
    if ((context.memories?.length ?? 0) > MAX_MEMORIES_IN_PROMPT) {
      throw new Error(
        `Too many retrieved memories for one decision (max ${MAX_MEMORIES_IN_PROMPT})`,
      );
    }
    const user = JSON.stringify({
      ...context,
      availableSymbols,
      baselineSuggestion: await baseline(structuredClone(context)),
    });
    const started = Date.now();
    const report = (
      record: Omit<LlmCallRecord, "provider" | "model" | "archetype" | "latencyMs">,
    ) =>
      options.onCall?.({
        provider: "openai",
        model,
        archetype,
        latencyMs: Date.now() - started,
        ...record,
      });

    let payload: unknown;
    try {
      payload = await client.chat.completions.create(
        {
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "agent_decision",
              strict: true,
              schema: jsonSchema,
            },
          },
        },
        // No silent retries: a failed call must not quietly change what ran.
        { timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 },
      );
    } catch (error) {
      // Never echo provider errors: they can include request details or untrusted text.
      const status = (error as { status?: unknown } | null)?.status;
      if (typeof status === "number") {
        report({ outcome: "http_error", httpStatus: status });
        throw new Error(`Agent LLM request failed (HTTP ${status})`);
      }
      report({ outcome: "transport_error" });
      throw new Error("Agent LLM request failed or timed out");
    }

    const parsed = openAiDecisionResponseSchema.safeParse(payload);
    const usage = parsed.success ? parsed.data.usage : undefined;
    const tokens = usage
      ? {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        }
      : {};
    try {
      if (!parsed.success) throw new Error("malformed response");
      const choice = parsed.data.choices[0]!;
      if (choice.finish_reason !== "stop" || choice.message.refusal || !choice.message.content) {
        throw new Error("missing complete decision");
      }
      const decision = schema.parse(JSON.parse(choice.message.content));
      report({ outcome: "ok", ...tokens });
      return decision;
    } catch {
      report({ outcome: "invalid_output", ...tokens });
      throw new Error("Agent LLM returned an invalid, refused, or incomplete decision");
    }
  };
}
