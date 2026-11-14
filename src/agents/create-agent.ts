import { createArchetypeProvider, type Archetype } from "./archetypes.js";
import { createLlmProvider, readLlmConfig } from "./llm-provider.js";
import { AgentRuntime } from "./runtime.js";

/** LLM decisions by default; deterministic trading requires explicit baseline mode. */
export function createAgent(options: {
  agentId: string;
  archetype: Archetype;
  simulation: ConstructorParameters<typeof AgentRuntime>[0]["simulation"];
  mode?: "llm" | "baseline";
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  retrieveMemories?: ConstructorParameters<typeof AgentRuntime>[0]["retrieveMemories"];
}): AgentRuntime {
  const decide =
    options.mode === "baseline"
      ? createArchetypeProvider(options.archetype)
      : createLlmProvider({
          archetype: options.archetype,
          config: readLlmConfig(options.env),
          ...(options.fetch ? { fetch: options.fetch } : {}),
        });
  return new AgentRuntime({
    agentId: options.agentId,
    simulation: options.simulation,
    decide,
    ...(options.mode !== "baseline" && options.retrieveMemories
      ? { retrieveMemories: options.retrieveMemories }
      : {}),
  });
}
