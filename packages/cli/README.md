# @openruntime/cli

OpenRuntime CLI is the main entry point for coding agents using OpenRuntime as a web development debugging tool. It preserves login state and browser sessions, operates real pages, collects debugging evidence, loads team Extensions, and reads Runtime Core information when the application provides it.

## Install

```sh
pnpm add -D @openruntime/cli
pnpm dlx @openruntime/agent-browser@0.32.0-openruntime.1 install
```

The package provides both `openruntime` and `opr` binaries. It currently includes `@openruntime/agent-browser@0.32.0-openruntime.1`, which adds the memory and code-coverage capture used by OpenRuntime. Set `OPENRUNTIME_AGENT_BROWSER_EXECUTABLE` only for a custom or locally built binary. See the [temporary package note](../../docs/temporary-agent-browser-fork.md) for its replacement conditions.

## Real Development Debugging Flow

Import a prepared test account once, then reuse it in a named debugging session:

```sh
openruntime auth import /path/to/test-account.oprprofile
openruntime open http://localhost:19080/orders --session orders-debug
openruntime stack
openruntime console --level error
openruntime network --url /api/orders
openruntime page-snapshot
```

After the coding agent changes source code, reuse the same login state and session to rerun the real user journey and verify the matching outcome. Browser commands work without application integration.

When a page already provides Runtime Core information, the same session can add internal evidence:

```sh
openruntime snapshot --session orders-debug
openruntime actions --session orders-debug
openruntime wait-for --session orders-debug business:orders ready --timeout 5000
```

Runtime Core is optional. Do not add it merely to start debugging a regular page.

## Extensions

Optional team and focused workflows install as Extension packages and appear under the same `openruntime` executable:

```sh
openruntime extensions add @openruntime/extension-code-usage
openruntime extensions add @openruntime/extension-troubleshooting
openruntime extensions add @openruntime/extension-imitate
openruntime extensions add @openruntime/extension-memory
openruntime extensions list
```

To an agent, an Extension is a CLI command. Extension authors use the exported Extension API to compose the current page, browser diagnostics, memory, coverage, and optional Runtime information. Use `extensions update <package>` or `extensions remove <package>` to manage installed packages.

## Memory Analysis

The memory Extension works without a framework or build plugin:

```sh
openruntime extensions add @openruntime/extension-memory
openruntime memory check \
  --url http://localhost:19081/ \
  --scenario ./scripts/memory-scenario.mjs \
  --warmup 3 \
  --iterations 12
```

The scenario describes only the real page journey. The Extension owns browser lifecycle, warmup, metrics, allocation sampling, snapshots, report generation, and cleanup.

## Code-Usage Analysis

Mapping browser execution back to chunks, source files, and packages requires matching build metadata from `@openruntime/modern-plugin` or `@openruntime/rspack-plugin`:

```sh
openruntime extensions add @openruntime/extension-code-usage
openruntime code-usage analyze \
  --chunk-map /path/to/deployed-build/openruntime-chunks.json \
  --coverage /tmp/first-screen.coverage.json \
  --output /tmp/code-usage-report.json
```

## Documentation

- [Coding Agent Development Debugging Loop](https://github.com/2heal1/openruntime/blob/main/docs/agent-devloop.md)
- [Browser Auth Profiles](https://github.com/2heal1/openruntime/blob/main/docs/auth-profiles.md)
- [CLI Extension Development](https://github.com/2heal1/openruntime/blob/main/docs/cli-extensions.md)
- [Runtime Core API](https://github.com/2heal1/openruntime/blob/main/docs/runtime-core-api.md)
- [Standalone Automation](https://github.com/2heal1/openruntime/blob/main/docs/cli-automation-scripts.md)
- [Generated CLI Reference](https://github.com/2heal1/openruntime/blob/main/docs/cli-reference.md)

Extensions execute local code. Load only trusted content. Login-state files contain sensitive information and must remain in trusted environments.
