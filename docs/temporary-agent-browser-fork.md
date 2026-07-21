# Temporary OpenRuntime agent-browser Build

Chinese version: [临时使用 OpenRuntime 版 agent-browser](temporary-agent-browser-fork.zh-CN.md)

## Current status

OpenRuntime CLI currently pins:

```text
@openruntime/agent-browser@0.32.0-openruntime.1
```

This package comes from a temporary agent-browser branch and adds the memory diagnostics and code-coverage capture required by OpenRuntime. OpenRuntime uses the executable included with the CLI unless `OPENRUNTIME_AGENT_BROWSER_EXECUTABLE` points to a custom build.

## Why it is temporary

The additional capabilities are being contributed upstream. Until an official agent-browser release provides equivalent behavior, OpenRuntime pins this build so users do not need to compile or configure another executable.

## When to return to the official package

Return to the official package after all of the following are true:

1. An official agent-browser release includes memory metrics, allocation sampling, heap snapshots, and code-coverage capture.
2. OpenRuntime's memory analysis and code-usage tests pass against that release.
3. Command names, output, and errors remain compatible with OpenRuntime.

## Migration checklist

1. Replace `@openruntime/agent-browser` in `packages/cli/package.json` with the verified official `agent-browser` version.
2. Update `pnpm-lock.yaml`.
3. Update the installation notes in `packages/cli/README.md`.
4. Update the bundled executable lookup in `packages/cli/src/features/browser/runner.ts`.
5. Update package-path and version expectations in tests.
6. Run the CLI build and tests, followed by real-page memory and code-usage checks.
7. Remove both temporary-package documents.
