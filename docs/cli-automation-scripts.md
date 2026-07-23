# Automating with OpenRuntime CLI

Chinese version: [使用 OpenRuntime CLI 编写自动化脚本](cli-automation-scripts.zh-CN.md)

This guide is for standalone automation scripts: a script opens the page, waits for it, runs page operations, reads Runtime information, and optionally stops the browser and Bridge managed by the CLI. Unlike page Commands in [OpenRuntime CLI Extension Development](cli-extensions.md), automation scripts can manage the browser lifecycle.

## When To Use

OpenRuntime CLI automation scripts are useful when a complete page workflow should become a repeatable local script, CI script, or agent tool script.

Typical use cases:

- Reuse a test account through an agent-browser Profile, state file, or auth entry while running a protected flow in the same session.
- Open a local or remote page and wait until it is usable.
- Run browser checks such as click, fill, screenshot, Console, or Network inspection.
- Read structured state or run business actions from a page that exposes OpenRuntime Targets or Actions.
- Run stable page validation in CI or local tasks.
- Compose multiple OpenRuntime CLI commands into a higher-level automation entrypoint.

If the page already exposes stable Targets or Actions relevant to the task, a script may use `snapshot`, `run-action`, `wait-for`, or `verify` for an existing business Target. A regular page can use an explicit page, request, or Extension result without adding Runtime Core first.

When a script specifically needs to verify an existing business Target, install the Extension that provides `verify`:

```sh
openruntime extensions add @openruntime/extension-troubleshooting
```

## Why Use OpenRuntime For Scripts

The main benefits are stability and offline reuse.

- Stable: the workflow is split into explicit steps, each with a command, wait condition, and exit code.
- Repeatable: the same workflow can run locally, in CI, or in an agent environment.
- Offline-friendly: once the flow is captured as a local script, the agent does not need to plan the page operation again every time.
- Observable: the script can print JSON and keep screenshots, Console logs, or Network data on failure.
- More reliable: once the page exposes Runtime data, the script can validate business state through Targets and Actions instead of relying only on DOM guesses.

## From Fixed Flow To Script

Start by breaking the manual workflow into OpenRuntime CLI steps:

1. Confirm inputs: page URL, session, timeout.
2. Open the page: `openruntime open <url>`.
3. Wait for the page to become stable: `wait-eval` or `wait-for`.
4. Run operations: `click`, `fill`, `eval`, or `run-action`.
5. Validate the result with a matching Extension, Runtime state, page result, or request outcome.
6. Print one final JSON object.

Every step should have a clear success condition. Do not click immediately after opening a page; wait until the page or business state is ready.

## Install And Run

Shell scripts only need `openruntime` to be available in the current environment:

```sh
openruntime --help
```

Node.js scripts need to resolve `@openruntime/cli`:

```js
import { runCli } from "@openruntime/cli";
```

Scripts can live in the project `scripts/` directory:

```text
scripts/check-home.sh
scripts/check-home.mjs
scripts/release-latest.mjs
```

Run examples:

```sh
bash scripts/check-home.sh http://localhost:3000
node scripts/check-home.mjs http://localhost:3000
```

## Dependency Handling

For scripts that run inside the current project, add `@openruntime/cli` to the project dependencies so the script and project use the same version:

```sh
pnpm add -D @openruntime/cli
```

If a script only calls the `openruntime` binary from Shell, it can rely on a global install or a CI-provided CLI, but check that it is available before running:

```sh
openruntime --help
```

OpenRuntime CLI browser features depend on a Playwright runtime environment. CI and clean machines need browser dependencies prepared ahead of time. Whether to package Playwright and browsers depends on how the script is distributed:

- Project script: keep `@openruntime/cli` in project dependencies and install browser dependencies in CI.
- Local tool script: require users to install the CLI and browser runtime environment first.
- Standalone distribution: provide an install script or setup documentation; do not assume browser dependencies already exist.

## Script File Structure

A Shell script usually contains:

- Input parsing.
- `openruntime open <url>`.
- Wait and page operations.
- Runtime queries or browser checks.
- One final output object.
- Optional `openruntime stop`.

A Node.js script should usually wrap `runCli(args, options)` in a small `opr(args)` helper that captures stdout, stderr, and the exit code:

```js
import { runCli } from "@openruntime/cli";

async function opr(args) {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(args, {
    stdout: {
      write(chunk) {
        stdout += chunk;
      }
    },
    stderr: {
      write(chunk) {
        stderr += chunk;
      }
    }
  });

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `openruntime ${args.join(" ")} failed`);
  }

  return stdout.trim();
}
```

## Script Steps

See the full command list and parameters in [CLI Reference](cli-reference.md). For automatic Bridge connections and Runtime selection, see [Browser Connections and Multiple Runtimes](runtime-connections.md). This guide only shows the common steps used to turn a fixed flow into a script.

### Prepare Inputs

Automation scripts usually work with these inputs:

| Input | Purpose |
| --- | --- |
| `url` | Page URL to open. |
| `session` | Session id for this script; recommended for concurrent scripts and Runtime queries. |
| `timeout` | Timeout for page or Runtime waits. |
| `headless/ui` | The browser runs quietly by default; pass `--ui` to `open` for a visible browser. |
| `bridge` | Each `open` gets its own automatically assigned local Bridge port. The current directory remembers it for later commands. Pass `--bridge <url>` for a specific Bridge or `--no-bridge` to disable injection. |

### Open The Page

Basic form:

```sh
openruntime open http://localhost:3000
```

With session:

```sh
openruntime open http://localhost:3000 --session check-home
```

Visible browser:

```sh
openruntime open http://localhost:3000 --ui
```

