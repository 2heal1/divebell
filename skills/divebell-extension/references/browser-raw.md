# `browser.raw` command reference

Read this reference before using `options.divebell.browser.raw`. Prefer a typed
browser API when it already exposes the required capability. `raw` is for a
bundled agent-browser command that has no typed Extension API.

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

## Discover raw subcommands

The generated list below declares the raw subcommands available from the
agent-browser bundled with Divebell and gives each one a short purpose. After
choosing a subcommand, inspect its complete installed help through `divebell
raw`:

```bash
divebell raw network --help
```

`divebell raw` forwards every argument after `raw` to Divebell's bundled
agent-browser executable. It is also useful for checking a raw command outside
an Extension. Inside an Extension, remove `divebell raw` and pass the remaining
tokens to `browser.raw`.

Convert an agent-browser example to `raw` by removing the `agent-browser`
executable and placing the remaining tokens in the `args` array. For example,
`agent-browser network request <requestId> --json` becomes:

```ts
await options.divebell.browser.raw([
  "network", "request", requestId, "--json"
]);
```

The generated list embeds syntax only when the bundled parser has no dedicated
`<command> --help`, or when the bundled documentation mentions a command the
parser does not actually expose. Do not guess flags from the one-line purpose.

Extension `browser.raw` operates only on the browser most recently opened by
`divebell open`. Its first argument must be a subcommand, not a top-level flag.
The outer Divebell workflow owns browser lifecycle, setup, and interactive
commands, so Extension Commands cannot invoke agent-browser `open`, `close`,
`connect`, `install`, `upgrade`, `doctor`, `mcp`, `chat`, or `dashboard`
through `browser.raw`. Authentication, saved state, providers, and plugins are
also workflow configuration rather than Extension-owned page operations unless
an Extension explicitly owns that integration and its authorization boundary.

The standalone `divebell raw` CLI is not subject to this Extension boundary.
Use it to inspect `divebell raw <command> --help` and to access the bundled
executable's complete command surface outside an Extension. The list below
therefore still includes commands that Extension `browser.raw` rejects.

<!-- BEGIN GENERATED AGENT-BROWSER REFERENCE -->

| Raw subcommand | Purpose | Exact help |
| --- | --- | --- |
| `skills` | List and retrieve bundled skill content | `divebell raw skills --help` |
| `open` | Launch the browser, optionally navigate | `divebell raw open --help` |
| `read` | Fetch a URL as agent-readable text | `divebell raw read --help` |
| `click` | Click an element | `divebell raw click --help` |
| `dblclick` | Double-click an element | `divebell raw dblclick --help` |
| `type` | Type text into an element | `divebell raw type --help` |
| `fill` | Clear and fill an input field | `divebell raw fill --help` |
| `press` | Press a key or key combination | `divebell raw press --help` |
| `keyboard` | Raw keyboard input (no selector needed) | `divebell raw keyboard --help` |
| `hover` | Hover over an element | `divebell raw hover --help` |
| `focus` | Focus an element | `divebell raw focus --help` |
| `check` | Check a checkbox | `divebell raw check --help` |
| `uncheck` | Uncheck a checkbox | `divebell raw uncheck --help` |
| `select` | Select a dropdown option | `divebell raw select --help` |
| `drag` | Drag and drop | `divebell raw drag --help` |
| `upload` | Upload files | `divebell raw upload --help` |
| `download` | Download a file by clicking an element | `divebell raw download --help` |
| `scroll` | Scroll the page | `divebell raw scroll --help` |
| `scrollintoview` | Scroll element into view | `divebell raw scrollintoview --help` |
| `wait` | Wait for condition | `divebell raw wait --help` |
| `screenshot` | Take a screenshot | `divebell raw screenshot --help` |
| `pdf` | Save page as PDF | `divebell raw pdf --help` |
| `snapshot` | Get accessibility tree snapshot | `divebell raw snapshot --help` |
| `eval` | Execute JavaScript | `divebell raw eval --help` |
| `connect` | Connect to browser via CDP | `divebell raw connect --help` |
| `close` | Close the browser | `divebell raw close --help` |
| `back` | Navigate back in history | `divebell raw back --help` |
| `forward` | Navigate forward in history | `divebell raw forward --help` |
| `reload` | Reload the current page | `divebell raw reload --help` |
| `get` | Retrieve information from elements or page | `divebell raw get --help` |
| `is` | Check element state | `divebell raw is --help` |
| `find` | Find and interact with elements by locator | `divebell raw find --help` |
| `mouse` | Low-level mouse operations | `divebell raw mouse --help` |
| `set` | Configure browser settings | `divebell raw set --help` |
| `network` | Network interception and monitoring | `divebell raw network --help` |
| `cookies` | Manage browser cookies | `divebell raw cookies --help` |
| `storage` | Manage web storage | `divebell raw storage --help` |
| `tab` | Manage browser tabs | `divebell raw tab --help` |
| `diff` | Compare page states | `divebell raw diff --help` |
| `trace` | Record execution trace | `divebell raw trace --help` |
| `profiler` | Record Chrome DevTools performance profile | `divebell raw profiler --help` |
| `memory` | Capture page memory evidence | `divebell raw memory --help` |
| `coverage` | Record JavaScript code execution | `divebell raw coverage --help` |
| `debug` | Debug compiled JavaScript in Chrome | `divebell raw debug --help` |
| `record` | Record browser session to video | `divebell raw record --help` |
| `console` | View console logs | `divebell raw console --help` |
| `errors` | View page errors | `divebell raw errors --help` |
| `highlight` | Highlight an element | `divebell raw highlight --help` |
| `inspect` | Open Chrome DevTools for the active page | `divebell raw inspect --help` |
| `clipboard` | Read and write clipboard | `divebell raw clipboard --help` |
| `stream` | Manage live WebSocket browser streaming | `divebell raw stream --help` |
| `react` | Full React component tree (depth id parent name columns) | Special syntax below |
| `vitals` | Core Web Vitals (LCP/CLS/TTFB/FCP/INP) | Special syntax below |
| `a11y` | Run an axe-core accessibility audit | `divebell raw a11y --help` |
| `pushstate` | SPA client-side nav. Auto-detects window.next.router.push | Special syntax below |
| `removeinitscript` | Remove a script registered via --init-script or addinitscript | Special syntax below |
| `batch` | Execute multiple commands sequentially | `divebell raw batch --help` |
| `auth` | Manage authentication profiles | `divebell raw auth --help` |
| `plugin` | Manage configured plugins | `divebell raw plugin --help` |
| `confirm` | Approve or deny pending actions | `divebell raw confirm --help` |
| `deny` | Approve or deny pending actions | `divebell raw deny --help` |
| `session` | Manage sessions | `divebell raw session --help` |
| `mcp` | Start an MCP stdio server | `divebell raw mcp --help` |
| `chat` | Natural language browser control via AI | `divebell raw chat --help` |
| `dashboard` | Observability dashboard | `divebell raw dashboard --help` |
| `install` | Install browser binaries | `divebell raw install --help` |
| `upgrade` | Upgrade to the latest version | `divebell raw upgrade --help` |
| `doctor` | Diagnose and repair your install | `divebell raw doctor --help` |
| `profiles` | List available Chrome profiles | `divebell raw profiles --help` |
| `keydown` | Press a key down (without release) | `divebell raw keydown --help` |
| `keyup` | Release a key | `divebell raw keyup --help` |
| `window` | Manage browser windows | `divebell raw window --help` |
| `frame` | Switch frame context | `divebell raw frame --help` |
| `dialog` | Handle browser dialogs | `divebell raw dialog --help` |
| `state` | Manage browser state | `divebell raw state --help` |
| `device` | Manage iOS simulators | `divebell raw device --help` |
| `tap` | Tap an element (touch gesture) | `divebell raw tap --help` |
| `swipe` | Swipe gesture (iOS) | `divebell raw swipe --help` |

