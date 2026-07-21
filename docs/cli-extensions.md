# OpenRuntime CLI Extension Development

Chinese version: [OpenRuntime CLI 扩展开发指南](cli-extensions.zh-CN.md)

## What an extension provides

An OpenRuntime extension is the unit of installation and loading. One extension may provide:

- `commands` mounted under `openruntime`.
- `hooks.open`, run before the browser opens a URL and able to contribute initialization scripts.
- `hooks.detectStack`, run on demand by `openruntime stack`.
- `hooks.close`, used to clean up resources created during `open`.
- A local `SKILL.md` associated with a command.

Page commands operate on the page created by the latest `openruntime open <url>`. Use [automation scripts](cli-automation-scripts.md) when a workflow must manage the whole browser lifecycle itself.

## Install and manage extensions

```sh
openruntime extensions add @scope/package
openruntime extensions list
openruntime extensions update @scope/package
openruntime extensions remove @scope/package
```

The default directory is `~/.openruntime/extensions`. It can be changed or disabled with:

```sh
OPENRUNTIME_EXTENSIONS_DIR=/path/to/extensions openruntime --help
OPENRUNTIME_DISABLE_EXTENSIONS=1 openruntime --help
```

Extensions execute local code. Only load trusted content.

## npm package entry

Extension packages must be self-contained and cannot declare runtime dependencies. Declare one or more entries with `openruntime.extensions`:

```json
{
  "name": "@scope/package",
  "version": "1.0.0",
  "type": "module",
  "openruntime": {
    "schemaVersion": 1,
    "extensions": ["./dist/extension.js"]
  }
}
```

Loose local entries may be placed at `~/.openruntime/extensions/foo.mjs` or `~/.openruntime/extensions/foo/index.mjs`.

## Extension declaration

OpenRuntime reads every extension entry during startup. Keep the entry declaration-only and load real command and hook implementations with `await import()`:

```ts
import type { OpenRuntimeExtensionDefinition } from "@openruntime/cli";

const extension = {
  schemaVersion: 1,
  name: "foo",
  commands: [{
    name: "foo",
    commandReferences: [{
      category: "Extensions",
      usage: "openruntime foo ping",
      description: "Runs a Foo page operation."
    }],
    run: async options =>
      await (await import("./commands/foo.js")).runFoo(options)
  }],
  hooks: {
    open: async options =>
      await (await import("./hooks/open.js")).open(options),
    detectStack: async options =>
      await (await import("./hooks/detect-stack.js")).detectStack(options),
    close: async options =>
      await (await import("./hooks/close.js")).close(options)
  }
} satisfies OpenRuntimeExtensionDefinition;

export default extension;
```

Do not statically import implementations or perform initialization, file reads, network requests, or top-level awaits in the entry. Relative dynamic imports must include the `.js` extension. Tests and CI may call `validateExtension(...)` on the default export.

## Hook behavior

### `open`

`open` runs before the browser opens the URL and may return initialization scripts:

```ts
export async function open() {
  return { scripts: ["globalThis.__TEAM_MARKER__ = true;"] };
}
```

OpenRuntime combines scripts from successful extensions with its own initialization script. One failed extension does not block the page or other extensions.

### `detectStack`

`detectStack` only runs for `openruntime stack`; it does not slow down `openruntime open`.

```ts
export async function detectStack({ openruntime }) {
  const detected = await openruntime.browser.eval(
    "globalThis._MODERNJS_ROUTE_MANIFEST != null"
  );
  if (!detected) return;
  return {
    id: "modernjs",
    name: "Modern.js",
    evidence: ["window._MODERNJS_ROUTE_MANIFEST"],
    recommendedExtensions: ["@scope/modern-tools"]
  };
}
```

A result contains an ID and name, plus optional version, short evidence, and recommended extensions. Do not return complete page configuration or sensitive values. Detectors run concurrently and `openruntime stack` aggregates their results.

The latest result is reused for the same page and detector set. Run `openruntime stack --refresh` to force detection again.

### `close`

`close` only runs for extensions that successfully participated in the matching `open`. Cleanup failures are reported but do not prevent the browser from closing.

## Command context

`run(options)` receives parsed arguments, the latest page context, structured output helpers, and `options.openruntime`. Browser operations include evaluation, window reads, click, fill, screenshots, network, and Console. Prefer `snapshot`, `runAction`, and `waitFor` for structured application state.

A command may point `skill.path` at an existing absolute `SKILL.md`. `openruntime foo --skill` prints that path without running the command.

## Verification

- Confirm unrelated commands do not load implementation modules.
- Verify `open`, `stack`, and `close` trigger only their matching hooks.
- Verify one failed hook does not prevent other extensions from working.
- Test page commands against a real or representative page after `openruntime open <url>`.
