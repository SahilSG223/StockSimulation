# Evaluation

A trading leaderboard alone is not success. We measure whether **governed
memory** improves agent behavior under change.

## Baselines (identical scenarios)

| ID  | Config                                             |
| --- | -------------------------------------------------- |
| A   | No persistent memory                               |
| B   | Unrestricted persistent memory (little governance) |
| C   | Governed memory (context, reliability, lifecycle)  |

## Scenarios

1. Stable market — does memory help?
2. Sudden shock — how fast do agents adapt?
3. Regime reversal — do they cling to old lessons?
4. Contradictory evidence — correct vs overwrite blindly?
5. Misleading experience — overgeneralization from luck?
6. Opponent adaptation — stale models of other agents?

## Metric families

- **Financial** — return, drawdown, vol, win rate (necessary, not sufficient)
- **Adaptation** — ticks-to-response, recovery, repeated mistakes
- **Memory quality** — retrieval precision, stale/invalid influence, correction latency
- **Decision quality** — consistency with available info; memory actually used

## Controls

Same seed, event sequence, capital, and execution rules. Multiple seeds.
Ablations: no decay / no contradiction / no contextual filters / no confidence
updates / no consolidation.

Success criteria summary: see `PROJECT_SPEC.md` §13.
