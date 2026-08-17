# `browser.raw`: `download`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["download", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser download - Download a file by clicking an element

Usage: agent-browser download <selector> <path>

Clicks an element that triggers a download and saves the file to the specified path.

Arguments:
  selector             Element to click (CSS selector or @ref)
  path                 Path where the downloaded file will be saved

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser download "#download-btn" ./file.pdf
  agent-browser download @e5 ./report.xlsx
  agent-browser download "a[href$='.zip']" ./archive.zip
```
