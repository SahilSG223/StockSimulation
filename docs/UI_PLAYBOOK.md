# UI Playbook (Person D / Eval + Demo)

**Audience:** whoever owns `app/`.  
**Goal:** a 3–5 minute judge walkthrough: learn → act with memory → chaos shock →
invalidate stale lesson → different decision.  
**Related tickets:** Chaos Director impl (laptop 2), Demo narrative runner
(laptop 2). This doc is the UI contract — do not wait on perfect backend polish.

## Ownership

| You own | You do not own |
| --- | --- |
| `app/` observability dashboard | Simulation truth (prices, fills, P&L) |
| Rendering `DemoFrame` (live or replay) | Inventing portfolio math |
| Demo script / screenshots / backup video | LLM chaos that mutates the market |

Dependency: `app` → evaluation frames / thin API → agents/memory → simulation.

## MVP panels (ship these three)

1. **Market strip** — tick, key prices (at least `SEMI` / `TECH`), active public
   event headline(s) from the chaos schedule.
2. **Decision panel** — `reasoning`, `strategy`, `orders` (or hold), and
   **`memoryReferences` with memory text** (“which memories fired”).
3. **Governance strip** — show a lesson go `active` → `invalidated` after the
   shock, with a one-line reason (“regime mismatch / chip ban”).

Nice-to-have if time: portfolio cash + positions, A vs C toggle (same seed).

## Data contract: `DemoFrame`

Phases (in order for the flagship demo):

`learn` → `act_with_memory` → `shock` → `govern` → `act_after_govern`

Example fixture (also checked in as `docs/examples/memory-demo.sample.json`
once the narrative ticket lands):

```json
{
  "seed": 42,
  "agentId": "demo-agent",
  "chaosPlan": [
    { "preset": "chip_export_ban", "tick": 1 }
  ],
  "frames": [
    {
      "phase": "learn",
      "tick": 0,
      "headline": "Seeded semantic lesson into memory",
      "prices": { "SEMI": 100 },
      "events": [],
      "memoriesFired": [
        {
          "id": "lesson-semi-momentum",
          "content": "In bull regimes, buy SEMI on AI demand.",
          "retrievalScore": 1,
          "status": "active"
        }
      ]
    },
    {
      "phase": "act_with_memory",
      "tick": 0,
      "headline": "Decision cites retrieved memory",
      "prices": { "SEMI": 100 },
      "events": [],
      "decision": {
        "reasoning": "Retrieved bull/SEMI lesson — buying SEMI.",
        "strategy": "momentum",
        "confidence": 0.7,
        "memoryReferences": ["lesson-semi-momentum"],
        "orders": [{ "symbol": "SEMI", "side": "buy", "quantity": 5 }]
      },
      "memoriesFired": [
        {
          "id": "lesson-semi-momentum",
          "content": "In bull regimes, buy SEMI on AI demand.",
          "retrievalScore": 0.91,
          "status": "active"
        }
      ],
      "portfolio": { "cash": 9500, "positions": [{ "symbol": "SEMI", "quantity": 5 }] }
    },
    {
      "phase": "shock",
      "tick": 1,
      "headline": "Government restricts chip exports",
      "prices": { "SEMI": 97 },
      "events": [
        {
          "id": "chip_export_ban-t1",
          "type": "chip_export_ban",
          "headline": "Government restricts chip exports"
        }
      ],
      "memoriesFired": []
    },
    {
      "phase": "govern",
      "tick": 1,
      "headline": "Invalidated stale bull/SEMI lesson after regime-mismatch shock",
      "prices": { "SEMI": 97 },
      "events": [],
      "memoriesFired": [
        {
          "id": "lesson-semi-momentum",
          "content": "In bull regimes, buy SEMI on AI demand.",
          "retrievalScore": 0,
          "status": "invalidated"
        }
      ]
    },
    {
      "phase": "act_after_govern",
      "tick": 1,
      "headline": "Post-governance decision — stale lesson must not fire",
      "prices": { "SEMI": 97 },
      "events": [],
      "decision": {
        "reasoning": "No active lessons — holding.",
        "strategy": "conservative",
        "confidence": 0.4,
        "memoryReferences": [],
        "orders": []
      },
      "memoriesFired": [],
      "portfolio": { "cash": 9500, "positions": [{ "symbol": "SEMI", "quantity": 5 }] }
    }
  ]
}
```

**Rules**

- Prefer replaying this JSON (or the runner’s output) over inventing numbers.
- Never show ground-truth `effect` fields to the “agent view” — public
  headlines only (sim already separates these).
- If backend is late: hardcode the sample JSON in the UI and swap the data
  source later. **Do not block the demo on live LLM.**

## Explicit non-goals (UI)

- Auth, multi-tenant, deploy to k8s
- Websockets / realtime infra (poll or button “next frame” is fine)
- Design-system perfection, mobile polish
- Computing P&L in the browser

## Done when

A teammate can click through (or autoplay) the five phases and a judge can
answer: “Which memory fired, what shock hit, and did governance change the
next decision?”
