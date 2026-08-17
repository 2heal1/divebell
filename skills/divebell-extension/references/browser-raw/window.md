# `browser.raw`: `window`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["window", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser window - Manage browser windows

Usage: agent-browser window <operation>

Manage browser windows.

Operations:
  new                  Open new browser window

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser window new
```
