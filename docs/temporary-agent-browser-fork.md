# Temporary agent-browser Build Used by Divebell

Chinese version: [Divebell 临时使用的 agent-browser 版本](temporary-agent-browser-fork.zh-CN.md)

## Current status

Divebell CLI currently pins:

```text
@openruntime/agent-browser@0.32.0-openruntime.1
```

This legacy-named package comes from a temporary agent-browser branch and adds the memory diagnostics and code-coverage capture required by Divebell. It remains under `@openruntime` until the release migration is complete. Divebell uses the executable included with the CLI unless `DIVEBELL_AGENT_BROWSER_EXECUTABLE` points to a custom build.

## Why it is temporary

The additional capabilities are being contributed upstream. Until an official agent-browser release provides equivalent behavior, Divebell pins this build so users do not need to compile or configure another executable.

## When to return to the official package

Return to the official package after all of the following are true:

1. An official agent-browser release includes memory metrics, allocation sampling, heap snapshots, and code-coverage capture.
2. Divebell's memory analysis and code-usage tests pass against that release.
3. Command names, output, and errors remain compatible with Divebell.

## Migration checklist

1. Replace `@openruntime/agent-browser` in `packages/cli/package.json` with the verified official `agent-browser` version.
2. Update `pnpm-lock.yaml`.
3. Update the installation notes in `packages/cli/README.md`.
4. Update the bundled executable lookup in `packages/cli/src/features/browser/runner.ts`.
5. Update package-path and version expectations in tests.
6. Run the CLI build and tests, followed by real-page memory and code-usage checks.
7. Remove both temporary-package documents.
