# OpenRuntime CLI Extension API Reference

Chinese version: [OpenRuntime CLI Extension API 参考](extension-api.zh-CN.md)

Use this reference to look up the current Extension definition, Command, Hook, and `options` types and conventions. For the complete development workflow, see [CLI Extension Development](cli-extensions.md).

Extension development normally imports `OpenRuntimeExtensionDefinition`, `OpenRuntimeExtensionHooks`, `CliExtensionRunOptions`, and `OpenRuntimeExtensionApi` directly from `@openruntime/cli`. The sections below also expand the nested structures referenced by those public types so their fields are easy to inspect. Those nested structures do not need to be imported separately; derive them from the public parent types.

## Extension definition

```ts
interface OpenRuntimeExtensionDefinition {
  schemaVersion: 1;
  name: string;
  displayName?: string;
  description?: string;
  commands?: readonly OpenRuntimeExtensionCommand[];
  hooks?: OpenRuntimeExtensionHooks;
}
```

| Field | Usage |
| --- | --- |
| `schemaVersion` | Currently fixed at `1`. |
| `name` | The stable Extension name. It must match `^[a-z][a-z0-9-]*$` and must not duplicate another loaded Extension. |
| `displayName` | Optional human-readable name. |
| `description` | Optional short purpose. |
| `commands` | Commands registered by this Extension. Command names must not conflict with built-in commands or commands from other Extensions. |
| `hooks` | The `open`, `detectStack`, and `close` hooks. |

A definition must contain at least one Command or Hook. TypeScript entries should normally be annotated as `OpenRuntimeExtensionDefinition`. If declaration files are not generated, `satisfies OpenRuntimeExtensionDefinition` is also suitable. Tests and CI may call `validateExtension(...)` on the default export.

## Commands

```ts
interface OpenRuntimeExtensionCommand {
  name: string;
  skill?: { path: string };
  commandReferences?: readonly CliCommandReference[];
  run(options: CliExtensionRunOptions): Promise<number>;
}

interface CliCommandReference {
  category:
    | "Bridge and Browser"
    | "Runtime"
    | "Extensions"
    | "External Extensions";
  usage: string;
  description: string;
}
```

- `name` is the command name mounted under `openruntime`.
- `commandReferences` controls the usage and description shown by `openruntime --help`.
- `skill.path` must be an absolute path to an existing `SKILL.md`.
- `run` returns `0` on success and a non-zero value when the command did not complete.

### `CliExtensionRunOptions`

```ts
interface CliExtensionRunOptions {
  args: ParsedCliArgs;
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
  fetcher: Fetcher;
  page?: CliExtensionPageContext;
  openruntime: OpenRuntimeExtensionApi;
  output: CommandOutput;
}
```

| Field | Type | Usage |
| --- | --- | --- |
| `options.args` | `ParsedCliArgs` | Parsed arguments for the current command. `command` contains the command name and positional arguments; `options` is a `Map<string, string[]>`, so the same option may appear more than once. |
| `options.page` | `CliExtensionPageContext \| undefined` | Page context saved after the latest successful `openruntime open`. Commands that do not need a page should not require it; commands that do must handle `undefined` first. |
| `options.output` | `CommandOutput` | Produces a result that agents can parse reliably. Use `ok` for success, `needsInput` when another choice is required, and `error` or a thrown error for failure. |
| `options.openruntime` | `OpenRuntimeExtensionApi` | Main entry point for reading Runtime information, operating the current page, collecting browser evidence, and waiting for results. |
| `options.stdout` | `{ write(chunk: string): void }` | Raw standard output. Reserve it for progress or content that must remain plain text; return the final result through `output`. |
| `options.stderr` | `{ write(chunk: string): void }` | Raw standard error. Use it only for diagnostic logs, not as a substitute for a structured failure result. |
| `options.fetcher` | `Fetcher` | Low-level request function used internally by OpenRuntime. Normally avoid calling it directly; use `options.openruntime` for Bridge and Runtime access. |

### `options.args`

```ts
interface ParsedCliArgs {
  command: string[];
  options: Map<string, string[]>;
}
```

For example, running:

```sh
openruntime foo inspect order-42 --format=json --tag smoke --tag checkout --verbose
```

produces:

```ts
options.args.command // ["foo", "inspect", "order-42"]
options.args.options.get("format") // ["json"]
options.args.options.get("tag") // ["smoke", "checkout"]
options.args.options.get("verbose") // ["true"]
```

The CLI also exports argument helpers:

```ts
import {
  getNumberOption,
  getOptionValue,
  getOptionValues
} from "@openruntime/cli";

const format = getOptionValue(options.args, "format");
const tags = getOptionValues(options.args, "tag");
const timeout = getNumberOption(options.args, "timeout");
```

