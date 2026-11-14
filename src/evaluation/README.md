# Evaluation / demo narrative

`runMemoryDemo({ seed, scenarioId })` (`run-memory-demo.ts`) runs the 5-phase
judge narrative — learn → act_with_memory → shock → govern → act_after_govern —
against an in-memory `MemoryIndex` + `FakeEmbedder` (no live OpenAI/Mongo
required). Output matches `demoResultSchema` (`demo-frame.ts`), the same shape
as [`docs/examples/memory-demo.sample.json`](../../docs/examples/memory-demo.sample.json).

See [`docs/UI_PLAYBOOK.md`](../../docs/UI_PLAYBOOK.md) for the UI contract.

Do not invent P&L in the browser.
