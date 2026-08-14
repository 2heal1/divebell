# Temporary agent-browser Build Used by Divebell

## Current status

Divebell CLI currently pins:

```text
@divebell/agent-browser@0.33.2-divebell.8
```

This package comes from the maintained Divebell release branch of the agent-browser fork. It adds the memory diagnostics and code-coverage capture required by Divebell. It also keeps agent-browser-owned state in a writable temporary directory when the normal user state directory is unavailable, discovers Puppeteer's headless browser when full Chrome is unavailable, and preserves an active browser across repeated commands. Version `0.33.2-divebell.2` preserves browser cookie source and partition metadata and lets a state export collect web storage from explicitly included SSO origins. Version `0.33.2-divebell.3` restores that storage through intercepted blank responses, so loading a state file does not contact its saved origins or let an authentication flow invalidate restored cookies before the requested page opens. Version `0.33.2-divebell.4` supports Node.js 20.19 or newer for package installation and its JavaScript wrapper. Version `0.33.2-divebell.5` adds independent initial, periodic, and close-time Restore State save stages that can be changed on an existing daemon. Version `0.33.2-divebell.6` adds a compiled-JavaScript debugger control plane with runtime-scoped script identity, non-pausing logpoints, bounded event history, gap reporting, and concurrent pause recovery. Version `0.33.2-divebell.7` adds per-navigation lifecycle timeouts, defaults navigation to 60 seconds, and gives command transport enough response margin to report the navigation result. Version `0.33.2-divebell.8` makes partial follow-up launch envelopes inherit omitted options from the active browser configuration, so CLI and Extension commands keep operating on the page opened by the caller instead of relaunching at `about:blank`. The package also ships its platform binaries directly and no longer runs an npm lifecycle installation script.

Divebell uses the executable included with the CLI unless `DIVEBELL_AGENT_BROWSER_EXECUTABLE` points to a custom build. By default, Divebell keeps the browser daemon and its state under `DIVEBELL_HOME/agent-browser`. This prevents another installed agent-browser client from leaving Divebell connected to an older background binary. Set `AGENT_BROWSER_HOME` only when the browser daemon needs a different explicitly shared or writable location.

Divebell follows the same rule for its own session and Extension files. Set `DIVEBELL_HOME` to choose a durable writable directory. When it is not set and `~/.divebell` is unavailable, Divebell uses a private per-user directory under the operating system's temporary directory, including for the isolated browser daemon home.

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
3. Update the installation notes in `packages/cli/README.md`.
4. Update the bundled executable lookup in `packages/cli/src/features/browser/runner.ts`.
5. Update package-path and version expectations in tests.
6. Run the CLI build and tests, followed by real-page memory and code-usage checks.
7. Remove both temporary-package documents.
