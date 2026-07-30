# Extension API

Use this reference when exact Extension types or API boundaries are needed.

Import `DivebellExtensionDefinition`, `DivebellExtensionHooks`,
`CliExtensionRunOptions`, and `DivebellExtensionApi` from `@divebell/cli`.
Derive nested structures from those public parent types unless the CLI exports
the nested helper directly.

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

Rules:

- `schemaVersion` is `1`.
- `name` must match `^[a-z][a-z0-9-]*$`.
- `name` must not duplicate another loaded Extension.
- The definition must contain at least one Command or Hook.
- Command names must not conflict with built-in or other Extension commands.
- `requires` lists Extension names available through `runExtension`.
- A missing required Extension prevents the dependent Extension from loading.

Annotate TypeScript entries as `DivebellExtensionDefinition`. When declaration
files are not generated, `satisfies DivebellExtensionDefinition` is also
appropriate. Tests and CI may call `validateExtension(...)` on the default
export.

## Command definition

```ts
interface DivebellExtensionCommand {
  name: string;
  requiresOpenHook?: boolean;
  skill?: { path: string };
  commandReferences?: readonly CliCommandReference[];
  run(options: CliExtensionRunOptions): Promise<unknown>;
}
```

```ts
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

`skill.path` must be an absolute path to an existing `SKILL.md`.
`commandReferences` supplies detailed usage for
`divebell <command> --help`; top-level help shows only a short summary.
`run` returns data directly on success and throws on failure.

## Command options

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

- Prefer `options.divebell` over the low-level `options.fetcher`.
- `headers` is the exact effective header object from the latest successful
  `divebell open --headers`, or `undefined`.
- Use `withLoading` only around work that may take noticeable time.

### Parsed arguments

```ts
interface ParsedCliArgs {
  command: string[];
  options: Map<string, string[]>;
}
```

- `command[0]` is the top-level Command name.
- Remaining entries are positional arguments.
- Repeated options are preserved as arrays.
- A flag such as `--verbose` is represented as `"true"`.
- Unknown options are not rejected automatically.

For example:

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

Use the exported helpers when appropriate:

```ts
import {
  getNumberOption,
  getOptionValue,
  getOptionValues
} from "@divebell/cli";
```

Every Command must validate required arguments, accepted option names and
values, repeated-option behavior, and invalid combinations.

### Page context

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

`options.page` is recorded context from the latest successful `divebell open`.
`url` is the latest recorded URL, while `openedUrl` is the original URL passed
to `open`. `bridgeUrl` and `sessionId` may be null and do not prove that the
page uses Runtime SDK. Use `options.divebell.browser` when current page state
must be confirmed.

### Calling another Extension

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
```

```ts
interface CliExtensionRunFunction {
  <T = unknown>(
    extensionName: string,
    request: CliExtensionRunRequest
  ): Promise<T>;
}
```

`args` contains only positional arguments after the target Command name.
`options` accepts scalar values or arrays.

A nested Command shares the current page, session, Runtime selection, browser
access, and nested `runExtension` capability. It returns its raw result without
writing a second CLI result or triggering lifecycle Hooks.

A Command may call another Command in its own Extension without listing itself
in `requires`. Calls to another Extension must be declared through `requires`.
Cyclic calls and call chains deeper than 16 levels fail with the full call
chain.

### Loading feedback

```ts
interface CliExtensionLoadingFunction {
  <T>(run: () => T | PromiseLike<T>): Promise<T>;
}
```

Work that finishes within 400 milliseconds produces no animation. Slower work
shows one shared animation in an interactive terminal and clears it before the
final result or error. Nested and concurrent wrappers share the same animation.

### Command results and errors

Return the result directly on success. Divebell places it in the standard
output's `data` field; an implicit return becomes `data: null`.

Throw a clear error on failure. Divebell formats it as the standard error
output and returns a non-zero exit code.

## Hooks

```ts
interface DivebellExtensionHooks {
  open?: DivebellOpenHook | DivebellOrderedHook<DivebellOpenHook>;
  detectStack?:
    | DivebellDetectStackHook
    | DivebellOrderedHook<DivebellDetectStackHook>;
  close?(options: DivebellPageHookOptions): Promise<void>;
}
```

```ts
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
```

```ts
interface DivebellOrderedHook<Handler> {
  run: Handler;
  before?: readonly string[];
  after?: readonly string[];
}
```

Hooks without ordering relationships run in parallel. `before` and `after`
control order only; required Extensions belong in `requires`. A missing or
failed referenced Hook does not disable this Hook. Ordering cycles disable only
their participants, and Hook return values are not passed to later Hooks.

`close` has no independent ordering. It follows the reverse batch order of
`open`; Hooks that were parallel during `open` are also parallel during
`close`.

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

`headers` contains the effective `open --headers` value and may include
credentials or tokens, so protect the local Divebell state directory.
Initialization scripts from multiple Extensions are combined in Hook order and
isolated so one script failure does not block later scripts or Divebell's own
page setup. One failed Hook does not block the page or unrelated Extensions.

### `detectStack` and `close`

```ts
interface DivebellPageHookOptions {
  args: ParsedCliArgs;
  page: CliExtensionPageContext;
  divebell: DivebellExtensionApi;
}
```

```ts
interface DivebellStackDetection {
  id: string;
  name: string;
  version?: string;
  evidence?: readonly string[];
  command?: string;
}
```

`detectStack` may return one detection, multiple detections, or no result.
`command` must name a top-level Command from the same Extension.

`close` runs only for Extensions that successfully participated in the
matching `open`. It runs when that page is stopped or replaced by another
`open` in the same working directory.

Each Hook may run for up to five seconds. Timeout or failure is recorded for
that Extension and does not block unrelated Extensions or the page lifecycle.

## Divebell APIs

Use `options.divebell` as the main API.

### Browser capabilities

```text
browser.pageSnapshot
browser.click
browser.fill
browser.eval
browser.evalFile
browser.waitEval
browser.getWindow
browser.screenshot
browser.network
browser.console
browser.memory
browser.coverage
```

These capabilities do not require Runtime SDK.

### Existing Runtime capabilities

```text
targets
snapshot
events
actions
runAction
waitFor
```

An Extension may consume these APIs when the page already exposes a connected
Runtime.

Adding or changing page-side Runtime SDK integration belongs to the dedicated
`divebell-runtime` Skill.

The Coding Agent still owns source-code reading and changes. The Extension API
does not provide a general code workspace or development-server interface.
