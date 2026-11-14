# Agents

## Decision cycle

1. Receive structured market observation
2. Retrieve + evaluate memories
3. Interpret conditions → propose validated orders
4. Submit to simulation → receive authoritative result
5. Record experience → consolidate memories when justified

## Prompts

- Use OpenAI exclusively for agent decisions and embeddings. Configure models
  with `AGENT_MODEL` / `EMBEDDING_MODEL` and authenticate with `OPENAI_API_KEY`.

- **SYSTEM = instructions**, **USER = data**. Never put untrusted/user/market
  text into the system prompt (prompt-injection risk).
- Prefer native structured output validated with Zod over free-form JSON parsing.
- Constrain shape, not fake quotas ("emit exactly 3 memories").
- Escape/delimiter-wrap injected data so it cannot close your tags.

## Tools / side effects

Agents interact with the environment through a controlled interface (submit
order, retrieve memory). Tools with lasting side effects must go through that
interface — not ad-hoc Mongo writes from the model.

## Archetypes are starting points

- All seven trading archetypes use LLM decisions by default, configured by
  `AGENT_MODEL`. Deterministic providers are explicit evaluation baselines and
  may supply suggestions; they must not silently replace failed LLM calls.

Momentum / contrarian / conservative / aggressive / adaptive are **initial
configs**. Agents should be able to change behavior when experiences justify it.
