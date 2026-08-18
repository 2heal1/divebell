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

## Discover commands and exact syntax

The generated catalog below lists the commands in the pinned agent-browser
dependency and gives each one a short purpose. After choosing a command, ask
the installed Divebell CLI for that version's complete help:

```bash
divebell browser-help network
```

For browser commands that Divebell also exposes directly, such as `network`,
`divebell network --help` includes the same installed agent-browser help after
the Divebell-specific usage. `browser-help` is the universal form: use it for
raw-only commands and names such as `snapshot` that mean something different
to the public Divebell CLI.

Convert an agent-browser example to `raw` by removing the `agent-browser`
executable and placing the remaining tokens in the `args` array. For example,
`agent-browser network request <requestId> --json` becomes:

```ts
await options.divebell.browser.raw([
  "network", "request", requestId, "--json"
]);
```

The catalog embeds syntax only when the pinned parser has no dedicated
`<command> --help`, or when bundled Markdown mentions a command the parser does
not actually expose. Do not guess flags from the one-line catalog summary.

## Command-specific results

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
the compact `browser-raw/catalog.md`, removes stale generated files, and runs
the reference, script, CLI, and lint checks. Commit the dependency, lockfile,
and generated Skill changes together.

Use `--no-verify` only for a local iteration. It still installs the package and
regenerates the Skill reference, but skips the slower checks. Run the command
again without that flag before merging.

## Version-matched command catalog

<!-- BEGIN GENERATED AGENT-BROWSER REFERENCE -->

Installed source: `@divebell/agent-browser@0.34.0-divebell.2`.

The compact catalog is generated from the exact agent-browser dependency
used by `@divebell/cli`. Get exact syntax at runtime with
`divebell browser-help <command>`.

- [Compact command catalog and special cases](browser-raw/catalog.md)

<!-- END GENERATED AGENT-BROWSER REFERENCE -->
