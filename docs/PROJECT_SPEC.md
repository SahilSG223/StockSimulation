# Project Specification: Governed Memory Stress Testing for Autonomous AI Agents

## 1. Project Overview

### Working Concept

A stress-testing environment for autonomous AI agents that evaluates whether they can learn from experience, adapt to changing conditions, and recognize when their persistent memories are no longer reliable.

The environment consists of multiple autonomous agents competing in a simulated financial market. Agents observe market data, interpret events, make trading decisions, compete against one another, and accumulate experiences over time.

The central research question is:

**Can an autonomous agent use persistent memory to improve its decisions over time without becoming dependent on outdated, irrelevant, or misleading information?**

The financial market is the simulation environment, not the ultimate product. The broader goal is to evaluate the reliability of persistent memory in autonomous systems operating in dynamic environments.

### The Problem

Persistent memory gives autonomous agents the ability to retain knowledge across interactions and learn from previous experiences. However, persistent memory introduces several failure modes:

- Agents may continue relying on information that was previously useful but is no longer applicable.
- Successful strategies may become ineffective after environmental changes.
- Incorrect conclusions may become reinforced through repeated retrieval.
- Agents may retrieve experiences from contexts that are materially different from the current situation.
- Agents may fail to recognize contradictory evidence.
- Agents may become overconfident in lessons derived from a small number of observations.

Simply storing and retrieving more information does not necessarily make an agent more intelligent or reliable.

Our system explores how memory should be retrieved, evaluated, updated, corrected, and invalidated as the environment evolves.

---

## 2. Core Architectural Principles

These principles should guide all implementation decisions.

### 2.1 Separate Market Data from Agent Memory

Historical market data is not inherently semantic memory.

The system must distinguish four information categories:

| Category               | Examples                                                 | Storage / Processing                                    |
| ---------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| Structured market data | Prices, volume, trades, order books, timestamps          | MongoDB documents, time-series data, structured queries |
| Predictive features    | Returns, volatility, momentum, moving averages           | Deterministic calculations / statistical models         |
| Agent experiences      | Previous decisions, outcomes, strategy performance       | Persistent experience records                           |
| Semantic memory        | Lessons, contextual observations, strategy applicability | MongoDB Atlas Vector Search + metadata filters          |

Do not embed raw stock prices or structured financial records simply to use Vector Search.

Vector Search should retrieve contextual experiences and learned lessons, not replace ordinary database queries.

### 2.2 Deterministic Environment, Autonomous Decisions

The simulation engine must be deterministic given identical inputs, random seeds, and initial state.

LLMs may:

- Interpret news and market events.
- Reason about current market conditions.
- Retrieve and interpret relevant memories.
- Select strategies and make trading decisions.
- Explain decisions and reflect on outcomes.

LLMs must NOT:

- Invent market prices.
- Fabricate executed trades.
- Calculate authoritative portfolio balances.
- Determine whether an order actually filled.
- Modify the simulation state outside the defined execution interface.
- Invent profits, losses, or market events.

The simulation engine is the source of truth for all financial mechanics.

### 2.3 Memory Must Change Behavior

Storing memories is not sufficient.

The system must demonstrate that retrieved memories influence decisions, that memory reliability is evaluated, and that memory updates produce measurable changes in future behavior.

### 2.4 Reproducibility

Every experiment should be reproducible.

A scenario must record:

- Initial market state.
- Initial agent configurations.
- Random seed.
- Event sequence.
- Market parameters.
- Agent model and prompt versions.
- Memory configuration.
- Simulation version.

This enables controlled comparisons between different memory architectures.

---

## 3. System Architecture

### 3.1 Simulation Engine

Responsible for maintaining the simulated financial environment.

Responsibilities:

- Maintain asset prices and market state.
- Generate price movements.
- Process market events and shocks.
- Accept and execute agent orders.
- Maintain portfolios and available cash.
- Calculate realized and unrealized P&L.
- Apply transaction costs and risk constraints.
- Produce authoritative execution results.
- Advance simulation time.

The engine must not depend on LLM-generated financial calculations.