On success, `open` prints unified JSON. `data` contains:

| Field | Meaning |
| --- | --- |
| `url` | Original URL passed to `open`. |
| `openedUrl` | Actual opened URL, possibly with an OpenRuntime session parameter. |
| `normalizedUrl` | Normalized URL used to match the current page. |
| `bridgeUrl` | Bridge URL used by this open command; `null` with `--no-bridge`. |
| `bridgePort` | Port assigned to this open command; `null` with `--no-bridge`. |
| `sessionId` | Session used by this open command. |
| `openedAt` | Open timestamp. |

### Wait And Operate On The Page

Wait for the page to finish basic loading:

```sh
openruntime wait-eval "document.readyState === 'complete'" --timeout 10000
```

Wait for specific visible text:

```sh
openruntime wait-eval "document.body.innerText.includes('Ready')" --timeout 10000
```

Screenshot:

```sh
openruntime screenshot home-ready
```

Read page interactables:

```sh
openruntime page-snapshot
```

Click and fill:

```sh
openruntime click "Submit"
openruntime fill "#email" "dev@example.com"
```

### Optional Runtime Queries and Actions

The commands below apply only when the page uses Runtime Core and the signals are relevant to the task. A regular page can skip this section and verify through browser or Extension evidence.

Read the current page snapshot:

```sh
openruntime snapshot --session check-home
```

Wait for a business Target:

```sh
openruntime wait-for business:home ready --session check-home --timeout 10000
```

Run a business Action:

```sh
openruntime run-action release-note.list-latest --session check-home --payload '{"limit":3}'
```

When the page already has a business Target and the troubleshooting Extension is installed:

```sh
openruntime verify business:home ready --session check-home --timeout 10000
```

### Output And Errors

A script may call multiple `openruntime` commands internally, but the final script output should usually be one JSON object.

Success example:

```json
{
  "status": "ok",
  "url": "http://localhost:3000",
  "session": "check-home",
  "ready": true
}
```

On failure, return a non-zero exit code and write the error to stderr. Shell scripts can use `set -euo pipefail`; Node.js scripts can check `exitCode` in the helper.

## Node.js API

Node.js scripts use `runCli(args, options)` from `@openruntime/cli`. It uses the same arguments as the CLI, but avoids spawning a subprocess and lets the script capture output directly.

```js
import { runCli } from "@openruntime/cli";

const exitCode = await runCli(["open", "http://localhost:3000"]);
```

Recommended helper:

```js
import { runCli } from "@openruntime/cli";

async function opr(args) {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(args, {
    stdout: {
      write(chunk) {
        stdout += chunk;
      }
    },
    stderr: {
      write(chunk) {
        stderr += chunk;
      }
    }
  });

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `openruntime ${args.join(" ")} failed`);
  }

  return stdout.trim();
}

const opened = JSON.parse(await opr(["open", "http://localhost:3000"]));
```

`args` matches CLI arguments:

```js
await opr(["open", url, "--session", session]);
await opr(["wait-eval", "document.readyState === 'complete'", "--timeout", "10000"]);
await opr(["snapshot", "--session", session]);
await opr(["run-action", "release-note.list-latest", "--payload", "{\"limit\":3}"]);
```

There is no separate `open()` function today. Use `runCli(["open", url])` to open a page from Node.js scripts.

## Complete Example: Open, Wait, Screenshot

Create `scripts/check-home.mjs`:

```js
import { runCli } from "@openruntime/cli";

async function opr(args) {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(args, {
    stdout: {
      write(chunk) {
        stdout += chunk;
      }
    },
    stderr: {
      write(chunk) {
        stderr += chunk;
      }
    }
  });

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `openruntime ${args.join(" ")} failed`);
  }

  return stdout.trim();
}

async function main() {
  const url = process.argv[2] ?? "http://localhost:3000";
  const session = `check-home-${Date.now()}`;

  const opened = JSON.parse(await opr(["open", url, "--session", session]));
  const ready = JSON.parse(await opr([
    "wait-eval",
    "document.readyState === 'complete'",
    "--timeout",
    "10000"
  ]));

  await opr(["screenshot", "home-ready"]);

  let targetCount = null;
  try {
    const snapshot = JSON.parse(await opr(["snapshot", "--session", session]));
    targetCount = Object.keys(snapshot.result?.targets ?? {}).length;
  } catch {
    targetCount = null;
  }

  console.log(JSON.stringify({
    status: "ok",
    url: opened.data.url,
    session: opened.data.sessionId,
    ready: ready.success === true,
    targetCount
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
```

Run:

```sh
node scripts/check-home.mjs http://localhost:3000
```

Example output:

```json
{
  "status": "ok",
  "url": "http://localhost:3000",
  "session": "check-home-1760000000000",
  "ready": true,
  "targetCount": 4
}
```

If the page does not expose OpenRuntime Runtime data, `targetCount` is `null`, and the browser-level checks can still work.

## Shell / CI Minimal Form

For a simple CI or local check, a Shell script can just chain a few `openruntime` commands. This script opens the page, waits for basic loading, captures a screenshot, and prints final JSON.

Create `scripts/check-home.sh`:

```sh
#!/usr/bin/env bash
set -euo pipefail

URL="${1:-http://localhost:3000}"
SESSION="check-home-$(date +%s)"

openruntime open "$URL" --session "$SESSION"
openruntime wait-eval "document.readyState === 'complete'" --timeout 10000
openruntime screenshot home-ready

printf '{"status":"ok","url":"%s","session":"%s"}\n' "$URL" "$SESSION"
```

Run:

```sh
bash scripts/check-home.sh http://localhost:3000
```

For more complex flows, use the Node.js form above. Shell is better for small linear checks.
