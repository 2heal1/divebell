# @divebell/extension-memory

This Divebell Extension checks whether a repeatable browser journey causes sustained growth in JavaScript memory, DOM nodes, or event listeners. It also exposes lower-level memory metrics, allocation sampling, and heap snapshots for focused investigation.

It works with regular Chrome pages and does not require Runtime SDK, a framework plugin, or build metadata.

## Install

```bash
divebell extensions add @divebell/extension-memory
```

## Run a complete check

Create a scenario module with a `run` function that performs one iteration of the target page journey, then run:

```bash
divebell memory check \
  --url http://localhost:3000/ \
  --scenario ./scripts/memory-scenario.mjs \
  --warmup 3 \
  --iterations 12 \
  --artifact-dir ./.memory-artifacts
```

The command owns the browser lifecycle, warmup, repeated operations, metrics, allocation capture, before-and-after heap snapshots, reporting, and cleanup.

It writes:

- `report.json`;
- `allocation.heapprofile`;
- `baseline.heapsnapshot`; and
- `final.heapsnapshot`.

## Focused commands

Inspect the current page after opening it with Divebell:

```bash
divebell memory metrics
divebell memory sampling start --sampling-interval 32768
# Perform the page journey.
divebell memory sampling stop /tmp/page.heapprofile --top 20
divebell memory snapshot /tmp/page.heapsnapshot --timeout 120000
divebell memory status
divebell memory cancel
```

Use a repeated `memory check` for leak decisions. A single high reading or one temporary peak is not enough evidence of sustained growth.

See the complete [English guide](../../docs/memory-analysis.md) or [中文指南](../../docs/memory-analysis.zh-CN.md).
