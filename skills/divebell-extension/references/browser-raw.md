# `browser.raw` command reference

Read this reference before using `options.divebell.browser.raw`. Prefer a typed
browser API when it already exposes the required capability. `raw` is for a
version-matched agent-browser command that has no typed Extension API.

## Call and transport result

The public Extension types are exported by `@divebell/cli`:

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

interface DivebellBrowserApi {
  raw(
    args: readonly string[],
    options?: DivebellBrowserRawOptions
  ): Promise<DivebellBrowserRawResult>;
}
```

`options.input` is written to the command's standard input, for example with
`["eval", "--stdin"]`. `options.ui: true` runs the command with headed browser
mode enabled; omit it unless visible UI is required.

Pass the agent-browser command tokens without the executable name:

```ts
const result = await options.divebell.browser.raw([
  "debug", "status", "--json"
]);
```

Always check `exitCode`. `raw` returns failures instead of throwing them:

```ts
if (result.exitCode !== 0) {
  throw new Error(
    result.stderr.trim() || result.stdout.trim() || "Browser command failed."
  );
}
```

`raw` does not turn command output into a JavaScript value. Without `--json`,
`stdout` contains the command's text output. With `--json`, the shared browser
runner removes agent-browser's outer `{ success, data, error }` transport
envelope. On success, `stdout` is the JSON serialization of `data`, followed by
a newline. If `data` is absent, `stdout` is empty.

```ts
const value: unknown = result.stdout.trim().length === 0
  ? undefined
  : JSON.parse(result.stdout);
```

On a structured agent-browser failure, `exitCode` is non-zero and `stderr`
contains the error message. When agent-browser supplies a stable `errorCode`,
`stdout` contains `{ "errorCode": string, "error": string }`; otherwise it is
empty. Do not parse `--help`, `--version`, or Skill output as JSON.

## Command-specific results

The command catalog below is the exact syntax reference shipped by the pinned
agent-browser dependency. Its examples use shell notation because that is the
most compact grammar. Convert a command by removing `agent-browser` and putting
the remaining tokens in the `args` array.

For a command that supports `--json`, the command-specific result is the
documented agent-browser `data` object, not the outer agent-browser response.
Keep the parsed value as `unknown` until it is checked. If an Extension must
depend on fields, declare and validate the smallest local shape it consumes:

```ts
interface TabListResult {
  tabs: Array<{
    tabId: string;
    url?: string;
    label?: string;
    active?: boolean;
  }>;
}

function isTabListResult(value: unknown): value is TabListResult {
  if (typeof value !== "object" || value === null) return false;
  const tabs = (value as { tabs?: unknown }).tabs;
  return Array.isArray(tabs) && tabs.every((tab) =>
    typeof tab === "object" &&
    tab !== null &&
    typeof (tab as { tabId?: unknown }).tabId === "string"
  );
}

