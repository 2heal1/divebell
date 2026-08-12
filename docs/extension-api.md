# Divebell CLI Extension API Reference

Use this reference to look up the current Extension definition, Command, Hook, and `options` types and conventions. For the complete development workflow, see [CLI Extension Development](cli-extensions.md).

Extension development normally imports `DivebellExtensionDefinition`, `DivebellExtensionHooks`, `CliExtensionRunOptions`, and `DivebellExtensionApi` directly from `@divebell/cli`. The sections below also expand the nested structures referenced by those public types so their fields are easy to inspect. Those nested structures do not need to be imported separately; derive them from the public parent types.

## Extension definition

```ts
interface DivebellExtensionDefinition {
  schemaVersion: 1;
  name: string;
  requires?: readonly string[];
  displayName?: string;
  description?: string;
  commands?: readonly DivebellExtensionCommand[];
  hooks?: DivebellExtensionHooks;
}
```

| Field | Usage |
| --- | --- |
| `schemaVersion` | Currently fixed at `1`. |
| `name` | The stable Extension name. It must match `^[a-z][a-z0-9-]*$` and must not duplicate another loaded Extension. |
| `requires` | Extension names that must be installed and may be called through `options.runExtension`. |
| `displayName` | Optional human-readable name. |
| `description` | Optional short purpose. |
| `commands` | Commands registered by this Extension. Command names must not conflict with built-in commands or commands from other Extensions. |
| `hooks` | The `open`, `detectStack`, and `close` hooks. |

A definition must contain at least one Command or Hook. Divebell checks `requires` when it loads the Extension list. A missing dependency prevents that Extension from loading and reports which Extension must be installed. TypeScript entries should normally be annotated as `DivebellExtensionDefinition`. If declaration files are not generated, `satisfies DivebellExtensionDefinition` is also suitable. Tests and CI may call `validateExtension(...)` on the default export.

## Commands

```ts
interface DivebellExtensionCommand {
  name: string;
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

- `name` is the command name mounted under `divebell`.
- `requiresOpenHook` makes the Command available only when its own Extension completed `open` successfully for the current page.
- `commandReferences` controls the detailed usage and description shown by `divebell <command> --help`. The top-level `divebell --help` lists only the command name and a short summary.
- `skill.path` must be an absolute path to an existing `SKILL.md`.
- `run` returns the result directly on success and throws an error on failure.

### `CliExtensionRunOptions`

```ts
interface CliExtensionRunOptions {
  args: ParsedCliArgs;
  fetcher: Fetcher;
  page?: CliExtensionPageContext;
  headers?: Readonly<Record<string, string>>;
  divebell: DivebellExtensionApi;
  runExtension: CliExtensionRunFunction;
  withLoading: CliExtensionLoadingFunction;
}
```

| Field | Type | Usage |
| --- | --- | --- |
| `options.args` | `ParsedCliArgs` | Parsed arguments for the current command. `command` contains the command name and positional arguments; `options` is a `Map<string, string[]>`, so the same option may appear more than once. |
| `options.page` | `CliExtensionPageContext \| undefined` | Page context saved after the latest successful `divebell open`. Commands that do not need a page should not require it; commands that do must handle `undefined` first. |
| `options.headers` | `Readonly<Record<string, string>> \| undefined` | The exact effective headers from the latest successful `divebell open --headers`. It is `undefined` when the page was opened without headers. |
| `options.divebell` | `DivebellExtensionApi` | Main entry point for reading Runtime information, operating the current page, collecting browser evidence, and waiting for results. |
| `options.fetcher` | `Fetcher` | Low-level request function used internally by Divebell. Normally avoid calling it directly; use `options.divebell` for Bridge and Runtime access. |
| `options.runExtension` | `CliExtensionRunFunction` | Calls a Command from this Extension or a declared Extension dependency and returns its raw result. |
| `options.withLoading` | `CliExtensionLoadingFunction` | Reuses the current Command's loading animation for nested or concurrent work. The Command already shows loading by default. |

### `options.args`

```ts
interface ParsedCliArgs {
  command: string[];
  options: Map<string, string[]>;
}
```

For example, running:

```sh
divebell foo inspect order-42 --format=json --tag smoke --tag checkout --verbose
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
} from "@divebell/cli";

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

Declare other Extensions once on the Extension definition, then call one of their Commands:

```ts
{
  schemaVersion: 1,
  name: "order-workflow",
  requires: ["account-tools"],
  commands: [{
    name: "verify-order",
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
  }]
}
```

`args` contains only positional arguments after the target Command name. `options` accepts scalar values or arrays; the target receives them through its normal `options.args`. The target shares the current page, session, Runtime selection, browser access, and nested `runExtension` capability.

The target result is returned directly to the caller. A nested call does not write a second CLI result and does not trigger lifecycle Hooks. A Command may call another Command in its own Extension without listing itself in `requires`. Calls to another Extension must be declared by the calling Extension. Cyclic calls and call chains deeper than 16 levels fail with the full call chain.

### `options.withLoading`

