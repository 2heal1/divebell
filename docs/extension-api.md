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
  browserProxyProvider?: DivebellBrowserProxyProvider;
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
| `browserProxyProvider` | Optional structured conditional-proxy provider, selected by `divebell open --proxy-provider <extension-name>`. |
| `commands` | Commands registered by this Extension. Command names must not conflict with built-in commands or commands from other Extensions. |
| `hooks` | The `open`, `detectStack`, and `close` hooks. |

A definition must contain at least one Command, Hook, or `browserProxyProvider`. Divebell checks `requires` when it loads the Extension list. A missing dependency prevents that Extension from loading and reports which Extension must be installed. TypeScript entries should normally be annotated as `DivebellExtensionDefinition`. If declaration files are not generated, `satisfies DivebellExtensionDefinition` is also suitable. Tests and CI may call `validateExtension(...)` on the default export.

### `browserProxyProvider`

An Extension may expose one structured provider for conditional Chromium proxy configuration:

```ts
interface DivebellBrowserProxyProvider {
  resolve(options: DivebellOpenHookOptions): Promise<BrowserProxyDescriptor | void>;
}
```

The provider runs only when the caller selects its Extension name through
`divebell open --proxy-provider <extension-name>`. It returns endpoint and PAC
matching data, never a shell command. `resolve` must return already-running,
ready endpoints and should remain a pure description operation: this API has no
lifecycle or cleanup callback, so Divebell neither starts nor releases provider
resources. Divebell validates that endpoints are credential-free HTTP(S) or
SOCKS URLs with explicit ports, generates and hosts the PAC itself, and applies
it only to a Divebell-launched Chromium browser at launch time. See [Browser
network control and conditional proxy](browser-network-control.md) for the
exact descriptor shape, error codes, and scope.

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
  stdout?: { columns?: number; write(chunk: string): void };
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
| `options.stdout` | `CommandOutputWriter \| undefined` | Output for a directly invoked top-level Extension Command. When the Command writes to it, that output becomes the complete successful stdout and the standard JSON envelope is suppressed. It is `undefined` for nested `options.runExtension` calls, which always receive the structured return value. Write only after command work has succeeded to avoid partial output before an error. |
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

