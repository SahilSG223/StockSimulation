# Agents

The no-memory baseline validates observations and complete decision batches with
Zod, then submits orders through the simulation. The caller registers agents and
advances the clock. Each runtime acts at most once per tick. Invalid decisions
throw before any order is submitted; valid orders may still be rejected by the
engine for financial risk. A batch is sequential, not an atomic transaction.

```ts
import { MarketEngine } from "../simulation/market-engine.js";
import { AgentRuntime, createArchetypeProvider } from "./index.js";

const simulation = new MarketEngine({ seed: 42 });
simulation.registerAgent("alice");
const agent = new AgentRuntime({
  agentId: "alice",
  simulation,
  decide: createArchetypeProvider("momentum"),
});

for (let tick = 0; tick < 20; tick++) {
  console.log(await agent.runCycle()); // context, reasoning, orders, results
  simulation.step();
}
```

Archetypes are deterministic starting configurations:

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
They use observed price changes, never the simulator's ground-truth regime or
event effects. The first observation produces a hold. Confidence is a heuristic
signal strength, not a calibrated probability. Engine risk limits remain authoritative.

`decide` accepts a validated context and returns unknown data (or a promise), so
a model adapter can replace the baseline provider. Use `decisionSchema` for native
structured output; keep instructions in SYSTEM and serialize observations as
USER data. This module makes no external API calls and requires no API keys.
The runtime validates every provider output regardless of provider implementation.
It rejects decisions if the market advances while awaiting a provider.

Returned decision records can be logged by evaluation or passed to the memory
stream's experience recorder. Persistent retrieval and consolidation are outside
this no-memory baseline; nonempty memory references are rejected.