Every CLI and Extension Command shows one loading animation by default. Existing Extensions may continue to wrap nested or concurrent work with the shared function:

```ts
interface CliExtensionLoadingFunction {
  <T>(run: () => T | PromiseLike<T>): Promise<T>;
}

const report = await options.withLoading(async () => {
  return await createReport();
});
```

The wrapper does not start a second animation. Interactive terminals show loading immediately and clear it before the Command writes output or an error. Non-interactive output remains unchanged. New Extensions normally do not need to call `withLoading` themselves.

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

- `url` is the URL requested by the latest successful `divebell open`; `openedUrl` is the effective URL opened after Divebell adds its session query and applies Extension open hooks.
- `normalizedUrl` supports stable page comparisons; `openedAt` is a millisecond timestamp.
- `bridgeUrl` and `sessionId` may be null. Their presence must not be used to assume that a page uses Runtime SDK.
- `sessionId` is the Divebell session created by `divebell open --session` (or generated automatically) and used to correlate the opened page with Runtime SDK connections. It is not an agent-browser daemon session, a debugger/CDP session, or a tab ID.
- This object is historical context for the latest opened page. Continue through `options.divebell.browser` when current page state must be confirmed.

### Command results and errors

Return the result directly when a Command succeeds. The CLI places it in the `data` field of the standard successful output. If the Command has no explicit return value, `data` is `null`.

```ts
return { count: 3 };
```

Throw an error when a Command fails. The CLI converts it into the standard error output and returns a non-zero exit code.

## Skills

```ts
interface DivebellCommandSkill {
  path: string;
}
```

`path` must be an absolute path to an existing `SKILL.md`. `divebell <command> --skill` prints that path without running the Command.

## Hooks

Derive parameters and return values from `DivebellExtensionHooks` when implementing hooks in separate files:

```ts
import type { DivebellExtensionHooks } from "@divebell/cli";

export const open: NonNullable<DivebellExtensionHooks["open"]> =
  async options => ({ scripts: [] });
```

The following declarations expand the structures used by all three hooks:

```ts
interface DivebellExtensionHooks {
  open?: DivebellOpenHook | DivebellOrderedHook<DivebellOpenHook>;
  detectStack?:
    | DivebellDetectStackHook
    | DivebellOrderedHook<DivebellDetectStackHook>;
  close?(options: DivebellPageHookOptions): Promise<void>;
}

type DivebellOpenHook = (
  options: DivebellOpenHookOptions
) => Promise<DivebellOpenHookResult | void>;

type DivebellDetectStackHook = (
  options: DivebellPageHookOptions
) => Promise<
  DivebellStackDetection |
  readonly DivebellStackDetection[] |
  void
>;

interface DivebellOrderedHook<Handler> {
  run: Handler;
  before?: readonly string[];
  after?: readonly string[];
}
```

The function shorthand remains valid. Use the object form only when a Hook needs ordering:

```ts
hooks: {
  open: {
    after: ["account-tools"],
    run: async options => {
      // ...
    }
  }
}
```

Hooks without ordering relationships run in parallel. Divebell computes execution batches when it creates the CLI from the current Extension list. `before` and `after` control ordering only: a missing or failed referenced Hook does not disable this Hook. Declare required Extensions on the Extension definition instead. Ordering cycles disable only their participants. Hook return values are not passed to later Hooks.

`close` does not declare its own ordering. It follows the reverse batch order of `open`; Hooks that were parallel during `open` are also parallel during `close`.

### `open`

```ts
interface DivebellOpenHookOptions {
  args: ParsedCliArgs;
  url: string;
  openedUrl: string;
  headers?: Readonly<Record<string, string>>;
}

interface DivebellOpenHookResult {
  scripts?: readonly string[];
}
```

`open` runs before the browser opens the URL and may return one or more page initialization scripts. `headers` contains the parsed, effective value of `open --headers`; it is `undefined` when the command did not provide headers. Divebell stores the same headers in its directory-scoped operation record and passes them to later Extension Commands as `options.headers`. This includes credentials or tokens when they are present, so protect the local Divebell state directory accordingly. Scripts from multiple Extensions are combined in Hook execution order and isolated so an exception in one script does not block later Extension scripts or Divebell's own page setup. One failed Hook does not block the page or unrelated Extensions.

### `detectStack` and `close`

```ts
interface DivebellPageHookOptions {
  args: ParsedCliArgs;
  page: CliExtensionPageContext;
  divebell: DivebellExtensionApi;
}

interface DivebellStackDetection {
  id: string;
  name: string;
  version?: string;
  evidence?: readonly string[];
  details?: DivebellStackDetailObject;
  command?: string;
}

type DivebellStackDetailValue =
  | string
  | number
  | boolean
  | null
  | DivebellStackDetailArray
  | DivebellStackDetailObject;

interface DivebellStackDetailArray
  extends ReadonlyArray<DivebellStackDetailValue> {}

interface DivebellStackDetailObject {
  readonly [key: string]: DivebellStackDetailValue;
}
```