### Subcommands without dedicated help

#### `react`

The bundled agent-browser has no dedicated subcommand help. Use one of the
top-level forms captured from the installed parser:

```text
react tree                 Full React component tree (depth id parent name columns)
react inspect <id>         Inspect one fiber (props, hooks, state, source)
react renders start        Start recording re-renders via onCommitFiberRoot
react renders stop [--json] Stop and print render profile
react suspense [--only-dynamic] [--json]
Walk Suspense boundaries + classifier report
--only-dynamic hides the "static" list
```

Pass the chosen form without `agent-browser`, for example `options.divebell.browser.raw(["react", ...args])`.

#### `vitals`

The bundled agent-browser has no dedicated subcommand help. Use one of the
top-level forms captured from the installed parser:

```text
vitals [url] [--json]      Core Web Vitals (LCP/CLS/TTFB/FCP/INP) +
React hydration summary; --json returns full data
```

Pass the chosen form without `agent-browser`, for example `options.divebell.browser.raw(["vitals", ...args])`.

#### `pushstate`

The bundled agent-browser has no dedicated subcommand help. Use one of the
top-level forms captured from the installed parser:

```text
pushstate <url>            SPA client-side nav. Auto-detects window.next.router.push
(triggers RSC fetch on Next.js); falls back to
history.pushState + popstate/navigate events for other frameworks
```

Pass the chosen form without `agent-browser`, for example `options.divebell.browser.raw(["pushstate", ...args])`.

#### `removeinitscript`

The bundled agent-browser has no dedicated subcommand help. Use one of the
top-level forms captured from the installed parser:

```text
removeinitscript <id>      Remove a script registered via --init-script or addinitscript
```

Pass the chosen form without `agent-browser`, for example `options.divebell.browser.raw(["removeinitscript", ...args])`.

### Documented upstream but unavailable

- `addinitscript` appears in the bundled agent-browser documentation, but its parser does not declare it or provide command help. Do not use it through `browser.raw`.
- `navigate` appears in the bundled agent-browser documentation, but its parser does not declare it or provide command help. Do not use it through `browser.raw`.


<!-- END GENERATED AGENT-BROWSER REFERENCE -->

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
