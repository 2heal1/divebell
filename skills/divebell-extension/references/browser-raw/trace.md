# `browser.raw`: `trace`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["trace", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser trace - Record execution trace

Usage: agent-browser trace start
       agent-browser trace stop [path]

Record a Chrome DevTools trace for debugging.

Operations:
  start                Start recording trace
  stop [path]          Stop recording and save trace

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser trace start
  agent-browser trace stop
  agent-browser trace stop ./debug-trace.json
```