const listed = await options.divebell.browser.raw(["tab", "--json"]);
if (listed.exitCode !== 0) {
  throw new Error(listed.stderr.trim() || listed.stdout.trim());
}
const parsed: unknown = JSON.parse(listed.stdout);
if (!isTabListResult(parsed)) {
  throw new Error("agent-browser returned an invalid tab list.");
}
```

Do not add a caller-selected `raw<T>()` generic: it would assert a type without
checking the process output. When a command-specific structure becomes a
shared, stable dependency, add a typed `browser` API that parses and validates
it.

The outer Divebell workflow owns browser creation, replacement, and shutdown.
Extension Commands must not invoke agent-browser `open`, `close`, `install`,
`upgrade`, `doctor`, `mcp`, `chat`, or `dashboard` through `raw`. Authentication,
saved state, providers, and plugins are also workflow configuration rather than
Extension-owned page operations unless an Extension explicitly owns that
integration and its authorization boundary.

## Updating the pinned agent-browser version

From the Divebell repository root, pass the exact published version:

```bash
pnpm run update:agent-browser -- 0.35.0-divebell.1
```

The script pins `packages/cli` to that exact version, updates the lockfile,
discovers commands from the newly installed package, regenerates this index and
every `browser-raw/*.md` command file, removes stale generated files, and runs
the reference, script, CLI, and lint checks. Commit the dependency, lockfile,
and generated Skill changes together.

Use `--no-verify` only for a local iteration. It still installs the package and
regenerates the Skill reference, but skips the slower checks. Run the command
again without that flag before merging.

## Version-matched command catalog

<!-- BEGIN GENERATED AGENT-BROWSER REFERENCE -->

Installed source: `@divebell/agent-browser@0.34.0-divebell.2`.

The command files are generated from the exact agent-browser dependency
used by `@divebell/cli`. Do not edit them by hand.

- [Top-level catalog and extended upstream reference](browser-raw/catalog.md)
- [`skills`](browser-raw/skills.md)
- [`open`](browser-raw/open.md)
- [`read`](browser-raw/read.md)
- [`click`](browser-raw/click.md)
- [`dblclick`](browser-raw/dblclick.md)
- [`type`](browser-raw/type.md)
- [`fill`](browser-raw/fill.md)
- [`press`](browser-raw/press.md)
- [`keyboard`](browser-raw/keyboard.md)
- [`hover`](browser-raw/hover.md)
- [`focus`](browser-raw/focus.md)
- [`check`](browser-raw/check.md)
- [`uncheck`](browser-raw/uncheck.md)
- [`select`](browser-raw/select.md)
- [`drag`](browser-raw/drag.md)
- [`upload`](browser-raw/upload.md)
- [`download`](browser-raw/download.md)
- [`scroll`](browser-raw/scroll.md)
- [`scrollintoview`](browser-raw/scrollintoview.md)
- [`wait`](browser-raw/wait.md)
- [`screenshot`](browser-raw/screenshot.md)
- [`pdf`](browser-raw/pdf.md)
- [`snapshot`](browser-raw/snapshot.md)
- [`eval`](browser-raw/eval.md)
- [`connect`](browser-raw/connect.md)
- [`close`](browser-raw/close.md)
- [`back`](browser-raw/back.md)
- [`forward`](browser-raw/forward.md)
- [`reload`](browser-raw/reload.md)
- [`get`](browser-raw/get.md)
- [`is`](browser-raw/is.md)
- [`find`](browser-raw/find.md)
- [`mouse`](browser-raw/mouse.md)
- [`set`](browser-raw/set.md)
- [`network`](browser-raw/network.md)
- [`cookies`](browser-raw/cookies.md)
- [`storage`](browser-raw/storage.md)
- [`tab`](browser-raw/tab.md)
- [`diff`](browser-raw/diff.md)
- [`trace`](browser-raw/trace.md)
- [`profiler`](browser-raw/profiler.md)
- [`memory`](browser-raw/memory.md)
- [`coverage`](browser-raw/coverage.md)
- [`debug`](browser-raw/debug.md)
- [`record`](browser-raw/record.md)
- [`console`](browser-raw/console.md)
- [`errors`](browser-raw/errors.md)
- [`highlight`](browser-raw/highlight.md)
- [`inspect`](browser-raw/inspect.md)
- [`clipboard`](browser-raw/clipboard.md)
- [`stream`](browser-raw/stream.md)
- [`react`](browser-raw/react.md)
- [`vitals`](browser-raw/vitals.md)
- [`a11y`](browser-raw/a11y.md)
- [`pushstate`](browser-raw/pushstate.md)
- [`removeinitscript`](browser-raw/removeinitscript.md)
- [`batch`](browser-raw/batch.md)
- [`auth`](browser-raw/auth.md)
- [`plugin`](browser-raw/plugin.md)
- [`confirm`](browser-raw/confirm.md)
- [`deny`](browser-raw/deny.md)
- [`session`](browser-raw/session.md)
- [`mcp`](browser-raw/mcp.md)
- [`chat`](browser-raw/chat.md)
- [`dashboard`](browser-raw/dashboard.md)
- [`install`](browser-raw/install.md)
- [`upgrade`](browser-raw/upgrade.md)
- [`doctor`](browser-raw/doctor.md)
- [`profiles`](browser-raw/profiles.md)
- [`keydown`](browser-raw/keydown.md)
- [`keyup`](browser-raw/keyup.md)
- [`window`](browser-raw/window.md)
- [`frame`](browser-raw/frame.md)
- [`dialog`](browser-raw/dialog.md)
- [`state`](browser-raw/state.md)
- [`device`](browser-raw/device.md)
- [`tap`](browser-raw/tap.md)
- [`swipe`](browser-raw/swipe.md)

<!-- END GENERATED AGENT-BROWSER REFERENCE -->
