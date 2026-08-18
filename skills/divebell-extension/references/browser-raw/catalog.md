# agent-browser raw command catalog

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

This file is an index, not a copy of the full CLI manual. Select a command
here, then run `divebell browser-help <command>` to read exact syntax from
the agent-browser version bundled with the installed Divebell CLI. Pass the
resulting command tokens to `browser.raw` without the executable name.

## Commands

| Command | Purpose | Exact syntax |
| --- | --- | --- |
| `skills` | List and retrieve bundled skill content | `divebell browser-help skills` |
| `open` | Launch the browser, optionally navigate | `divebell browser-help open` |
| `read` | Fetch a URL as agent-readable text | `divebell browser-help read` |
| `click` | Click an element | `divebell browser-help click` |
| `dblclick` | Double-click an element | `divebell browser-help dblclick` |
| `type` | Type text into an element | `divebell browser-help type` |
| `fill` | Clear and fill an input field | `divebell browser-help fill` |
| `press` | Press a key or key combination | `divebell browser-help press` |
| `keyboard` | Raw keyboard input (no selector needed) | `divebell browser-help keyboard` |
| `hover` | Hover over an element | `divebell browser-help hover` |
| `focus` | Focus an element | `divebell browser-help focus` |
| `check` | Check a checkbox | `divebell browser-help check` |
| `uncheck` | Uncheck a checkbox | `divebell browser-help uncheck` |
| `select` | Select a dropdown option | `divebell browser-help select` |
| `drag` | Drag and drop | `divebell browser-help drag` |
| `upload` | Upload files | `divebell browser-help upload` |
| `download` | Download a file by clicking an element | `divebell browser-help download` |
| `scroll` | Scroll the page | `divebell browser-help scroll` |
| `scrollintoview` | Scroll element into view | `divebell browser-help scrollintoview` |
| `wait` | Wait for condition | `divebell browser-help wait` |
| `screenshot` | Take a screenshot | `divebell browser-help screenshot` |
| `pdf` | Save page as PDF | `divebell browser-help pdf` |
| `snapshot` | Get accessibility tree snapshot | `divebell browser-help snapshot` |
| `eval` | Execute JavaScript | `divebell browser-help eval` |
| `connect` | Connect to browser via CDP | `divebell browser-help connect` |
| `close` | Close the browser | `divebell browser-help close` |
| `back` | Navigate back in history | `divebell browser-help back` |
| `forward` | Navigate forward in history | `divebell browser-help forward` |
| `reload` | Reload the current page | `divebell browser-help reload` |
| `get` | Retrieve information from elements or page | `divebell browser-help get` |
| `is` | Check element state | `divebell browser-help is` |
| `find` | Find and interact with elements by locator | `divebell browser-help find` |
| `mouse` | Low-level mouse operations | `divebell browser-help mouse` |
| `set` | Configure browser settings | `divebell browser-help set` |
| `network` | Network interception and monitoring | `divebell browser-help network` |
| `cookies` | Manage browser cookies | `divebell browser-help cookies` |
| `storage` | Manage web storage | `divebell browser-help storage` |
| `tab` | Manage browser tabs | `divebell browser-help tab` |
| `diff` | Compare page states | `divebell browser-help diff` |
| `trace` | Record execution trace | `divebell browser-help trace` |
| `profiler` | Record Chrome DevTools performance profile | `divebell browser-help profiler` |
| `memory` | Capture page memory evidence | `divebell browser-help memory` |
| `coverage` | Record JavaScript code execution | `divebell browser-help coverage` |
| `debug` | Debug compiled JavaScript in Chrome | `divebell browser-help debug` |
| `record` | Record browser session to video | `divebell browser-help record` |
| `console` | View console logs | `divebell browser-help console` |
| `errors` | View page errors | `divebell browser-help errors` |
| `highlight` | Highlight an element | `divebell browser-help highlight` |
| `inspect` | Open Chrome DevTools for the active page | `divebell browser-help inspect` |
| `clipboard` | Read and write clipboard | `divebell browser-help clipboard` |
| `stream` | Manage live WebSocket browser streaming | `divebell browser-help stream` |
| `react` | Full React component tree (depth id parent name columns) | Special syntax below |
| `vitals` | Core Web Vitals (LCP/CLS/TTFB/FCP/INP) + | Special syntax below |
| `a11y` | Run an axe-core accessibility audit | `divebell browser-help a11y` |
| `pushstate` | SPA client-side nav. Auto-detects window.next.router.push | Special syntax below |
| `removeinitscript` | Remove a script registered via --init-script or addinitscript | Special syntax below |
| `batch` | Execute multiple commands sequentially | `divebell browser-help batch` |
| `auth` | Manage authentication profiles | `divebell browser-help auth` |
| `plugin` | Manage configured plugins | `divebell browser-help plugin` |
| `confirm` | Approve or deny pending actions | `divebell browser-help confirm` |
| `deny` | Approve or deny pending actions | `divebell browser-help deny` |
| `session` | Manage sessions | `divebell browser-help session` |
| `mcp` | Start an MCP stdio server | `divebell browser-help mcp` |
| `chat` | Natural language browser control via AI | `divebell browser-help chat` |
| `dashboard` | Observability dashboard | `divebell browser-help dashboard` |
| `install` | Install browser binaries | `divebell browser-help install` |
| `upgrade` | Upgrade to the latest version | `divebell browser-help upgrade` |
| `doctor` | Diagnose and repair your install | `divebell browser-help doctor` |
| `profiles` | List available Chrome profiles | `divebell browser-help profiles` |
| `keydown` | Press a key down (without release) | `divebell browser-help keydown` |
| `keyup` | Release a key | `divebell browser-help keyup` |
| `window` | Manage browser windows | `divebell browser-help window` |
| `frame` | Switch frame context | `divebell browser-help frame` |
| `dialog` | Handle browser dialogs | `divebell browser-help dialog` |
| `state` | Manage browser state | `divebell browser-help state` |
| `device` | Manage iOS simulators | `divebell browser-help device` |
| `tap` | Tap an element (touch gesture) | `divebell browser-help tap` |
| `swipe` | Swipe gesture (iOS) | `divebell browser-help swipe` |

