# Run the Official OpenRuntime Quick Start

Use this workflow when the user wants a first experience and has not provided
another page. The hosted Northstar Supply application is already deployed with
Runtime Core and build metadata. Treat it like an unfamiliar real application:
the page does not expose the walkthrough or debugging answers. Do not clone the
OpenRuntime repository and do not modify source.

Application:

```text
https://2heal1.github.io/openruntime/quickstart/
```

## 1. Resolve the CLI

Use the globally installed CLI:

```bash
openruntime --help
```

If the command is unavailable, stop and ask the user to install it globally:

```bash
npm install --global @openruntime/cli
openruntime check --fix
```

Do not install `@openruntime/cli` in the user's application.

Read scoped help before using commands whose arguments are not confirmed.

## 2. Open and operate the page

Open the application visibly unless the user requested a headless run:

```bash
openruntime open https://2heal1.github.io/openruntime/quickstart/ --ui
openruntime page-snapshot
```

Keep the `openedUrl` and connected Runtime ID from the command results. Later
stages use them to reload the same managed page and select the correct Runtime.

Use actionable references from the page snapshot to search or filter orders and
select a different order. Read another page snapshot to verify the visible
result. This stage demonstrates ordinary Browser API capability and does not
depend on Runtime Core.

## 3. Reproduce and explain the controlled failure

Inspect `actions`, then run the page-declared failure:

```bash
openruntime actions
openruntime run-action quickstart.trigger-inventory-failure
openruntime wait-for request:inventory error
openruntime network --url inventory-missing
openruntime console --level error --query "Inventory request failed"
openruntime snapshot --id request:inventory
openruntime snapshot --id business:fulfillment
```

Report the combined evidence:

- Network contains a real 404 for `inventory-missing.json`.
- Console records the controlled request failure.
- Runtime Core says fulfillment is `blocked` and depends on
  `request:inventory`.

Browser evidence proves what the browser observed. Runtime Core provides the
stable application meaning. Keep those roles distinct.

## 4. Recover through a declared action

Inspect the action choices before changing state:

```bash
openruntime input-options --action quickstart.retry-inventory --input strategy
openruntime run-action quickstart.retry-inventory --payload '{"strategy":"origin"}'
```

Read `nextAttempt` from the action result, then wait for
`business:fulfillment` to become `ready` with that attempt:

```bash
openruntime wait-for business:fulfillment ready --where attempt=<nextAttempt> --timeout 10000
```

Confirm the final page and Network result. Do not treat successful action
dispatch as successful recovery; the final target state is the verification.

## 5. Optional advanced code-usage stage

Use this stage when the user asks for the complete or advanced Quick Start.
Confirm `code-usage` through help; install the official Extension if missing:

```bash
openruntime extensions add @openruntime/extension-code-usage
openruntime code-usage --help
```

Record the initial view and the on-demand Insights view as separate phases:

```bash
openruntime coverage start
openruntime goto <openedUrl-from-open>
openruntime wait-for --runtime runtime-openruntime-quickstart app:openruntime-quickstart ready --timeout 10000
openruntime coverage take /tmp/openruntime-quickstart-initial.coverage.json --label initial
openruntime run-action --runtime runtime-openruntime-quickstart quickstart.open-insights
openruntime wait-for --runtime runtime-openruntime-quickstart analysis:code-usage ready --timeout 10000
openruntime coverage stop /tmp/openruntime-quickstart-insights.coverage.json --label insights
node <skill-dir>/scripts/download-quickstart-build.mjs \
  --output /tmp/openruntime-quickstart-build
openruntime code-usage analyze \
  --chunk-map /tmp/openruntime-quickstart-build/openruntime-chunks.json \
  --assets /tmp/openruntime-quickstart-build \
  --coverage /tmp/openruntime-quickstart-initial.coverage.json \
  --coverage /tmp/openruntime-quickstart-insights.coverage.json \
  --output /tmp/openruntime-quickstart-code-usage.json
openruntime code-usage report /tmp/openruntime-quickstart-code-usage.json
```

The deployed Chunk Map, JavaScript, and source maps come from the same build.
Source maps alone are insufficient: coverage records what ran, while the Chunk
Map and exact build assets attribute those bytes to chunks and source owners.
The bundled download script retrieves only those public build files; it does
not clone the repository or require an application source checkout.

## 6. Optional memory stage

Use this stage only when the user asks for memory analysis. Confirm `memory`
through help; install the official Extension if missing, then use the scenario
bundled with this skill:

```bash
openruntime extensions add @openruntime/extension-memory
openruntime stop
openruntime memory check \
  --url https://2heal1.github.io/openruntime/quickstart/#memory \
  --scenario <skill-dir>/scripts/quickstart-memory-scenario.mjs \
  --warmup 2 \
  --iterations 8 \
  --artifact-dir /tmp/openruntime-quickstart-memory
```

Report the measured trend and verdict. The Activity page presents a normal
archive feed while the scenario intentionally retains earlier pages behind the
interface; only the Extension output is browser memory evidence. `memory check`
owns and closes its browser page, so stop any page left by the earlier workflow
before starting it.

## 7. Finish

Stop the page after all requested stages are complete:

```bash
openruntime stop
```

Summarize the visible operation, browser evidence, Runtime Core explanation,
verified recovery, and any optional analysis. Do not imply that this playground
modified application source; source editing belongs to a later workflow in the
user's own repository.
