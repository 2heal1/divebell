# `browser.raw`: `frame`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["frame", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser frame - Switch frame context

Usage: agent-browser frame <selector|main>

Switch to an iframe or back to the main frame.

Arguments:
  <selector>           CSS selector for iframe
  main                 Switch back to main frame

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser frame "#embed-iframe"
  agent-browser frame "iframe[name='content']"
  agent-browser frame main
```
