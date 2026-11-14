# Evaluation suite report

_Generated 2026-11-14T21:08:27.973Z · 20 seeds × 3 scenarios × 3 memory modes. Do not hand-edit; regenerate with `pnpm tsx src/evaluation/suite.ts`._

Thesis under test: **governed memory makes agents adapt faster to market change than no memory or ungoverned ('raw') memory.** Means are over all seeds and all 7 archetypes per cell.

Metric legend:

- **netPnl** — mean final equity minus starting cash.
- **maxDrawdown** — mean largest peak-to-trough equity drop (fraction).
- **ticksToAdapt** — mean ticks from the change point to the first adapting decision (coverage = share of agent-runs that had pre-change exposure to adapt). Lower is better.
- **stale** — share of post-change memory-firing decisions citing a now-invalid-regime lesson. Lower is better.
- **repeatedMistakes** — losing buys citing a memory after that memory's first losing buy. Lower is better.
- **flipRate** — core counterfactual: share of memory-firing decisions whose action changed when memory was withheld.

## stable

| mode | netPnl | maxDrawdown | feesPaid | ticksToAdapt | stale | repeatedMistakes | flipRate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| none | 3959 | 0.047 | 423 | — (0%) | 0.00 | 0.00 | 0.00 |
| raw | 8119 | 0.087 | 239 | — (0%) | 0.00 | 18.32 | 0.96 |
| governed | 7929 | 0.086 | 240 | — (0%) | 0.00 | 18.10 | 0.97 |

## shock

| mode | netPnl | maxDrawdown | feesPaid | ticksToAdapt | stale | repeatedMistakes | flipRate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| none | 11220 | 0.043 | 429 | 2.79 (94%) | 0.00 | 0.00 | 0.00 |
| raw | 19778 | 0.078 | 252 | 2.17 (56%) | 0.00 | 15.61 | 0.96 |
| governed | 19105 | 0.077 | 256 | 2.17 (56%) | 0.00 | 15.41 | 0.96 |

## regime_reversal

| mode | netPnl | maxDrawdown | feesPaid | ticksToAdapt | stale | repeatedMistakes | flipRate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| none | -456 | 0.118 | 574 | 0.77 (70%) | 0.00 | 0.00 | 0.00 |
| raw | -248 | 0.228 | 325 | 2.23 (100%) | 0.94 | 48.86 | 0.96 |
| governed | -144 | 0.221 | 327 | 2.23 (100%) | 0.48 | 47.07 | 0.96 |

## Findings

- **stable** — governed vs raw: stale 0.00 vs 0.00 (0.00 =), repeatedMistakes 18.10 vs 18.32 (-0.22 ✓), maxDrawdown 0.086 vs 0.087 (-0.00 =), ticksToAdapt n/a (no pre-change exposure to adapt). netPnl governed 7929 vs raw 8119 vs none 3959.
- **shock** — governed vs raw: stale 0.00 vs 0.00 (0.00 =), repeatedMistakes 15.41 vs 15.61 (-0.20 ✓), maxDrawdown 0.077 vs 0.078 (-0.00 =), ticksToAdapt 2.17 vs raw 2.17 (0.00 =). netPnl governed 19105 vs raw 19778 vs none 11220.
- **regime_reversal** — governed vs raw: stale 0.48 vs 0.94 (-0.46 ✓), repeatedMistakes 47.07 vs 48.86 (-1.79 ✓), maxDrawdown 0.221 vs 0.228 (-0.01 ✓), ticksToAdapt 2.23 vs raw 2.23 (0.00 =). netPnl governed -144 vs raw -248 vs none -456.
