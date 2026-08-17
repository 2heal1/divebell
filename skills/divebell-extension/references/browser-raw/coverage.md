# `browser.raw`: `coverage`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["coverage", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser coverage - Record JavaScript code execution

Usage: agent-browser coverage <operation> [options]

Record precise JavaScript execution ranges for the current page. A checkpoint
resets the counters, so one capture can separate first-screen work from later
route or interaction work.

Operations:
  status                          Show the active capture
  start                           Start recording
  take [path]                     Save a checkpoint and keep recording
  stop [path]                     Save the final checkpoint and stop
  cancel                          Stop without saving another checkpoint

Options:
  --call-count                    Preserve function call counts when starting
  --label <name>                  Label a take or stop checkpoint
  --max-size <bytes>              Maximum artifact size

Global Options:
  --json                          Output as JSON
  --session <name>                Use a specific session

Examples:
  agent-browser coverage start
  agent-browser goto https://example.com
  agent-browser coverage take ./first-screen.coverage.json --label first-screen
  agent-browser click "a[href='/orders']"
  agent-browser coverage stop ./orders.coverage.json --label orders

Code coverage is supported on Chrome and Chromium. It records generated script
URLs and byte ranges; source maps can later associate those ranges with project
files and dependency packages.
```
