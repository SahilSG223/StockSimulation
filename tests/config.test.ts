import { afterEach, describe, expect, it } from "vitest";
import {
  getAgentModel,
  getEmbeddingModel,
  modelConfigSummary,
} from "../src/config.js";

describe("model config", () => {
  const prevAgent = process.env.AGENT_MODEL;
  const prevEmbed = process.env.EMBEDDING_MODEL;
  const prevKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (prevAgent === undefined) delete process.env.AGENT_MODEL;
    else process.env.AGENT_MODEL = prevAgent;
    if (prevEmbed === undefined) delete process.env.EMBEDDING_MODEL;
    else process.env.EMBEDDING_MODEL = prevEmbed;
    if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevKey;
  });

  it("defaults to gpt-4o and text-embedding-3-small", () => {
    delete process.env.AGENT_MODEL;
    delete process.env.EMBEDDING_MODEL;
    expect(getAgentModel()).toBe("gpt-4o");
    expect(getEmbeddingModel()).toBe("text-embedding-3-small");
  });

  it("honors env overrides", () => {
    process.env.AGENT_MODEL = "gpt-4o-mini";
    process.env.EMBEDDING_MODEL = "text-embedding-3-large";
    expect(getAgentModel()).toBe("gpt-4o-mini");
    expect(getEmbeddingModel()).toBe("text-embedding-3-large");
  });

  it("summary never includes the api key value", () => {
    process.env.OPENAI_API_KEY = "sk-test-should-not-appear";
    process.env.AGENT_MODEL = "gpt-4o";
    process.env.EMBEDDING_MODEL = "text-embedding-3-small";
    const s = modelConfigSummary();
    expect(s.agentModel).toBe("gpt-4o");
    expect(s.embeddingModel).toBe("text-embedding-3-small");
    expect(s.openaiKeyPresent).toBe(true);
    expect(JSON.stringify(s)).not.toContain("sk-test");
  });
});
