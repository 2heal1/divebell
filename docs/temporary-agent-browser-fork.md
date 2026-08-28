# Temporary agent-browser Build Used by Divebell

## Current status

Divebell CLI pins an exact `@divebell/agent-browser` version in
[`packages/cli/package.json`](../packages/cli/package.json). Treat that
dependency and the lockfile as the source of truth for the current version.

This package comes from the maintained Divebell release branch of the agent-browser fork. It adds the memory diagnostics and code-coverage capture required by Divebell. It also keeps agent-browser-owned state in a writable temporary directory when the normal user state directory is unavailable, discovers Puppeteer's headless browser when full Chrome is unavailable, and preserves an active browser across repeated commands. Version `0.33.2-divebell.2` preserves browser cookie source and partition metadata and lets a state export collect web storage from explicitly included SSO origins. Version `0.33.2-divebell.3` restores that storage through intercepted blank responses, so loading a state file does not contact its saved origins or let an authentication flow invalidate restored cookies before the requested page opens. Version `0.33.2-divebell.4` supports Node.js 20.19 or newer for package installation and its JavaScript wrapper. Version `0.33.2-divebell.5` adds independent initial, periodic, and close-time Restore State save stages that can be changed on an existing daemon. Version `0.33.2-divebell.6` adds a compiled-JavaScript debugger control plane with runtime-scoped script identity, non-pausing logpoints, bounded event history, gap reporting, and concurrent pause recovery. Version `0.33.2-divebell.7` adds per-navigation lifecycle timeouts, defaults navigation to 60 seconds, and gives command transport enough response margin to report the navigation result. Version `0.33.2-divebell.8` makes partial follow-up launch envelopes inherit omitted options from the active browser configuration, so CLI and Extension commands keep operating on the page opened by the caller instead of relaunching at `about:blank`. Version `0.34.0-divebell.1` updates the fork to upstream agent-browser 0.34.0 while retaining these Divebell-specific behaviors. Version `0.34.0-divebell.2` makes cross-origin state export wait for its temporary target to be fully destroyed, bounds collection work, and avoids retrying an in-flight save after a client response timeout. Version `0.34.0-divebell.4` adds WebMCP tool discovery and invocation through Chrome CDP, with CLI and MCP command parity. The package also ships its platform binaries directly and no longer runs an npm lifecycle installation script.

Divebell uses the executable included with the CLI unless `DIVEBELL_AGENT_BROWSER_EXECUTABLE` points to a custom build. By default, Divebell keeps the browser daemon and its state under `DIVEBELL_HOME/agent-browser`. This prevents another installed agent-browser client from leaving Divebell connected to an older background binary. Set `AGENT_BROWSER_HOME` only when the browser daemon needs a different explicitly shared or writable location.

Divebell follows the same rule for its own session and Extension files. Set `DIVEBELL_HOME` to choose a durable writable directory. When it is not set and `~/.divebell` is unavailable, Divebell uses a private per-user directory under the operating system's temporary directory, including for the isolated browser daemon home.

## Developing and publishing the fork

When changing agent-browser itself, follow the
[Divebell fork development and release flow](https://github.com/2heal1/agent-browser/blob/codex/openruntime-agent-browser-release/docs/divebell-fork-development.md)
in full, including its branch, upstream synchronization, verification, and
publishing rules.

## Updating the pinned build

After publishing a new fork build, update Divebell from the repository root
with its exact version:

```bash
pnpm run update:agent-browser -- 0.35.0-divebell.1
```

This updates the `@divebell/cli` dependency and lockfile, regenerates the
version-matched `browser.raw` Extension Skill reference from the installed
package, and runs the synchronization, contract, CLI, and lint checks. Review
and commit all generated reference changes with the dependency update. Do not
edit the generated section of
`skills/divebell-extension/references/browser-raw.md` manually.

## Why it is temporary

The additional diagnostics and sandbox compatibility are maintained in the fork while they are contributed upstream. Until an official agent-browser release provides equivalent behavior, Divebell pins this build so users do not need to compile or configure another executable.

## When to return to the official package

Return to the official package after all of the following are true:

1. An official agent-browser release includes memory metrics, allocation sampling, heap snapshots, and code-coverage capture.
2. The official release can relocate all agent-browser-owned state when the user home directory is read-only and can launch an available headless browser in that environment.
3. Divebell's memory analysis, code-usage, and sandbox browser tests pass against that release.
4. Command names, output, and errors remain compatible with Divebell.

## Migration checklist

1. Replace `@divebell/agent-browser` in `packages/cli/package.json` with the verified official `agent-browser` version.
2. Update `pnpm-lock.yaml`.
3. Update the bundled executable lookup in `packages/cli/src/features/browser/runner.ts`.
4. Update package-path and version expectations in tests.
5. Run the CLI build and tests, followed by real-page memory and code-usage checks.
6. Remove this document and the fork-specific maintenance instructions from `AGENTS.md`.