`--flag` is parsed as the string `"true"`. Unknown options are not rejected automatically. Each Command must validate required arguments, accepted values, and invalid combinations.

### `options.page`

```ts
interface CliExtensionPageContext {
  url: string;
  openedUrl: string;
  normalizedUrl: string;
  bridgeUrl: string | null;
  sessionId: string | null;
  openedAt: number;
}
```

- `url` is the latest recorded page URL; `openedUrl` is the original URL passed to `openruntime open`.
- `normalizedUrl` supports stable page comparisons; `openedAt` is a millisecond timestamp.
- `bridgeUrl` and `sessionId` may be null. Their presence must not be used to assume that a page uses Runtime Core.
- This object is historical context for the latest opened page. Continue through `options.openruntime.browser` when current page state must be confirmed.

### `options.output`

```ts
interface CommandOutput {
  ok<T>(data: T, message?: string): void;
  needsInput(message: string, choices: readonly unknown[], data?: unknown): void;
  error(error: unknown): void;
}
```

```ts
options.output.ok({ count: 3 }, "Check complete");

options.output.needsInput(
  "Choose an environment to inspect",
  [{ id: "staging", label: "Staging" }]
);
```

A Command should write exactly one final result. On success, write `ok` and return `0`. When more input is required or the command fails, write the matching result and return a non-zero value. Errors thrown by a Command are converted into the standard CLI error result.

## Skills

```ts
interface OpenRuntimeCommandSkill {
  path: string;
}
```

`path` must be an absolute path to an existing `SKILL.md`. `openruntime <command> --skill` prints that path without running the Command.

## Hooks

Derive parameters and return values from `OpenRuntimeExtensionHooks` when implementing hooks in separate files:

```ts
import type { OpenRuntimeExtensionHooks } from "@openruntime/cli";

export const open: NonNullable<OpenRuntimeExtensionHooks["open"]> =
  async options => ({ scripts: [] });
```

The following declarations expand the structures used by all three hooks:

```ts
interface OpenRuntimeExtensionHooks {
  open?(
    options: OpenRuntimeOpenHookOptions
  ): Promise<OpenRuntimeOpenHookResult | void>;
  detectStack?(
    options: OpenRuntimePageHookOptions
  ): Promise<OpenRuntimeStackDetection | readonly OpenRuntimeStackDetection[] | void>;
  close?(options: OpenRuntimePageHookOptions): Promise<void>;
}
```

### `open`

```ts
interface OpenRuntimeOpenHookOptions {
  args: ParsedCliArgs;
  url: string;
  openedUrl: string;
}

interface OpenRuntimeOpenHookResult {
  scripts?: readonly string[];
}
```

`open` runs before the browser opens the URL and may return one or more page initialization scripts. Scripts from multiple Extensions are combined. One failed hook does not block the page or other Extensions.

### `detectStack` and `close`

```ts
interface OpenRuntimePageHookOptions {
  args: ParsedCliArgs;
  page: CliExtensionPageContext;
  openruntime: OpenRuntimeExtensionApi;
}

interface OpenRuntimeStackDetection {
  id: string;
  name: string;
  version?: string;
  evidence?: readonly string[];
  recommendedExtensions?: readonly string[];
}
```

`detectStack` runs only for `openruntime stack` and may return one detection, multiple detections, or no result. Do not include full page configuration or sensitive values in `evidence`.

`close` runs only for Extensions that successfully participated in the matching `open`. Cleanup failures are reported but do not prevent the browser from closing.

Each hook may run for up to five seconds. A timeout is recorded as a hook failure for that Extension and does not block other Extensions.

## `OpenRuntimeExtensionApi`

Commands and page hooks use `options.openruntime` as the primary entry point to OpenRuntime capabilities.

| Capability | API |
| --- | --- |
| Read application-internal information | `targets`, `snapshot`, `events`, `actions` |
| Execute and await page-declared capabilities | `inputOptions`, `runAction`, `waitFor` |
| Operate and inspect the current page | `browser.pageSnapshot`, `browser.click`, `browser.fill`, `browser.eval`, `browser.evalFile`, `browser.waitEval`, `browser.getWindow` |
| Collect browser evidence | `browser.screenshot`, `browser.network`, `browser.console` |
| Run focused low-level capture | `browser.memory`, `browser.coverage` |

Page operations and diagnostics under `browser` remain available when the page does not use Runtime Core. Require a connected Runtime only when a Command truly needs application-internal state.

The Coding Agent remains responsible for reading and changing project source code. The Extension API does not provide a standardized code workspace or development-server interface. Do not present an Extension's own file access as a general OpenRuntime code capability.