## Commands without dedicated help

### `react`

This pinned version has no dedicated subcommand help. Use one of the
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

Pass the chosen form without `agent-browser`, for example `browser.raw(["react", ...args])`.

### `vitals`

This pinned version has no dedicated subcommand help. Use one of the
top-level forms captured from the installed parser:

```text
vitals [url] [--json]      Core Web Vitals (LCP/CLS/TTFB/FCP/INP) +
React hydration summary; --json returns full data
```

Pass the chosen form without `agent-browser`, for example `browser.raw(["vitals", ...args])`.

### `pushstate`

This pinned version has no dedicated subcommand help. Use one of the
top-level forms captured from the installed parser:

```text
pushstate <url>            SPA client-side nav. Auto-detects window.next.router.push
(triggers RSC fetch on Next.js); falls back to
history.pushState + popstate/navigate events for other frameworks
```

Pass the chosen form without `agent-browser`, for example `browser.raw(["pushstate", ...args])`.

### `removeinitscript`

This pinned version has no dedicated subcommand help. Use one of the
top-level forms captured from the installed parser:

```text
removeinitscript <id>      Remove a script registered via --init-script or addinitscript
```

Pass the chosen form without `agent-browser`, for example `browser.raw(["removeinitscript", ...args])`.

## Documented but unavailable

- `addinitscript` appears in bundled Markdown, but the pinned parser does not declare it or provide command help. Do not use it through `browser.raw`.
- `navigate` appears in bundled Markdown, but the pinned parser does not declare it or provide command help. Do not use it through `browser.raw`.