Return the result directly when a Command succeeds. The CLI places it in the
`data` field of the standard successful output. If the Command has no explicit
return value, `data` is `null`. A top-level Command may instead write an
explicit human-readable view to `options.stdout`; nested Commands do not
receive this writer and continue to receive the structured result object.

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
  command?: string;
}
```

`detectStack` runs only for `divebell stack` and may return one detection,
multiple detections, or no result. `command` must name a top-level command
registered by the current Extension; omit it when there is no follow-up
command. Keep detections compact. Put detector-specific diagnostics and
configuration behind the Extension command rather than in the stack result.
Fields outside the detection interface are dropped from the public result.
Do not include full page configuration, source text, credentials, signed URLs,
or other sensitive values in `evidence`.

`close` runs only for Extensions that successfully participated in the matching `open`. It runs when that page is stopped or replaced by another `open` in the same working directory. Cleanup failures are reported but do not prevent the page lifecycle from continuing.

Each hook may run for up to five seconds. A timeout is recorded as a hook failure for that Extension and does not block other Extensions.

## `DivebellExtensionApi`

Commands and page hooks use `options.divebell` as the primary entry point to Divebell capabilities.

### Extension Browser API

`options.divebell.browser` is injected by the Divebell CLI into an Extension
Command or Hook. There is no separate browser SDK to construct: the Extension
already runs inside the CLI host that owns the browser context. This host API is
also independent of the optional, page-side Runtime SDK.

The exact signatures are exported from `@divebell/cli`. Import the types from
the package root or inspect the installed
`node_modules/@divebell/cli/dist/features/extension/types.d.ts`; begin with
`DivebellBrowserApi` and follow the option and result types named below.

| API | Purpose | Primary types |
| --- | --- | --- |
| `browser.profileDirectory` | Resolve the browser Profile directory without running a page command. | `DivebellBrowserApi` |
| `browser.pageSnapshot` | Read the page's agent-oriented accessibility snapshot. | `DivebellBrowserApi` |
| `browser.click` | Click a selector or element reference. | `DivebellBrowserApi` |
| `browser.fill` | Clear and fill an input. | `DivebellBrowserApi` |
| `browser.focus` | Focus an element. | `DivebellBrowserApi` |
| `browser.press` | Send a key or key combination. | `DivebellBrowserApi` |
| `browser.select` | Select one or several form values. | `DivebellBrowserApi` |
| `browser.eval` | Evaluate page JavaScript and return its parsed JSON value. | `DivebellBrowserApi` |
| `browser.evalFile` | Evaluate JavaScript read from a local file. | `DivebellBrowserApi` |
| `browser.waitEval` | Poll a page condition until success or timeout. | `DivebellBrowserApi`, `DivebellBrowserWaitEvalResult` |
| `browser.wait` | Wait for a fixed non-negative duration. | `DivebellBrowserApi` |
| `browser.getWindow` | Read a dot-separated value from `window`. | `DivebellBrowserApi` |
| `browser.highlight` | Visually highlight a selector or element reference. | `DivebellBrowserApi` |
| `browser.screenshot` | Capture the page and return the artifact path. | `DivebellBrowserApi`, `DivebellBrowserScreenshotOptions` |
| `browser.tabs.list` | List open tabs and identify the active tab. | `DivebellBrowserTabsApi`, `DivebellBrowserTab` |
| `browser.tabs.activate` | Make a tab the active page using its stable tab ID. | `DivebellBrowserTabsApi` |
| `browser.network.list` | List optionally filtered request summaries. | `DivebellBrowserNetworkApi`, `DivebellBrowserNetworkOptions`, `DivebellBrowserNetworkRequestSummary` |
| `browser.network.get` | Read one request's headers, bodies, status, and MIME type. | `DivebellBrowserNetworkApi`, `DivebellBrowserNetworkRequestDetail` |
| `browser.network.clear` | Clear retained request history. | `DivebellBrowserNetworkApi` |
| `browser.network.route` | Abort matching requests or replace their body. | `DivebellBrowserNetworkApi`, `DivebellBrowserNetworkRouteOptions` |
| `browser.network.unroute` | Remove one matching route or all routes. | `DivebellBrowserNetworkApi` |
| `browser.network.har.start` | Start HAR capture. | `DivebellBrowserNetworkApi`, `DivebellBrowserHarStartOptions` |
| `browser.network.har.stop` | Stop HAR capture and return its artifact path. | `DivebellBrowserNetworkApi`, `DivebellBrowserArtifactResult` |
| `browser.console.list` | Read filtered Console entries and a level summary. | `DivebellBrowserConsoleApi`, `DivebellBrowserConsoleOptions`, `DivebellBrowserConsoleResult` |
| `browser.console.clear` | Clear retained Console entries. | `DivebellBrowserConsoleApi` |
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
| `browser.memory.metrics` | Read current heap and DOM-related metrics. | `DivebellBrowserMemoryApi`, `DivebellBrowserMemoryMetricsOptions`, `DivebellBrowserMemoryMetricsResult` |
| `browser.memory.status` | Inspect the active memory capture. | `DivebellBrowserMemoryApi`, `DivebellBrowserMemoryStatusResult` |
| `browser.memory.sampling.start` | Start allocation sampling. | `DivebellBrowserMemoryApi`, `DivebellBrowserMemorySamplingStartOptions`, `DivebellBrowserMemoryCaptureResult` |
| `browser.memory.sampling.stop` | Stop allocation sampling and return its artifact. | `DivebellBrowserMemoryApi`, `DivebellBrowserMemorySamplingStopOptions`, `DivebellBrowserMemorySamplingStopResult` |
| `browser.memory.snapshot` | Capture a heap snapshot. | `DivebellBrowserMemoryApi`, `DivebellBrowserMemorySnapshotOptions`, `DivebellBrowserMemorySnapshotResult` |
| `browser.memory.collectGarbage` | Ask the browser to collect garbage. | `DivebellBrowserMemoryApi` |
| `browser.memory.cancel` | Cancel the active memory capture. | `DivebellBrowserMemoryApi` |
| `browser.coverage.status` | Inspect the active JavaScript coverage capture. | `DivebellBrowserCoverageApi`, `DivebellBrowserCoverageStatusResult` |
| `browser.coverage.start` | Start JavaScript coverage capture. | `DivebellBrowserCoverageApi`, `DivebellBrowserCoverageStartOptions` |
| `browser.coverage.take` | Save an intermediate coverage checkpoint. | `DivebellBrowserCoverageApi`, `DivebellBrowserCoverageCheckpointOptions`, `DivebellBrowserCoverageCheckpointResult` |
| `browser.coverage.stop` | Save the final checkpoint and stop coverage. | `DivebellBrowserCoverageApi`, `DivebellBrowserCoverageCheckpointOptions`, `DivebellBrowserCoverageCheckpointResult` |
| `browser.coverage.cancel` | Cancel the active coverage capture. | `DivebellBrowserCoverageApi` |
| `browser.webmcp.list` | List WebMCP tools registered by the active page. | `DivebellBrowserWebMcpApi`, `DivebellBrowserWebMcpListResult`, `DivebellBrowserWebMcpTool` |
| `browser.webmcp.call` | Call a registered WebMCP tool with typed input and result output. | `DivebellBrowserWebMcpApi`, `DivebellBrowserWebMcpCallOptions`, `DivebellBrowserWebMcpCallResult` |
| `browser.raw` | Run an installed agent-browser command without asserting a command-specific payload type. | `DivebellBrowserApi`, `DivebellBrowserRawOptions`, `DivebellBrowserRawResult` |

Page operations and diagnostics under `browser` remain available when the page does not use Runtime SDK. Require a connected Runtime only when a Command truly needs application-internal state.

Typed APIs own their result contracts, normalize browser failures, and perform
any required parsing or target normalization. Prefer them whenever the needed
capability exists. Network access is structured rather than terminal text:

```ts
const requests = await divebell.browser.network.list({
  url: "/api/orders",
  resourceTypes: ["xhr", "fetch"],
  status: "2xx"
});
const detail = await divebell.browser.network.get(requests[0].id);
const contentType = detail.response?.headers["content-type"];
```

`browser.network` also provides `clear`, `route`, `unroute`, and `har`.
`browser.console` provides `list` and `clear`. Memory and Coverage expose
concrete result types rather than caller-selected generic types.
`browser.webmcp` provides typed tool discovery and invocation without
`browser.raw`; see [WebMCP](webmcp.md) for usage, Chrome compatibility, result
typing, and trust boundaries.

When no typed API exposes the required capability, `browser.raw` accepts
agent-browser arguments directly:

```ts
interface DivebellBrowserRawOptions {
  ui?: boolean;
  input?: string;
}

