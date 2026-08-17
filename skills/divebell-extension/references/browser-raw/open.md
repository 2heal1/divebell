# `browser.raw`: `open`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["open", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser open - Launch the browser, optionally navigate

Usage: agent-browser open [url]

Without a URL, launches the browser but stays on about:blank. This lets
you stage state (network routes, cookies, init scripts) before the first
real navigation — useful for SSR debug, auth setup, and capturing fresh
`react suspense` / `vitals` state without noise from a prior page.

With a URL, launches and navigates. If no protocol is provided, https://
is automatically prepended.

The `goto` and `navigate` aliases still require a URL.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session
  --headers <json>     Set HTTP headers (scoped to this origin)
  --headed             Show browser window
  --enable react-devtools   Inject the React DevTools hook before any page JS
  --init-script <path>      Register a page init script (repeatable)

Examples:
  agent-browser open                     # Launch, no nav
  agent-browser open example.com
  agent-browser open https://github.com
  agent-browser open localhost:3000
  agent-browser open api.example.com --headers '{"Authorization": "Bearer token"}'
    # ^ Headers only sent to api.example.com, not other domains

  # Pre-navigation setup in one turn:
  agent-browser batch \
    '["open"]' \
    '["network","route","*","--abort","--resource-type","script"]' \
    '["navigate","http://localhost:3000/target"]'
```
