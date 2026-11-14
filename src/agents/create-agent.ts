import { getAgentModel } from "../config.js";
import { createArchetypeProvider, type Archetype } from "./archetypes.js";
import {
  createLlmProvider,
  createOpenAIChatClient,
  type ChatClient,
  type LlmCallRecord,
} from "./llm-provider.js";
import { AgentRuntime } from "./runtime.js";

type RuntimeOptions = ConstructorParameters<typeof AgentRuntime>[0];

/** LLM decisions by default; deterministic trading requires explicit baseline mode. */
export function createAgent(options: {
  agentId: string;
  archetype: Archetype;
  simulation: RuntimeOptions["simulation"];
  observeMarket?: RuntimeOptions["observeMarket"];
  mode?: "llm" | "baseline";
  /** Defaults to `AGENT_MODEL` via `getAgentModel()`. */
  model?: string;
  /** Defaults to an OpenAI client keyed by `OPENAI_API_KEY`. */
  client?: ChatClient;
  onLlmCall?: (record: LlmCallRecord) => void;
  retrieveMemories?: RuntimeOptions["retrieveMemories"];
}): AgentRuntime {
  const decide =
    options.mode === "baseline"
      ? createArchetypeProvider(options.archetype)
      : createLlmProvider({
          archetype: options.archetype,
          model: options.model ?? getAgentModel(),
          client: options.client ?? createOpenAIChatClient(),
          ...(options.onLlmCall ? { onCall: options.onLlmCall } : {}),
        });
  return new AgentRuntime({
    agentId: options.agentId,
    simulation: options.simulation,
    decide,
    ...(options.observeMarket ? { observeMarket: options.observeMarket } : {}),
    ...(options.mode !== "baseline" && options.retrieveMemories
      ? { retrieveMemories: options.retrieveMemories }
      : {}),
  });
}
