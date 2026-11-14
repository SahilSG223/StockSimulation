# Evaluation suite report

_Generated 2026-11-14T20:17:42.791Z · 20 seeds × 3 scenarios × 3 memory modes. Do not hand-edit; regenerate with `pnpm tsx src/evaluation/suite.ts`._

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
| raw | 7895 | 0.087 | 239 | — (0%) | 0.00 | 18.64 | 0.97 |
| governed | 5921 | 0.081 | 246 | — (0%) | 0.00 | 17.51 | 0.97 |

## shock

| mode | netPnl | maxDrawdown | feesPaid | ticksToAdapt | stale | repeatedMistakes | flipRate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| none | 11220 | 0.043 | 429 | 2.79 (94%) | 0.00 | 0.00 | 0.00 |
| raw | 19710 | 0.078 | 252 | 2.17 (56%) | 0.00 | 15.52 | 0.96 |
| governed | 16447 | 0.073 | 257 | 1.30 (71%) | 0.00 | 14.05 | 0.96 |

## regime_reversal

| mode | netPnl | maxDrawdown | feesPaid | ticksToAdapt | stale | repeatedMistakes | flipRate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| none | -456 | 0.118 | 574 | 0.77 (70%) | 0.00 | 0.00 | 0.00 |
| raw | 334 | 0.222 | 327 | 2.23 (100%) | 0.88 | 48.53 | 0.96 |
| governed | -459 | 0.191 | 312 | 1.85 (86%) | 0.69 | 43.59 | 0.96 |

## Findings

- **stable** — governed vs raw: stale 0.00 vs 0.00 (0.00 =), repeatedMistakes 17.51 vs 18.64 (-1.13 ✓), maxDrawdown 0.081 vs 0.087 (-0.01 ✓), ticksToAdapt n/a (no pre-change exposure to adapt). netPnl governed 5921 vs raw 7895 vs none 3959.
- **shock** — governed vs raw: stale 0.00 vs 0.00 (0.00 =), repeatedMistakes 14.05 vs 15.52 (-1.47 ✓), maxDrawdown 0.073 vs 0.078 (-0.00 =), ticksToAdapt 1.30 vs raw 2.17 (-0.86 ✓). netPnl governed 16447 vs raw 19710 vs none 11220.
- **regime_reversal** — governed vs raw: stale 0.69 vs 0.88 (-0.19 ✓), repeatedMistakes 43.59 vs 48.53 (-4.94 ✓), maxDrawdown 0.191 vs 0.222 (-0.03 ✓), ticksToAdapt 1.85 vs raw 2.23 (-0.38 ✓). netPnl governed -459 vs raw 334 vs none -456.
