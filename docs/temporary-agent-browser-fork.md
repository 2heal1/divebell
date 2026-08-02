# Temporary agent-browser Build Used by Divebell

## Current status

Divebell CLI currently pins:

```text
@divebell/agent-browser@0.33.2-divebell.1
```

This package comes from the maintained Divebell release branch of the agent-browser fork. It adds the memory diagnostics and code-coverage capture required by Divebell. It also keeps agent-browser-owned state in a writable temporary directory when the normal user state directory is unavailable, discovers Puppeteer's headless browser when full Chrome is unavailable, and preserves an active browser across repeated commands.

Divebell uses the executable included with the CLI unless `DIVEBELL_AGENT_BROWSER_EXECUTABLE` points to a custom build. `AGENT_BROWSER_HOME` may be set when an environment needs a specific writable location; otherwise the packaged browser chooses a safe temporary location automatically.

Divebell follows the same rule for its own session and Extension files. Set `DIVEBELL_HOME` to choose a durable writable directory. When it is not set and `~/.divebell` is unavailable, Divebell uses a private per-user directory under the operating system's temporary directory.

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
