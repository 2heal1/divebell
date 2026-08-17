# `browser.raw`: `inspect`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["inspect", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser inspect - Open Chrome DevTools for the active page

Starts a local WebSocket proxy and opens Chrome's DevTools frontend in your
default browser. The proxy routes DevTools traffic through the daemon's
existing CDP connection, so both DevTools and agent-browser commands work
simultaneously.

Usage: agent-browser inspect

Examples:
  agent-browser open example.com
  agent-browser inspect          # opens DevTools in your browser
  agent-browser click "Submit"   # commands still work while DevTools is open
```
