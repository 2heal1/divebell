# Modern.js Basic Demo

This demo integrates a local Modern.js checkout with `@openruntime/modern-plugin` and verifies the first set of framework states from roadmap stage 3.

## Prerequisites

This demo depends on the local Modern.js repository at `/Users/bytedance/work/modern.js`. Make sure it includes the hooks required by OpenRuntime and has its dependencies installed.

Install dependencies and build from the repository root:

```bash
pnpm install
pnpm build
```

## Start

Start the Bridge in the first terminal:

```bash
pnpm exec openruntime start
```

Start the Modern.js demo in a second terminal:

```bash
pnpm --filter @openruntime/demo-modern-basic dev
```

Then open:

```txt
http://localhost:19081/
```

## Verify

Run the verification in a third terminal:

```bash
pnpm --filter @openruntime/demo-modern-basic verify
```

You can also inspect the state manually:

```bash
pnpm exec openruntime runtimes
pnpm exec openruntime targets --url http://localhost:19081/
pnpm exec openruntime snapshot --url http://localhost:19081/
pnpm exec openruntime events --url http://localhost:19081/ --limit 12
```

This demo does not enable SSR, so it does not expose a `modern:ssr` target.
CSR mode does not expose a `modern:hydration` target by default.

Visit the `Orders` page, then run:

```bash
pnpm exec openruntime snapshot
```

The result should show the current `modern:route` state.
Loaders that actually ran are included in the current matches for `modern:route` instead of being exposed as separate targets.
A route component that mounts normally does not appear in the snapshot; an error is shown only when loading fails.

Visit the `Broken` page, then run:

```bash
pnpm exec openruntime events --limit 20
```

The result should show the loader error and route error.

Visit the `Component Error` page, then run:

```bash
pnpm --filter @openruntime/demo-modern-basic verify:route-component-error
```

The result should show `modern:route` as `error`, `/component-error` as the current pathname, and `routeComponent: error` in the current match. That route-component field appears only on failure.

## Wait for a Route Change

Leave the browser on the Home page, then run:

```bash
pnpm exec openruntime wait-for modern:route ready --where pathname=/orders --timeout 30000
```

After the command starts waiting, click `Orders` on the page. The command should succeed.

## Trigger a Click with run-action

Leave the browser on the Home page and confirm that the page declares the click action:

```bash
pnpm exec openruntime actions --url http://localhost:19081/
```

The result should include `demo.click-orders`.

Run the click action:

```bash
pnpm exec openruntime run-action --url http://localhost:19081/ demo.click-orders
```

Then wait for the route to reach Orders:

```bash
pnpm exec openruntime wait-for modern:route ready --url http://localhost:19081/ --where pathname=/orders --timeout 30000
```

## Expected Results

- `runtimes` shows `http://localhost:19081/` or the currently visited child route.
- `targets` shows `modern:app` and `modern:route`.
- `actions` shows `demo.click-orders`.
- The target data for `modern:route` contains the route list.
- `snapshot` shows the current pathname and matches for `modern:route`.
- `snapshot` shows `business:ready:modern-demo`.
- On the `Orders` page, the matches for `modern:route` show loader success.
- On the `Broken` page, `modern:route` shows an error state.
- On the `Component Error` page, the current match for `modern:route` shows `routeComponent: error`.

## Build Check

```bash
pnpm --filter @openruntime/demo-modern-basic build
```

## Chunk Map Check

```bash
pnpm --filter @openruntime/demo-modern-basic verify:chunk-map
```

The check runs a real production build and confirms that every JavaScript file maps uniquely to `dist/openruntime-chunks.json` with the same file size. It also verifies that the Orders page belongs to an async chunk and maps back to `src/routes/orders/page.tsx`.

The check also verifies the names and versions of third-party dependencies such as React, React DOM, and React Router; distinguishes Modern.js and OpenRuntime workspace dependencies; and prevents generated `.modern-js` entries from being classified as third-party code.

## Memory Stability Check

Keep the demo running and execute the check in another terminal:

```bash
OPENRUNTIME_AGENT_BROWSER_EXECUTABLE=/path/to/agent-browser \
pnpm --filter @openruntime/demo-modern-basic verify:memory
```

The check warms up the page, then moves between the Home and Orders pages 12 times. Each iteration requests garbage collection and records the JavaScript heap, DOM nodes, and event listeners. It saves the report, allocation profile, and before-and-after snapshots in `.memory-artifacts/`.

`verify:memory` runs `openruntime memory check` directly. The demo only describes the journey between the Home and Orders pages in `scripts/memory-scenario.mjs`; OpenRuntime CLI manages the browser, collects memory data, calculates the result, and saves the files.

The report has two possible `verdict` values:

- `no-clear-growth`: the journey did not show clear sustained growth.
- `suspicious-growth`: growth continued after garbage collection; compare the before-and-after snapshots and top functions.

You can change the number of iterations or the output directory:

```bash
pnpm --filter @openruntime/demo-modern-basic verify:memory -- --iterations 20 --artifact-dir /tmp/modern-basic-memory
```

## Page Experience Check

See [Chunk and Code-Usage Analysis](../../docs/code-usage-analysis.md) for initial setup, the complete workflow, report interpretation, and common issues.

Run `verify:chunk-map` first to create a production build, and keep the demo server running. The check uses the browser bundled with the project by default so an external browser configuration left in the terminal does not slow startup:

```bash
pnpm --filter @openruntime/demo-modern-basic verify:experience
```

To verify a specific browser version, run `pnpm --filter @openruntime/demo-modern-basic verify:experience -- --agent-browser /path/to/agent-browser`.

By default, the first screen is recorded after `modern:route` reaches `ready`. If the application provides its own ready target, pass its target ID:

```bash
pnpm --filter @openruntime/demo-modern-basic verify:experience -- \
  --ready-target business:ready:modern-demo
```

The check cold-starts the Home and Orders pages independently. For each page, it first measures time-to-ready and JavaScript memory without recording code, then records code execution separately so coverage collection does not affect load-time measurements. The report first shows time-to-ready, memory at ready, peak memory, and stable memory, then uses chunk loading reasons and code usage to help identify problems. The complete result is stored in `.page-experience-artifacts/report.json` and can be viewed with the local server below.

Loading and memory are measured three times by default, and the report shows the median. Add `-- --runs 1` for a quick temporary check.

Start the streaming report server:

```bash
pnpm --filter @openruntime/demo-modern-basic report:serve
```

Then open `http://127.0.0.1:4173/`. The page shows the summary first, then progressively adds chunks, source files, dependencies, and code content as they arrive. Press `Ctrl+C` to stop the report server.
