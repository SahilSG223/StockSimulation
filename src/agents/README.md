# Agents

All seven archetypes use LLM decisions through `createAgent` by default.
Each archetype's full system instructions live in its own Markdown file:

- [Momentum](prompts/momentum.md)
- [Contrarian](prompts/contrarian.md)
- [Conservative](prompts/conservative.md)
- [Aggressive](prompts/aggressive.md)
- [Adaptive](prompts/adaptive.md)
- [Breakout](prompts/breakout.md)
- [Dip buyer](prompts/dip_buyer.md)

These files are loaded when the provider is created. Recreate agents after editing
a prompt. They contain trusted instructions; market observations remain separate
USER data. The prompt version is `llm-agent-v3`; bump it when changing behavior.
If packaging compiled JavaScript, copy `prompts/` beside the emitted agent files.

Set `AGENT_MODEL` to your chosen OpenAI model id and `OPENAI_API_KEY` in local
`.env`. All seven share that configured model while
receiving different system prompts. Prompt files contain no credentials.

OpenAI is the sole LLM provider. The configured model must support structured
outputs. No credentials or model ids are hardcoded.

Run `pnpm agents` to load `.env` and run all seven agents for three ticks with
seed 42. This makes 21 model requests and prints decision records. It requires
Node 20.6+ for `--env-file`. The library reads `process.env`; applications must
load their environment before calling `createAgent`.
After the final market step, the runner prints a portfolio table for all seven
agents: starting cash, remaining cash, equity, realized and unrealized P&L, net
P&L (final equity minus starting cash, including fees), and holdings. These values
come from the simulation's final snapshots at the tick shown above the table.
The runner also requires `MONGODB_URI` and persists each completed cycle in MongoDB.
See [persistent experiences](../memory/README.md) and use `pnpm memory:check` to
check database access separately from LLM calls.

The runtime validates observations, retrieved memories, and complete decision batches with
Zod, then submits orders through the simulation. The caller registers agents and
advances the clock. Each runtime acts at most once per tick. Invalid decisions
throw before any order is submitted; valid orders may still be rejected by the
engine for financial risk. A batch is sequential, not an atomic transaction.

```ts
import { MarketEngine } from "../simulation/market-engine.js";
import { createAgent } from "./index.js";

const simulation = new MarketEngine({ seed: 42 });
simulation.registerAgent("alice");
const agent = createAgent({
  agentId: "alice",
  simulation,
  archetype: "momentum",
});

for (let tick = 0; tick < 20; tick++) {
  console.log(await agent.runCycle()); // context, reasoning, orders, results
  simulation.step();
}
```

Each LLM receives archetype instructions, structured observations, and a
deterministic baseline suggestion. It can deviate from that suggestion with
reasoning. API failures, refusals, and invalid outputs fail closed; there is no
automatic baseline fallback. Engine risk limits and Zod validate decisions;
baseline agreement is not a validity requirement.

For reproducible evaluation, pass `mode: "baseline"` to `createAgent` explicitly
(no API keys needed), or use `createArchetypeProvider` with `AgentRuntime`.
The deterministic baseline parameters are:

| Archetype | Signal | Buy allocation (available cash) |
| --- | --- | --- |
| `momentum` | Follow price moves of at least 0.1% | 10% |
| `contrarian` | Trade against price moves of at least 0.1% | 10% |
| `conservative` | Follow price moves of at least 1% | 2% |
| `aggressive` | Follow price moves of at least 0.05% | 25% |
| `adaptive` | Follow moves when at least 75% of observed assets move in the same direction; otherwise trade against moves. Minimum move: 0.2%. | 8%, reduced to 2% when mean absolute price change is at least 3% |
| `breakout` | Follow price moves of at least 3%; ignore smaller changes | 15% |
| `dip_buyer` | Buy after a price decline of at least 2%; hold through rises, with no sell signals | 5% |

Sell signals liquidate the selected holding; agents do not short. Each cycle
selects at most one executable signal, ranked by absolute price change with
symbol order breaking ties. Buy quantities are rounded down to whole shares.
Adaptive recalculates its mode each cycle from assets present in both observations;
this is a price-based heuristic, not persistent learning or a volatility estimate.
Baselines use observed price changes, never the simulator's ground-truth regime or
event effects. Their first observation produces a hold; LLMs may choose an action
on the first observation. Baseline confidence is a heuristic signal strength,
not a calibrated probability. Engine risk limits remain authoritative.

`decide` accepts a validated context and returns unknown data (or a promise), so
a model adapter can replace the baseline provider. Use `decisionSchema` for native
structured output; keep instructions in SYSTEM and serialize observations as
USER data. `createLlmProvider` calls the OpenAI API using native fetch,
with a 60-second request timeout and no implicit retries.
The runtime validates every provider output regardless of provider implementation.
It rejects decisions if the market advances while awaiting a provider.

`pnpm agents` embeds experience narratives using `EMBEDDING_MODEL` and retrieves
similar experiences before each `AGENT_MODEL` decision through MongoDB Vector
Search. Records include the retrieved candidates and the model's chosen
`memoryReferences`. Only ids supplied to that decision may be cited. Baseline
mode never retrieves memories. Standalone `createAgent` callers can attach the
`retrieveMemories` callback; without it, agents use no persistent memory.

Set `EMBEDDING_MODEL` in `.env` and run `pnpm memory:prepare` to provision and
check the vector index before the first run. See the memory README for filtering,
ranking, backfill, consistency limits, and model changes.
