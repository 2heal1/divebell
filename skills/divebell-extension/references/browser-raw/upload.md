# `browser.raw`: `upload`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["upload", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser upload - Upload files

Usage: agent-browser upload <selector> <files...>

Uploads one or more files to a file input element.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser upload "#file-input" ./document.pdf
  agent-browser upload @e3 ./image1.png ./image2.png
```
