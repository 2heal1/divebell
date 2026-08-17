# `browser.raw`: `close`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["close", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser close - Close the browser

Usage: agent-browser close [options]

Closes the browser instance for the current session.

Aliases: quit, exit

Options:
  --all                Close all active sessions

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser close
  agent-browser close --session mysession
  agent-browser close --all
```
