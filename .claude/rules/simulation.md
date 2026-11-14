# Simulation Engine

The simulation engine is the **source of truth** for all financial mechanics.

## LLMs may

- Interpret news and market events
- Reason about conditions and retrieved memories
- Propose strategies and orders
- Explain decisions and reflect on outcomes

## LLMs must not

- Invent market prices, fills, or portfolio balances
- Fabricate profits, losses, or market events
- Mutate simulation state outside the defined execution interface
- Be used to "calculate" authoritative P&L

## Determinism

Given identical inputs, random seed, and initial state, the engine must produce
the same market trajectory and execution results. Seeded PRNG only — no
`Math.random()` without a seed path.

Any change that alters trajectories or fills for the same seed and config bumps
`SIMULATION_VERSION` (`src/simulation/version.ts`) and updates the expected
values in `tests/simulation/golden-trajectory.test.ts` in the same commit. The
golden test is the gate; a failing golden test is never "fixed" by updating
numbers alone.

Every experiment records: seed, initial state, event sequence, market params,
agent/model/prompt versions, memory config, simulation version.

## Ownership

Agents submit orders. The engine validates, executes (or rejects), and returns
authoritative results. Agents never write portfolio or cash fields directly.
