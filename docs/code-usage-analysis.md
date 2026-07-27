# Chunk and Code-Usage Analysis

Chinese version: [分块与代码使用分析](code-usage-analysis.zh-CN.md)

This optional analysis maps code recorded in the browser back to build chunks, application files, workspace packages, and third-party dependencies. It helps identify code that may be loaded too early or split more effectively.

## What the report shows

After installing `@openruntime/extension-code-usage`, you can generate a code-usage report that
compares mapped size with actual execution across application code, third-party dependencies,
files, and chunks. In Figure 1, the selected dependency is 62.0 KB but only 2.6% executed in the
current phase, making it a useful candidate for closer inspection.

![Figure 1: Mapped size and actual execution for dependencies](https://github.com/user-attachments/assets/a706172c-c348-431b-a911-c0ea5f4d0b88)

Open a file from the report to see which code actually executed in the selected phase, as shown in
Figure 2. Blue marks executed ranges; unhighlighted code did not execute.

![Figure 2: Code executed in the selected phase](https://github.com/user-attachments/assets/d9d9feea-a00c-48fe-a73a-304e41db5ebf)

## How to use it

Basic memory checks do not need this setup. See the [Memory Analysis Guide](memory-analysis.md) when the question is whether a page journey causes sustained memory growth.

Install the analysis command:

```bash
openruntime extensions add @openruntime/extension-code-usage
```

## How it works

```text
Build plugin creates a Chunk Map and source maps
                    ↓
OpenRuntime records code executed by the target page
                    ↓
The analysis combines both sets of evidence
                    ↓
OpenRuntime creates JSON and an interactive report
```

Build metadata, JavaScript files, source maps, and the deployed page must come from the same build. OpenRuntime stops attribution when it cannot identify one exact build file instead of guessing from a filename.

## 1. Add a build plugin

### Modern.js

Install `@openruntime/modern-plugin`, then add:

```ts
import { appTools, defineConfig } from '@modern-js/app-tools';
import { openRuntimeChunkMapPlugin } from '@openruntime/modern-plugin/chunk-map';

export default defineConfig({
  plugins: [appTools(), openRuntimeChunkMapPlugin()],
});
```

### Rspack

Install `@openruntime/rspack-plugin`, then add:

```ts
import { OpenRuntimeChunkMapRspackPlugin } from '@openruntime/rspack-plugin';

export default {
  plugins: [new OpenRuntimeChunkMapRspackPlugin()],
};
```

Both plugins write `openruntime-chunks.json`. Keep the matching JavaScript files and `.js.map` files so the analysis can map built code back to source files and packages.

Use `filename` to place the Chunk Map elsewhere:

```ts
openRuntimeChunkMapPlugin({ filename: 'meta/chunks.json' })
```

The Rspack plugin supports the same option.

## 2. Record representative page journeys

Open the page and start precise code coverage:

```bash
openruntime open https://example.com/
openruntime coverage start
```

After the initial page becomes ready, save the first phase:

```bash
openruntime coverage take /tmp/first-screen.coverage.json \
  --label first-screen
```

Continue with `click`, `fill`, `goto`, or a page-declared action, then save the next phase and stop:

```bash
openruntime coverage stop /tmp/orders.coverage.json \
  --label orders
```

Each `take` resets execution counts, so every phase describes only the work performed since the previous capture.

## 3. Analyze the recording

```bash
openruntime code-usage analyze \
  --chunk-map /path/to/production-dist/openruntime-chunks.json \
  --coverage /tmp/first-screen.coverage.json \
  --coverage /tmp/orders.coverage.json \
  --output /tmp/code-usage-report.json
```

By default, JavaScript and source maps are read beside the Chunk Map. If they are stored elsewhere, pass the build output explicitly:

```bash
openruntime code-usage analyze \
  --chunk-map /path/to/metadata/openruntime-chunks.json \
  --assets /path/to/production-dist \
  --coverage /tmp/first-screen.coverage.json \
  --output /tmp/code-usage-report.json
```

`--chunk-map` and `--assets` also accept HTTP or HTTPS URLs. This is useful for
a public deployment that keeps its Chunk Map, JavaScript, and source maps
together:

```bash
openruntime code-usage analyze \
  --chunk-map https://example.com/app/openruntime-chunks.json \
  --coverage /tmp/first-screen.coverage.json \
  --coverage /tmp/orders.coverage.json \
  --output /tmp/code-usage-report.json
```

When the Chunk Map is remote and `--assets` is omitted, its URL directory is
used as the asset base. Only analyze trusted deployments: the command downloads
the referenced build files, and every file must still come from the exact build
used by the recorded page.

Repeat `--coverage` in the order the phases should appear in the report.

## 4. Open the report

```bash
openruntime code-usage report /tmp/code-usage-report.json
```

The command creates an HTML report and opens it. Use `--no-open` to create files only or `--output <report.html>` to choose the location.

For large reports, start the local streaming viewer:

```bash
openruntime code-usage serve /tmp/code-usage-report.json --port 4173
```

Keep the generated HTML and its neighboring `-code` directory together when moving or sharing a report.

## Read the result

The report presents each phase by application source, dependency, complete file list, and chunk. A useful review order is:

1. inspect large application files with low use on the first screen;
2. inspect large third-party and workspace packages;
3. confirm which chunks contain those files;
4. record other important user journeys before deciding that code is unused;
5. change lazy loading or chunking; and
6. rebuild and repeat the same measurements.

“Unused” means that code did not execute in the explicitly recorded journeys. It does not prove that the code can be deleted. The reported sizes describe source-mapped bytes in built JavaScript, not compressed download size or original source-file size.

Code coverage changes JavaScript-engine behavior. Measure loading speed and memory separately with coverage disabled before accepting an optimization.

## Repository example

Build and serve the production demo:

```bash
pnpm --filter @openruntime/demo-modern-basic verify:chunk-map
pnpm --filter @openruntime/demo-modern-basic serve
```

In another terminal, run the complete experience check and report server:

```bash
pnpm --filter @openruntime/demo-modern-basic verify:experience
pnpm --filter @openruntime/demo-modern-basic report:serve
```

The report is available at `http://127.0.0.1:4173/`. Use the same build output for the page, Chunk Map, JavaScript files, and source maps.
