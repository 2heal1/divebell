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
  requires?: readonly string[];
  requiresOpenHook?: boolean;
  skill?: { path: string };
  commandReferences?: readonly CliCommandReference[];
  run(options: CliExtensionRunOptions): Promise<unknown>;
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
- `requires` lists the Extension names that this Command may call through `options.runExtension`.
- `requiresOpenHook` makes the Command available only when its own Extension completed `open` successfully for the current page.
- `commandReferences` controls the detailed usage and description shown by `openruntime <command> --help`. The top-level `openruntime --help` lists only the command name and a short summary.
- `skill.path` must be an absolute path to an existing `SKILL.md`.
- `run` returns the result directly on success and throws an error on failure.

A missing `requires` entry disables only that Command when it is invoked. Other Commands from the same Extension remain usable.

### `CliExtensionRunOptions`

```ts
interface CliExtensionRunOptions {
  args: ParsedCliArgs;
  fetcher: Fetcher;
  page?: CliExtensionPageContext;
  headers?: Readonly<Record<string, string>>;
  openruntime: OpenRuntimeExtensionApi;
  runExtension: CliExtensionRunFunction;
}
```

| Field | Type | Usage |
| --- | --- | --- |
| `options.args` | `ParsedCliArgs` | Parsed arguments for the current command. `command` contains the command name and positional arguments; `options` is a `Map<string, string[]>`, so the same option may appear more than once. |
| `options.page` | `CliExtensionPageContext \| undefined` | Page context saved after the latest successful `openruntime open`. Commands that do not need a page should not require it; commands that do must handle `undefined` first. |
| `options.headers` | `Readonly<Record<string, string>> \| undefined` | The exact effective headers from the latest successful `openruntime open --headers`. It is `undefined` when the page was opened without headers. |
| `options.openruntime` | `OpenRuntimeExtensionApi` | Main entry point for reading Runtime information, operating the current page, collecting browser evidence, and waiting for results. |
| `options.fetcher` | `Fetcher` | Low-level request function used internally by OpenRuntime. Normally avoid calling it directly; use `options.openruntime` for Bridge and Runtime access. |
| `options.runExtension` | `CliExtensionRunFunction` | Calls a Command from this Extension or a declared Extension dependency and returns its raw result. |

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

### `options.runExtension`

```ts
interface CliExtensionRunRequest {
  command: string;
  args?: readonly string[];
  options?: Readonly<Record<
    string,
    string | number | boolean |
    readonly (string | number | boolean)[]
  >>;
}

interface CliExtensionRunFunction {
  <T = unknown>(
    extensionName: string,
    request: CliExtensionRunRequest
  ): Promise<T>;
}
```

Declare other Extensions by name on the calling Command, then call one of their Commands:

```ts
{
  name: "verify-order",
  requires: ["account-tools"],
  run: async ({ runExtension }) => {
    const account = await runExtension<{ id: string }>("account-tools", {
      command: "resolve-account",
      args: ["checkout"],
      options: {
        role: "buyer",
        tag: ["smoke", "checkout"]
      }
    });
    return { accountId: account.id };
  }
}
```

`args` contains only positional arguments after the target Command name. `options` accepts scalar values or arrays; the target receives them through its normal `options.args`. The target shares the current page, session, Runtime selection, browser access, and nested `runExtension` capability.

The target result is returned directly to the caller. A nested call does not write a second CLI result and does not trigger lifecycle Hooks. A Command may call another Command in its own Extension without listing itself in `requires`. Calls to another Extension must be declared. Cyclic calls and call chains deeper than 16 levels fail with the full call chain.

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

### Command results and errors

Return the result directly when a Command succeeds. The CLI places it in the `data` field of the standard successful output. If the Command has no explicit return value, `data` is `null`.

```ts
return { count: 3 };
```

Throw an error when a Command fails. The CLI converts it into the standard error output and returns a non-zero exit code.

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
  open?: OpenRuntimeOpenHook | OpenRuntimeOrderedHook<OpenRuntimeOpenHook>;
  detectStack?:
    | OpenRuntimeDetectStackHook
    | OpenRuntimeOrderedHook<OpenRuntimeDetectStackHook>;
  close?(options: OpenRuntimePageHookOptions): Promise<void>;
}

type OpenRuntimeOpenHook = (
  options: OpenRuntimeOpenHookOptions
) => Promise<OpenRuntimeOpenHookResult | void>;

type OpenRuntimeDetectStackHook = (
  options: OpenRuntimePageHookOptions
) => Promise<
  OpenRuntimeStackDetection |
  readonly OpenRuntimeStackDetection[] |
  void
>;

interface OpenRuntimeOrderedHook<Handler> {
  run: Handler;
  before?: readonly string[];
  after?: readonly string[];
  requires?: readonly string[];
}
```

The function shorthand remains valid. Use the object form only when a Hook needs ordering:

```ts
hooks: {
  open: {
    after: ["account-tools"],
    requires: ["environment-tools"],
    run: async options => {
      // ...
    }
  }
}
```

Hooks without ordering relationships run in parallel. OpenRuntime computes execution batches when it creates the CLI from the current Extension list. `before` and `after` are soft ordering constraints: a missing or failed referenced Hook does not disable this Hook. `requires` is a hard dependency: the referenced Hook must exist and complete successfully. Ordering cycles disable only their participants. Hook return values are not passed to later Hooks.

`close` does not declare its own ordering. It follows the reverse batch order of `open`; Hooks that were parallel during `open` are also parallel during `close`.

### `open`

```ts
interface OpenRuntimeOpenHookOptions {
  args: ParsedCliArgs;
  url: string;
  openedUrl: string;
  headers?: Readonly<Record<string, string>>;
}

interface OpenRuntimeOpenHookResult {
  scripts?: readonly string[];
}
```

`open` runs before the browser opens the URL and may return one or more page initialization scripts. `headers` contains the parsed, effective value of `open --headers`; it is `undefined` when the command did not provide headers. OpenRuntime stores the same headers in its directory-scoped operation record and passes them to later Extension Commands as `options.headers`. This includes credentials or tokens when they are present, so protect the local OpenRuntime state directory accordingly. Scripts from multiple Extensions are combined in Hook execution order and isolated so an exception in one script does not block later Extension scripts or OpenRuntime's own page setup. One failed Hook does not block the page or unrelated Extensions.

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

`close` runs only for Extensions that successfully participated in the matching `open`. It runs when that page is stopped or replaced by another `open` in the same working directory. Cleanup failures are reported but do not prevent the page lifecycle from continuing.

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
