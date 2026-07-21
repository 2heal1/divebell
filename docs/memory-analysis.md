# Memory Analysis Guide

Chinese version: [内存分析指南](memory-analysis.zh-CN.md)

Memory analysis is provided by an optional Extension package. It works with any Chrome page that OpenRuntime can open and does not require Modern.js, Rspack, Runtime Core, or build metadata.

Install it once:

```bash
openruntime extensions add @openruntime/extension-memory
```

## Recommended: run a complete check

Create a small scenario that describes the page journey to repeat:

```js
export default {
  async setup({ page }) {
    await page.waitEval('document.querySelector(\'a[href="/orders"]\') !== null');
  },

  async run({ page }) {
    await page.eval('document.querySelector(\'a[href="/orders"]\').click()');
    await page.waitEval('window.location.pathname === "/orders"');
    await page.eval('document.querySelector(\'a[href="/"]\').click()');
    await page.waitEval('window.location.pathname === "/"');
  },
};
```

Save it as `scripts/memory-scenario.mjs`, then run:

```bash
openruntime memory check \
  --url http://localhost:19081/ \
  --scenario ./scripts/memory-scenario.mjs \
  --warmup 3 \
  --iterations 12 \
  --artifact-dir ./.memory-artifacts
```

The Extension opens the page, warms it up, records baseline metrics, repeats the scenario, captures allocation data and before-and-after heap snapshots, reports the result, and closes the page.

The output directory contains:

- `report.json`: trends, the result, and top allocation functions;
- `allocation.heapprofile`: allocations recorded during the repeated journey;
- `baseline.heapsnapshot`: the heap before measured iterations; and
- `final.heapsnapshot`: the heap after measured iterations.

## Inspect the current page

```bash
openruntime open https://example.com/
openruntime memory metrics
```

`metrics` requests garbage collection first, then reports JavaScript heap use, document count, DOM-node count, and listener count. Use `--no-gc` only when an advanced investigation needs the temporary pre-collection value.

## Record allocations

```bash
openruntime memory sampling start --sampling-interval 32768
# Perform the page journey with OpenRuntime commands.
openruntime memory sampling stop /tmp/page.heapprofile --top 20
```

The result includes the functions responsible for the most allocations and saves the complete profile for deeper inspection.

## Save a heap snapshot

```bash
openruntime memory snapshot /tmp/page.heapsnapshot --timeout 120000
```

The snapshot can be used to inspect retained objects and reference paths. It requests garbage collection first unless `--no-gc` is provided.

## Judge sustained growth

One larger reading does not prove a leak. A reliable check:

1. warms up the page journey;
2. collects a baseline after garbage collection;
3. repeats the same journey several times;
4. collects metrics after every iteration;
5. saves final allocation and heap evidence; and
6. compares JavaScript memory, DOM nodes, and listeners as trends rather than one-time peaks.

Use [Chunk and Code-Usage Analysis](code-usage-analysis.md) only when the next question is which loaded chunks, application files, or dependencies actually ran. Basic memory analysis does not need a build plugin or Chunk Map.