Suggested modules: `MarketEngine`, `OrderBook`, `ExecutionEngine`, `PortfolioManager`, `PriceGenerator`, `EventScheduler`, `RiskManager`, `SimulationClock`.

### 3.2 Market Data and Feature Pipeline

Provides agents with a consistent view of the market (prices, windows, returns, volume, volatility, momentum, sector performance, news/events). Features are calculated with deterministic code. Expose structured observations rather than requiring agents to independently calculate basic metrics.

### 3.3 Agent Runtime

Each agent has identity, initial strategy, risk profile, portfolio, experience history, governed semantic memory, and decision history.

Decision cycle:

1. Receive current market observation.
2. Retrieve relevant memories.
3. Evaluate memory relevance and reliability.
4. Interpret current market conditions.
5. Generate a proposed trading action.
6. Validate the action against risk constraints.
7. Submit an order to the simulation engine.
8. Receive the authoritative execution result.
9. Evaluate the outcome.
10. Update experience records and persistent memories.

Agents should not directly modify their own financial state.

### 3.4 Memory System

Core product component supporting creation, contextual retrieval, confidence, provenance, temporal relevance, contradiction detection, correction, invalidation, expiration, scoped access, and auditable changes. See §5.

### 3.5 Evaluation Engine

Execute identical scenarios across agent configs; record performance and behavioral metrics; compare memory architectures; measure adaptation after shocks; evaluate retrieval quality; produce reports.

### 3.6 Frontend / Observability

Expose market performance and memory behavior. **Hackathon MVP** (see
`docs/UI_PLAYBOOK.md`):

1. Market strip — tick, prices, public chaos/event headlines
2. Decision panel — reasoning, orders, **which memories fired** (id + text)
3. Governance strip — lesson lifecycle `active` → `invalidated` after shock

Full wishlist (if time): charts, trades tape, regimes, experiment A/B/C compare,
optional realtime. Stack intent: Next.js / React. UI **never** invents
authoritative P&L — render simulation / demo-frame output only.

**Chaos is not a UI concern to invent:** a seeded Chaos Director (simulation /
evaluation) schedules shocks; the UI displays the plan + public headlines.

---

## 4. Simulated Financial Environment

### 4.1 Market Structure

Small controllable universe (e.g. Technology, Semiconductors, Energy, Financials, Consumer). Each asset: symbol, name, sector, price, volume, history, volatility params, market sensitivity, event exposures.

### 4.2 Market Price Generation

Deterministic seeded model, e.g.:

```
r(t) = μ(regime, asset) + β(asset) * market_return(t) + ε(t)
P(t+1) = P(t) * exp(r(t))
```

Configurable regimes: bull, bear, high/low volatility, sector rally/decline, recovery. Regimes change underlying parameters, not arbitrary multipliers.

### 4.3 Market Shocks and Events

Scheduled and injected events (AI demand shock, export restriction, rate hike, earnings surprise, supply-chain disruption). Each event has id, type, timestamp, affected assets/sectors, magnitude, duration, public info for agents, and underlying sim effects.

Separate the event’s **actual** market effect from the **information** agents receive. Agents reason from incomplete observables.

### 4.4 Market Regime Changes

Distinguish isolated events from sustained regime shifts. Evaluation knows ground-truth regime; agents must infer.

---

## 5. Governed Persistent Memory

### 5.1 Memory Categories

- **Episodic** — what the agent experienced (decision, hold, outcome).
- **Semantic** — generalized lessons.
- **Strategic** — reusable strategies + applicability / failure conditions.
- **Social / opponent** — observations about other agents.

Scoped to the generating agent unless explicitly shared.

### 5.2 Memory Schema (conceptual)

Fields include: agentId, type, content, embedding, sourceExperienceIds, timestamps, confidence, reliability, scope (sectors/regimes/eventTypes/assets), status, validity, evidence, version.

Refine from access patterns. Do not treat example confidence numbers as calibrated probabilities.

### 5.3 Memory Retrieval

Contextual, not similarity-only. Pipeline: decision context → ownership filters → metadata filters → semantic search → temporal + contextual ranking → bounded results with provenance.