`detectStack` runs only for `divebell stack` and may return one detection,
multiple detections, or no result. `command` must name a top-level command
registered by the current Extension; omit it when there is no follow-up
command. `details` may contain a compact JSON object up to 20 KB for structured
detector-specific facts. Do not include full page configuration, source text,
credentials, signed URLs, or other sensitive values in `evidence` or `details`.

`close` runs only for Extensions that successfully participated in the matching `open`. It runs when that page is stopped or replaced by another `open` in the same working directory. Cleanup failures are reported but do not prevent the page lifecycle from continuing.

Each hook may run for up to five seconds. A timeout is recorded as a hook failure for that Extension and does not block other Extensions.

## `DivebellExtensionApi`

Commands and page hooks use `options.divebell` as the primary entry point to Divebell capabilities.

| Capability | API |
| --- | --- |
| Read application-internal information | `targets`, `snapshot`, `events`, `actions` |
| Execute and await page-declared capabilities | `runAction`, `waitFor` |
| Run any Divebell browser page command | `browser.run` |
| Common typed page operations | `browser.pageSnapshot`, `browser.click`, `browser.fill`, `browser.eval`, `browser.evalFile`, `browser.waitEval`, `browser.getWindow` |
| Collect browser evidence | `browser.screenshot`, `browser.network`, `browser.console` |
| Run focused low-level capture | `browser.memory`, `browser.coverage` |

Page operations and diagnostics under `browser` remain available when the page does not use Runtime SDK. Require a connected Runtime only when a Command truly needs application-internal state.

`browser.run(command, request)` exposes every browser page command listed by
`divebell --help`. Positional arguments go in `request.args`; long options go
in `request.options` without the leading `--`. A scalar supplies one option
value, an array repeats the option, and `true` supplies a flag. Use
`request.input` with commands such as `eval --stdin`.

```ts
await divebell.browser.run("hover", {
  args: ["e8"]
});

await divebell.browser.run("tab", {
  args: ["new", "https://docs.example.com/"],
  options: {
    label: "docs",
    json: true
  }
});

await divebell.browser.run("goto", {
  args: ["https://app.example.com/orders"]
});
```

This entry point uses Divebell command names and the current opened-page
context. It applies the same aliases, element-reference normalization, option
translation, error handling, and session-preserving navigation as the CLI.
It cannot run `open` or `stop`; those remain owned by the outer workflow.
`browser.memory` remains the typed entry point for memory capture.

### Debugger identity and selection

Extensions that use the compiled-JavaScript debugger must obtain debugger IDs
from `browser.run("debug", ...)`; `options.page` does not contain them. Enabling
without a selector targets the active tab and returns its debugger identity.
Retain the mapping returned in `sessions`:

```ts
interface DebuggerEnableResult {
  connectionGeneration: number;
  sessions: Array<{
    sessionId: string;
    tabId?: string;
  }>;
}

const enabled = JSON.parse(await divebell.browser.run("debug", {
  args: ["enable"],
  options: { json: true }
})) as DebuggerEnableResult;
```

`debug status` can be used before enabling to record whether the selected
renderer was already enabled, but an unfiltered status can contain every tab.
Do not assume its first session is the active page; either use the single
session returned by an unfiltered `debug enable`, or explicitly select the
intended tab.

The IDs have separate namespaces and must not be substituted for each other:

| Value | Meaning | Extension usage |
| --- | --- | --- |
| `options.page.sessionId` | Divebell page/Runtime correlation session from `divebell open` | Select Runtime SDK connections; never use it as a debugger selector |
| debugger `sessions[].sessionId` | Chrome CDP target-session identity | Correlate scripts and events with the renderer that produced them |
| debugger `sessions[].tabId` | Stable agent-browser tab selector, such as `t1` | Preferred selector for follow-up `debug` commands through `browser.run` |
| debugger `scriptId` | Chrome's script ID within one document and CDP session | Use only with the matching debugger session and document generation |
| debugger `scriptInstanceKey` | Script identity including connection generation, CDP session, document generation, and script ID | Retain when a probe must distinguish navigation or reconnect generations |

For a follow-up command, pass the returned `tabId` as the `tab` option:

```ts
const selected = enabled.sessions[0];
if (selected?.tabId === undefined) {
  throw new Error("No debugger tab is available for the current page.");
}

await divebell.browser.run("debug", {
  args: ["scripts"],
  options: { tab: selected.tabId, json: true }
});
```

Do not forward a debugger CDP `sessionId` as a generic `session` option. That
name is also used by agent-browser process routing and can select the wrong
daemon. A bare `scriptId` is likewise not stable across navigation or browser
reconnection; use the returned script identity fields together.

`browser.raw` is only a low-level agent-browser escape hatch. It accepts
agent-browser arguments directly and does not add Divebell page-context checks,
command translation, or normalized errors. Prefer `browser.run` or the typed
helpers for Extension features.

The Coding Agent remains responsible for reading and changing project source code. The Extension API does not provide a standardized code workspace or development-server interface. Do not present an Extension's own file access as a general Divebell code capability.
