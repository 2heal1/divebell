# `browser.raw`: `clipboard`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["clipboard", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser clipboard - Read and write clipboard

Usage: agent-browser clipboard <operation> [text]

Read from or write to the browser clipboard.

Operations:
  read                 Read text from clipboard
  write <text>         Write text to clipboard
  copy                 Copy current selection (simulates Ctrl+C)
  paste                Paste from clipboard (simulates Ctrl+V)

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser clipboard read
  agent-browser clipboard write "Hello, World!"
  agent-browser clipboard copy
  agent-browser clipboard paste
```