interface DivebellBrowserRawResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const result = await divebell.browser.raw(
  ["get", "cdp-url", "--json"]
);
if (result.exitCode !== 0) {
  throw new Error(result.stderr.trim() || result.stdout.trim());
}
const cdpTarget = JSON.parse(result.stdout) as unknown;
```

`raw` requires the current browser context created by `divebell open` and
rejects browser lifecycle, setup, and interactive commands owned by the outer
Divebell workflow. It does not add command translation or a parsed JavaScript
return value. The shared browser runner does unwrap agent-browser's
`{ success, data, error }` transport for `--json`; successful `stdout` contains
the serialized `data`. The caller still checks `exitCode` and validates the
command-specific payload. Read the
[raw command reference](../skills/divebell-extension/references/browser-raw.md)
for the available subcommands, special cases, and installed CLI help flow. The
standalone `divebell raw` CLI retains the bundled executable's complete command
surface and is not subject to the Extension boundary.

### Debugger identity and selection

Extensions that use the compiled-JavaScript debugger must obtain debugger IDs
from the debugger command output; `options.page` does not contain them. Enabling
without a selector targets the active tab and returns its debugger identity.
Retain the mapping returned in `sessions`:

```ts
import type { DivebellBrowserDebugEnableResult } from "@divebell/cli";

const enabled: DivebellBrowserDebugEnableResult =
  await divebell.browser.debug.enable();
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
| debugger `sessions[].tabId` | Stable agent-browser tab selector, such as `t1` | Preferred selector for follow-up `browser.debug` calls |
| debugger `scriptId` | Chrome's script ID within one document and CDP session | Use only with the matching debugger session and document generation |
| debugger `scriptInstanceKey` | Script identity including connection generation, CDP session, document generation, and script ID | Retain when a probe must distinguish navigation or reconnect generations |

For a follow-up command, pass the returned `tabId` as the `tab` option:

```ts
const selected = enabled.sessions[0];
if (selected?.tabId === undefined) {
  throw new Error("No debugger tab is available for the current page.");
}

const scripts = await divebell.browser.debug.scripts({ tab: selected.tabId });
```

Do not forward a debugger CDP `sessionId` as a generic `session` option. That
name is also used by agent-browser process routing and can select the wrong
daemon. A bare `scriptId` is likewise not stable across navigation or browser
reconnection; use the returned script identity fields together.

Debugger operations use Typed APIs, so browser failures and JSON parsing are
normalized by Divebell. The Extension must still retain the correct debugger
identifiers and avoid mixing IDs from different namespaces or navigations.

The Coding Agent remains responsible for reading and changing project source code. The Extension API does not provide a standardized code workspace or development-server interface. Do not present an Extension's own file access as a general Divebell code capability.