### 5.4 Reliability and Temporal Decay

Separate confidence, contextual relevance, and reliability. Configurable ranking, e.g. similarity × applicability × temporalRelevance × reliability. Decay reduces influence; it does not auto-delete.

### 5.5 Contradiction Detection

Identify related memories, compare contexts, decide contradict vs different regime, update confidence/reliability, version or invalidate with reason. Prefer narrowing scope over blind overwrite.

### 5.6 Correction and Invalidation

States: `active`, `under_review`, `superseded`, `invalidated`, `expired`. Auditable changes with provenance and history.

### 5.7 Governance and Isolation

Enforce `agentId` at query level. Public market/news can be shared; private experiences stay isolated unless an explicit share mechanism exists.

---

## 6. Autonomous Trading Agents

### 6.1 Initial Archetypes

Momentum, Contrarian, Conservative, Aggressive, Adaptive — starting configs, not fixed behavior.

### 6.2 Decision Interface

Structured observation in; structured decision out (orders, reasoning, memoryReferences, confidence, strategy). Validate with strict schema. Engine decides validity/fills.

### 6.3 Learning Cycle

Record decision context, retrieved memories, execution result; create episodic experience; consolidate into semantic lessons when justified (avoid one semantic memory per trade).

---

## 7. MongoDB Data Architecture

Suggested collections: `simulations`, `assets`, `market_observations`, `market_events`, `agents`, `portfolios`, `orders`, `trades`, `experiences`, `memories`, `memory_versions`, `decisions`, `experiments`, `experiment_results`.

Indexes on agentId/status, simulationId/tick, symbol/timestamp, etc. Idempotent execution. Memory writes separate from authoritative financial execution. TTL optional for short-lived records — not the sole governance mechanism.

---

## 8. Evaluation and Benchmarking

See also `EVALUATION.md`.

Baselines: (A) no memory, (B) unrestricted memory, (C) governed memory.

Scenarios: stable, shock, regime reversal, contradictory evidence, misleading experience, opponent adaptation.

Metrics: financial, adaptation, memory quality, decision quality. Controlled seeds + ablations.

---

## 9. Technology Stack

- **Backend:** TypeScript / Node.js, MongoDB Atlas + Vector Search, Zod, deterministic simulation.
- **Agents:** LLM API with structured output; controlled tools for environment interaction.
- **Frontend:** Next.js / React, charts, optional realtime later.
- **Infra:** env-based config, reproducible experiment runner, logging.

Avoid unnecessary microservices during initial implementation.

---

## 10. Recommended Repository Structure

```
src/
  simulation/
  market/
  agents/
  memory/
  evaluation/
  database/
  api/
app/          # dashboard later
tests/
docs/
```

Suggested organization, not a requirement to create every file immediately.

---

## 11. Implementation Roadmap

1. **Deterministic simulation** — seeded market, events, execution, portfolios.
2. **Autonomous agents** — archetypes, observations, validated decisions.
3. **Persistent memory** — experiences, embeddings, vector retrieval, agent scope.
4. **Memory governance** — relevance, decay, contradiction, lifecycle, audit.
5. **Evaluation** — baselines, scenarios, metrics, ablations.
6. **Demo** — dashboard showing learn → shock → invalidate → behavior change.

Prioritize end-to-end over building every subsystem in isolation.

---

## 12. Explicit Non-Goals

Do not spend time on: real brokerage, real-money trading, production investment advice, complete market sim, HFT, general forecasting models, or complex multi-agent orchestration frameworks.

---

## 13. Definition of Success

Demonstrate through reproducible experiments that agents accumulate useful experiences; retrieve relevant context; distinguish history from current conditions; recognize unreliable memories; govern (correct/narrow/invalidate/deprioritize); and that governance measurably influences decisions vs simpler memory architectures.

### Final Product Thesis

We are building a stress-testing and evaluation environment for autonomous AI agents with persistent memory. The core contribution is the governed memory architecture and the evaluation framework that measures its impact on autonomous decision-making — not the trading simulation itself.
