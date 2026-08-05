# @divebell/cli

Divebell CLI is the main entry point for coding agents using Divebell as a web development debugging tool. It preserves login state and browser sessions, operates real pages, collects debugging evidence, loads team Extensions, and reads Runtime SDK information when the application provides it.

## Install

Install the CLI globally. Divebell is a machine-level debugging tool and
should not be added to each application as a development dependency.
Divebell CLI supports Node.js 24.

```sh
npm install --global @divebell/cli
divebell setup
```

The package provides the `divebell` binary. It currently includes `@divebell/agent-browser@0.33.2-divebell.3`, a temporary Divebell build that adds the memory and code-coverage capture used by Divebell, supports portable state across explicitly included SSO origins without contacting those origins while loading state, and can run when an agent sandbox makes the normal user state directory read-only. Set `DIVEBELL_AGENT_BROWSER_EXECUTABLE` only for a custom or locally built binary. See the [temporary package note](../../docs/temporary-agent-browser-fork.md) for its replacement conditions.

Divebell keeps its bundled agent-browser daemon under `DIVEBELL_HOME/agent-browser` so another installed browser client cannot make it reuse an older background binary. When `~/.divebell` is not writable, the CLI automatically keeps its browser, session, and Extension files in a private per-user temporary directory. Set `DIVEBELL_HOME` when that data must live in a specific durable writable directory, or set `AGENT_BROWSER_HOME` to explicitly override only the browser daemon location.

`divebell setup` is a repeatable preparation command. It checks the environment and repairs browser startup only when needed. When the environment is already ready, it returns success without changing it.

Setup reports the current Node.js version, browser source, and browser-reported version, then uses a temporary headless session to verify that Divebell can start its Bridge, open a local setup page, and control the browser without changing the current project session. Divebell closes that temporary session when setup finishes and also applies a short idle timeout as a cleanup fallback.

Divebell first tries the Chrome already installed on the machine. If Chrome needs remote debugging permission, it opens `chrome://inspect/#remote-debugging`, waits for the user to enable it and approve Chrome's connection prompt, then continues automatically. Setup closes only its own temporary tab; it does not close the user's browser or the Chrome settings tab opened for consent. Divebell downloads a managed Chrome for Testing browser only when no Chrome installation is found. Chrome's security consent still requires the user to approve it.

## Real Development Debugging Flow

Reuse a prepared Chrome Profile or agent-browser state in a named debugging session:

```sh
divebell open http://localhost:19080/orders --profile "Test Account" --session orders-debug
# Or: divebell open http://localhost:19080/orders --state /path/to/test-account.json --session orders-debug
divebell stack
divebell console --level error
divebell network --url /api/orders
divebell page-snapshot
```

After the coding agent changes source code, reuse the same login state and session to rerun the real user journey and verify the matching outcome. Browser commands work without application integration.

When a page already provides Runtime SDK information, the same session can add internal evidence:

```sh
divebell snapshot --session orders-debug
divebell actions --session orders-debug
divebell wait-for --session orders-debug business:orders ready --timeout 5000
```

Runtime SDK is optional. Do not add it merely to start debugging a regular page.

## Extensions

Optional team and focused workflows install as Extension packages and appear under the same `divebell` executable:

```sh
divebell extensions add @divebell/extension-code-usage
divebell extensions add @divebell/extension-imitate
divebell extensions add @divebell/extension-memory
divebell extensions list
```

To an agent, an Extension is a CLI command. Extension authors use the exported Extension API to compose the current page, browser diagnostics, memory, coverage, and optional Runtime information. Use `extensions update <package>` or `extensions remove <package>` to manage installed packages.

## Memory Analysis

The memory Extension works without a framework or build plugin:

```sh
divebell extensions add @divebell/extension-memory
divebell memory check \
  --url http://localhost:19081/ \
  --scenario ./scripts/memory-scenario.mjs \
  --warmup 3 \
  --iterations 12
```

The scenario describes only the real page journey. The Extension owns browser lifecycle, warmup, metrics, allocation sampling, snapshots, report generation, and cleanup.

## Code-Usage Analysis

Mapping browser execution back to chunks, source files, and packages requires matching build metadata from `@divebell/modern-plugin` or `@divebell/rspack-plugin`:

```sh
divebell extensions add @divebell/extension-code-usage
divebell code-usage analyze \
  --chunk-map /path/to/deployed-build/divebell-chunks.json \
  --coverage /tmp/first-screen.coverage.json \
  --output /tmp/code-usage-report.json
```

## Documentation

- [Coding Agent Development Debugging Loop](https://github.com/2heal1/divebell/blob/main/docs/agent-devloop.md)
- [Browser Authentication and State](https://github.com/2heal1/divebell/blob/main/docs/browser-auth.md)
- [CLI Extension Development](https://github.com/2heal1/divebell/blob/main/docs/cli-extensions.md)
- [Runtime SDK API](https://github.com/2heal1/divebell/blob/main/docs/runtime-sdk-api.md)
- [Standalone Automation](https://github.com/2heal1/divebell/blob/main/docs/cli-automation-scripts.md)
- [Generated CLI Reference](https://github.com/2heal1/divebell/blob/main/docs/cli-reference.md)

Extensions execute local code. Load only trusted content. Login-state files contain sensitive information and must remain in trusted environments.
