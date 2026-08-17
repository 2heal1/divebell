# `browser.raw`: `pdf`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["pdf", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser pdf - Save page as PDF

Usage: agent-browser pdf <path>

Saves the current page as a PDF file.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser pdf ./page.pdf
  agent-browser pdf ~/Documents/report.pdf
```
