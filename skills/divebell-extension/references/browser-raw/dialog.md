# `browser.raw`: `dialog`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["dialog", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser dialog - Handle browser dialogs

Usage: agent-browser dialog <accept|dismiss|status> [text]

Respond to or check for browser dialogs (alert, confirm, prompt).

Operations:
  accept [text]        Accept dialog, optionally with prompt text
  dismiss              Dismiss/cancel dialog
  status               Check if a dialog is currently open

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser dialog accept
  agent-browser dialog accept "my input"
  agent-browser dialog dismiss
  agent-browser dialog status
```
