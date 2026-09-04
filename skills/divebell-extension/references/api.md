# Extension API

Use this reference when exact Extension types or API boundaries are needed.

Import `DivebellExtensionDefinition`, `DivebellExtensionHooks`,
`CliExtensionRunOptions`, and `DivebellExtensionApi` from `@divebell/cli`.
Derive nested structures from those public parent types unless the CLI exports
the nested helper directly.

## Contents

- [Extension definition](#extension-definition)
- [Command definition](#command-definition)
- [Command options](#command-options)
- [Hooks](#hooks)
- [Divebell APIs](#divebell-apis)

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
  openedUrl?: string;
  scripts?: readonly string[];
  companionPages?: readonly DivebellOpenHookCompanionPage[];
  throttling?: {
    cpuRate?: number;
    network?: {
      latencyMs?: number;
      downloadKbps?: number;
      uploadKbps?: number;
    };
  };
}
```

`headers` contains the effective `open --headers` value and may include
credentials or tokens, so protect the local Divebell state directory.
Initialization scripts from multiple Extensions are combined in Hook order and
isolated so one script failure does not block later scripts or Divebell's own
page setup. One failed Hook does not block the page or unrelated Extensions.

Use `throttling` for low-end device or constrained-network verification that
must affect the initial page load. Divebell starts Chromium, applies the
declared CDP conditions, and only then navigates to `openedUrl`. `cpuRate` is a
slowdown factor, not a host CPU-core count. Network values use milliseconds and
decimal kilobits per second. The hook must declare `cpuRate >= 1` and/or at
least one non-negative network value. For an already-open page, use
`browser.throttling` instead.

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

### Extension Browser API

`options.divebell.browser` is an Extension host API injected by the Divebell
CLI. It is not a separate browser SDK that an Extension constructs or connects:
the Command or Hook already runs inside the CLI process that owns the current
browser context. The Runtime SDK is a different, optional page-side integration
for application-internal facts and actions; none of the browser APIs below
require it.

The authoritative signatures are the TypeScript declarations exported by
`@divebell/cli`. Import types from the package root, or inspect the exact
installed declarations at
`node_modules/@divebell/cli/dist/features/extension/types.d.ts`. Start with
`DivebellBrowserApi`, then follow the named option and result types. Do not infer
parameters from this summary or copy its prose into local type declarations.

```ts
import type {
  DivebellBrowserApi,
  DivebellBrowserNetworkApi,
  DivebellBrowserNetworkOptions,
  DivebellBrowserNetworkRequestDetail
} from "@divebell/cli";
```

#### Page and interaction APIs

| API | Purpose | Read these types |
| --- | --- | --- |
| `browser.profileDirectory` | Resolve the browser Profile directory without running a page command. | `DivebellBrowserApi` |
| `browser.pageSnapshot` | Read the current page's agent-oriented accessibility snapshot. | `DivebellBrowserApi` |
| `browser.click` | Click a selector or agent-browser element reference. | `DivebellBrowserApi` |
| `browser.fill` | Clear an input and fill it with a value. | `DivebellBrowserApi` |
| `browser.focus` | Focus an element without changing its value. | `DivebellBrowserApi` |
| `browser.press` | Send a keyboard key or key combination to the page. | `DivebellBrowserApi` |
| `browser.select` | Select one or several values in a form control. | `DivebellBrowserApi` |
| `browser.eval` | Evaluate JavaScript in the current page and return the parsed JSON value. | `DivebellBrowserApi` |
| `browser.evalFile` | Read a local JavaScript file and evaluate it in the current page. | `DivebellBrowserApi` |
| `browser.waitEval` | Poll a JavaScript condition until it succeeds or times out. | `DivebellBrowserApi`, `DivebellBrowserWaitEvalResult` |
| `browser.wait` | Wait for a fixed non-negative duration. | `DivebellBrowserApi` |
| `browser.getWindow` | Read a dot-separated value from `window` and return its parsed value. | `DivebellBrowserApi` |
| `browser.highlight` | Visually highlight a selector or element reference. | `DivebellBrowserApi` |
| `browser.screenshot` | Capture the current page and return the saved artifact path. | `DivebellBrowserApi`, `DivebellBrowserScreenshotOptions` |

#### Tab APIs

| API | Purpose | Read these types |
| --- | --- | --- |
| `browser.tabs.list` | List open tabs and identify the active tab. | `DivebellBrowserTabsApi`, `DivebellBrowserTab` |
| `browser.tabs.activate` | Make a tab the active page using its stable tab ID. | `DivebellBrowserTabsApi` |

#### Throttling APIs

| API | Purpose | Read these types |
| --- | --- | --- |
| `browser.throttling.cpu.set` | Apply a Chromium CPU slowdown factor to the active browser session. | `DivebellBrowserThrottlingApi`, `DivebellBrowserCpuThrottlingResult` |
| `browser.throttling.cpu.reset` | Restore the CPU slowdown factor to `1`. | `DivebellBrowserThrottlingApi`, `DivebellBrowserCpuThrottlingResult` |
| `browser.throttling.network.set` | Apply one or more network conditions to the active browser session. | `DivebellBrowserThrottlingApi`, `DivebellBrowserNetworkThrottlingOptions`, `DivebellBrowserNetworkThrottlingResult` |
| `browser.throttling.network.reset` | Restore online, zero-latency, unlimited network conditions. | `DivebellBrowserThrottlingApi`, `DivebellBrowserNetworkThrottlingResult` |

CPU `rate` is a Chromium slowdown factor: `4` simulates approximately four
times slower CPU execution. It is not a count of host CPU cores, so the
Extension API intentionally does not expose a `cores` or `cpuCount` field.

Network values use milliseconds for `latencyMs` and decimal kilobits per second
for `downloadKbps` and `uploadKbps`. `network.set` accepts partial updates;
provide at least one field. Its omitted fields preserve the existing browser
condition. Both CPU and network throttling are Chromium/CDP capabilities.

```ts
await options.divebell.browser.throttling.cpu.set(4);
await options.divebell.browser.throttling.network.set({
  latencyMs: 150,
  downloadKbps: 800,
  uploadKbps: 400
});

// Restore normal conditions after the measurement.
await options.divebell.browser.throttling.network.reset();
await options.divebell.browser.throttling.cpu.reset();
```

#### Network APIs

| API | Purpose | Read these types |
| --- | --- | --- |
| `browser.network.list` | List request summaries, optionally filtered by URL, resource type, method, or status. | `DivebellBrowserNetworkApi`, `DivebellBrowserNetworkOptions`, `DivebellBrowserNetworkRequestSummary` |
| `browser.network.get` | Read one request's request/response headers, bodies, status, and MIME type. | `DivebellBrowserNetworkApi`, `DivebellBrowserNetworkRequestDetail` |
| `browser.network.clear` | Clear the request history retained by agent-browser. | `DivebellBrowserNetworkApi` |
| `browser.network.route` | Intercept matching requests and abort them or provide a replacement body. | `DivebellBrowserNetworkApi`, `DivebellBrowserNetworkRouteOptions` |
| `browser.network.unroute` | Remove one matching route or all registered routes. | `DivebellBrowserNetworkApi` |
| `browser.network.har.start` | Start a HAR capture with the selected content policy. | `DivebellBrowserNetworkApi`, `DivebellBrowserHarStartOptions` |
| `browser.network.har.stop` | Stop HAR capture and return the saved artifact path. | `DivebellBrowserNetworkApi`, `DivebellBrowserArtifactResult` |

#### Console APIs

| API | Purpose | Read these types |
| --- | --- | --- |
| `browser.console.list` | Read Console entries with optional level, text, and count filters plus a level summary. | `DivebellBrowserConsoleApi`, `DivebellBrowserConsoleOptions`, `DivebellBrowserConsoleResult` |
| `browser.console.clear` | Clear the Console entries retained by agent-browser. | `DivebellBrowserConsoleApi` |

#### Debugger APIs

| API | Purpose | Read these types |
| --- | --- | --- |
| `browser.debug.status` | Inspect debugger state for one tab or all tabs. | `DivebellBrowserDebugApi`, `DivebellBrowserDebugStatusOptions`, `DivebellBrowserDebugStatusResult` |
| `browser.debug.enable` | Enable compiled-JavaScript debugging and return debugger session identities. | `DivebellBrowserDebugApi`, `DivebellBrowserDebugStatusOptions`, `DivebellBrowserDebugEnableResult` |
| `browser.debug.disable` | Disable debugging for the selected tab and optionally resume it first. | `DivebellBrowserDebugApi`, `DivebellBrowserDebugDisableOptions`, `DivebellBrowserDebugDisableResult` |
| `browser.debug.scripts` | List scripts observed by the selected debugger session. | `DivebellBrowserDebugApi`, `DivebellBrowserDebugScriptsOptions`, `DivebellBrowserDebugScript` |
| `browser.debug.source` | Read one script and its compiled source. | `DivebellBrowserDebugApi`, `DivebellBrowserDebugTargetOptions`, `DivebellBrowserDebugSourceResult` |
| `browser.debug.sourceSearch` | Search compiled script sources and return matching locations. | `DivebellBrowserDebugApi`, `DivebellBrowserDebugSourceSearchOptions`, `DivebellBrowserDebugSourceSearchResult` |
| `browser.debug.events` | Read buffered debugger events, optionally waiting for new events. | `DivebellBrowserDebugApi`, `DivebellBrowserDebugEventsOptions`, `DivebellBrowserDebugEventsResult` |
| `browser.debug.logpoints.set` | Install a logpoint with expressions, relocation controls, and tags. | `DivebellBrowserDebugApi`, `DivebellBrowserDebugLogpointSetOptions`, `DivebellBrowserDebugProbeResult` |
| `browser.debug.logpoints.list` | List installed logpoints. | `DivebellBrowserDebugApi`, `DivebellBrowserDebugProbeListResult` |
| `browser.debug.logpoints.remove` | Remove an installed logpoint by probe ID. | `DivebellBrowserDebugApi`, `DivebellBrowserDebugProbeRemoveResult` |
| `browser.debug.breakpoints.list` | List installed breakpoints. | `DivebellBrowserDebugApi`, `DivebellBrowserDebugProbeListResult` |

#### Memory APIs

| API | Purpose | Read these types |
| --- | --- | --- |
| `browser.memory.metrics` | Read current heap, document, DOM-node, and event-listener metrics. | `DivebellBrowserMemoryApi`, `DivebellBrowserMemoryMetricsOptions`, `DivebellBrowserMemoryMetricsResult` |
| `browser.memory.status` | Inspect whether a memory capture is active and obtain its identity. | `DivebellBrowserMemoryApi`, `DivebellBrowserMemoryStatusResult` |
| `browser.memory.sampling.start` | Start allocation sampling. | `DivebellBrowserMemoryApi`, `DivebellBrowserMemorySamplingStartOptions`, `DivebellBrowserMemoryCaptureResult` |
| `browser.memory.sampling.stop` | Stop allocation sampling and return its artifact and top functions. | `DivebellBrowserMemoryApi`, `DivebellBrowserMemorySamplingStopOptions`, `DivebellBrowserMemorySamplingStopResult` |
| `browser.memory.snapshot` | Capture a heap snapshot and return artifact metadata. | `DivebellBrowserMemoryApi`, `DivebellBrowserMemorySnapshotOptions`, `DivebellBrowserMemorySnapshotResult` |
| `browser.memory.collectGarbage` | Ask the browser to collect garbage before another measurement. | `DivebellBrowserMemoryApi` |
| `browser.memory.cancel` | Cancel the active memory capture. | `DivebellBrowserMemoryApi` |

#### Coverage APIs

| API | Purpose | Read these types |
| --- | --- | --- |
| `browser.coverage.status` | Inspect whether JavaScript coverage capture is active. | `DivebellBrowserCoverageApi`, `DivebellBrowserCoverageStatusResult` |
| `browser.coverage.start` | Start JavaScript coverage capture. | `DivebellBrowserCoverageApi`, `DivebellBrowserCoverageStartOptions`, `DivebellBrowserCoverageStatusResult` |
| `browser.coverage.take` | Save an intermediate coverage checkpoint without ending capture. | `DivebellBrowserCoverageApi`, `DivebellBrowserCoverageCheckpointOptions`, `DivebellBrowserCoverageCheckpointResult` |
| `browser.coverage.stop` | Save the final coverage checkpoint and end capture. | `DivebellBrowserCoverageApi`, `DivebellBrowserCoverageCheckpointOptions`, `DivebellBrowserCoverageCheckpointResult` |
| `browser.coverage.cancel` | Cancel the active coverage capture. | `DivebellBrowserCoverageApi` |

#### WebMCP APIs

| API | Purpose | Read these types |
| --- | --- | --- |
| `browser.webmcp.list` | List tools registered by the active WebMCP page, including schemas, annotations, frame IDs, and source. | `DivebellBrowserWebMcpApi`, `DivebellBrowserWebMcpListResult`, `DivebellBrowserWebMcpTool` |
| `browser.webmcp.call` | Call one registered tool with object input and optional frame/timeout selection. | `DivebellBrowserWebMcpApi`, `DivebellBrowserWebMcpCallOptions`, `DivebellBrowserWebMcpCallResult` |

Divebell enables the required experimental Chrome features by default when it
launches local Chrome. An external browser keeps its existing launch
configuration. If the selected browser does not expose WebMCP, `list` and
`call` throw a `WEBMCP_UNSUPPORTED` `CommandError` when used without affecting
ordinary page operations. Example:

```ts
const listed = await options.divebell.browser.webmcp.list();
const tool = listed.tools.find((item) => item.name === "searchProducts");
if (tool === undefined) throw new Error("searchProducts is unavailable");

const called = await options.divebell.browser.webmcp.call<{
  products: Array<{ name: string; price: string }>;
}>("searchProducts", { query: "Widget" }, {
  frameId: tool.frameId,
  timeout: 5000
});
```

`call<T>` types the optional `output` field but does not runtime-validate the
page's value. Every result includes `trust: "untrusted"`. Treat tool output as
potentially malicious page content and tool annotations as hints, not policy.

Typed APIs normalize browser failures and own their result contracts. For
example, `network.list` returns request summaries while `network.get` returns a
detail whose headers are under `request.headers` and `response.headers`:

```ts
const requests = await options.divebell.browser.network.list({
  url: "/api/orders",
  resourceTypes: ["xhr", "fetch"],
  status: "2xx"
});
const detail = await options.divebell.browser.network.get(requests[0].id);
const contentType = detail.response?.headers["content-type"];
```

#### Raw fallback

| API | Purpose | Read these types |
| --- | --- | --- |
| `browser.raw` | Run a bundled agent-browser command that has no typed Extension API and return its process result without asserting a command-specific payload type. | `DivebellBrowserApi`, `DivebellBrowserRawOptions`, `DivebellBrowserRawResult` |

`browser.raw` accepts agent-browser arguments directly and requires the current
browser context created by `divebell open`. It rejects browser lifecycle,
setup, and interactive commands owned by the outer Divebell workflow. It does
not apply Divebell command translation or turn output into a JavaScript value.
Use a typed API when one exists; otherwise read
[`browser-raw.md`](browser-raw.md), pass the documented agent-browser arguments
without the executable name, check `exitCode`, and parse `stdout` when
requesting JSON. The shared browser runner unwraps the agent-browser
`{ success, data, error }` JSON transport before `raw` returns.

```ts
const result = await options.divebell.browser.raw([
  "get", "cdp-url", "--json"
]);
if (result.exitCode !== 0) {
  throw new Error(result.stderr.trim() || result.stdout.trim());
}
const cdpTarget = JSON.parse(result.stdout) as unknown;
```

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
