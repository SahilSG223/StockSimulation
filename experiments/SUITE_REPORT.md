# Experiment suite report

- Runs: **360** (40 seeds × 3 scenarios × 3 heuristics)
- Duration: **139ms**
- Determinism spot-check: **PASS**
- Isolation breaches: **0**

## Strategy × scenario

| Scenario | Heuristic | Mean equity | Mean DD | Mean fills | Mean experiences |
|---|---|---:|---:|---:|---:|
| stable | momentum | 106484.81 | 7.84% | 50.9 | 51.5 |
| stable | contrarian | 103967.70 | 7.37% | 65.9 | 68.2 |
| stable | conservative | 104846.45 | 6.34% | 65.5 | 65.5 |
| shock | momentum | 116516.04 | 7.17% | 48.7 | 49.1 |
| shock | contrarian | 111860.52 | 6.53% | 65.8 | 68.5 |
| shock | conservative | 112278.65 | 6.30% | 66.6 | 66.6 |
| regime_reversal | momentum | 99996.76 | 21.90% | 54.4 | 55.0 |
| regime_reversal | contrarian | 98173.57 | 21.83% | 68.5 | 70.8 |
| regime_reversal | conservative | 99298.72 | 19.76% | 79.0 | 79.0 |

## Ranking hyperparameter sweep

- Grid size: **192** (160 perfect)
- Best: λ=0.005, contextual=0.5, temporal=2, reliability=0.5
