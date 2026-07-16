# @openruntime/cli

OpenRuntime CLI is the direct entry point for coding agents. It opens pages, manages the local Bridge and browser, reuses imported login state, reads structured application state, runs declared actions, and waits for business verification.

## Install

```sh
pnpm add -D @openruntime/cli
npm install -g agent-browser
agent-browser install
```

The package provides both `openruntime` and `opr` binaries. All browser operations use `agent-browser`; set `OPENRUNTIME_AGENT_BROWSER_EXECUTABLE` only when using a custom or locally built binary.

## Minimal Development Loop

```sh
openruntime open http://localhost:19080/ --session orders-demo
openruntime snapshot --session orders-demo --id business:orders
openruntime run-action --session orders-demo \
  demo.refresh-orders --payload '{"amount":2,"source":"cli"}'
openruntime verify --session orders-demo \
  business:orders ready --where updatedBy=cli --timeout 5000
```

The browser commands also work with pages that do not integrate OpenRuntime. Structured Targets, Snapshots, Events, Actions, and business verification require an application-side integration through `@openruntime/core` or a framework plugin.

## Memory analysis

Basic memory analysis is built into the CLI and does not require a framework or
build plugin:

```sh
openruntime memory check \
  --url http://localhost:19081/ \
  --scenario ./scripts/memory-scenario.mjs \
  --warmup 3 \
  --iterations 12
```

The scenario only describes the page actions. The CLI owns browser lifecycle,
warmup, metrics, allocation sampling, snapshots, report generation, and cleanup.
Lower-level commands remain available for interactive diagnostics:

```sh
openruntime memory metrics
openruntime memory sampling start
openruntime memory sampling stop /tmp/page.heapprofile --top 20
openruntime memory snapshot /tmp/page.heapsnapshot
```

`memory metrics` automatically clears temporary garbage before reading the
numbers. Use `--no-gc` only when the pre-cleanup instantaneous value is needed.

## Optional chunk analysis

Deeper chunk, source file, and package usage analysis requires build metadata
from `@openruntime/modern-plugin` or `@openruntime/rspack-plugin`. The CLI accepts
the exact local artifact path, including when the recorded page is deployed:

```sh
openruntime code-usage analyze \
  --chunk-map /path/to/deployed-build/openruntime-chunks.json \
  --coverage /tmp/first-screen.coverage.json \
  --output /tmp/code-usage-report.json
```

## Documentation

- [Coding-Agent Development Loop](https://github.com/2heal1/openruntime/blob/main/docs/agent-devloop.md)
- [Browser Auth Profiles](https://github.com/2heal1/openruntime/blob/main/docs/auth-profiles.md)
- [CLI Command Development](https://github.com/2heal1/openruntime/blob/main/docs/cli-extensions.md)
- [Standalone Automation](https://github.com/2heal1/openruntime/blob/main/docs/cli-automation-scripts.md)
- [Generated CLI Reference](https://github.com/2heal1/openruntime/blob/main/docs/cli-reference.md)

External commands execute local code. Load only command files you trust. Auth profile files contain sensitive information and should stay in trusted environments.
