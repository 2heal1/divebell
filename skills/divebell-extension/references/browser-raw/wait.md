# `browser.raw`: `wait`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["wait", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser wait - Wait for condition

Usage: agent-browser wait <selector|ms|option>

Waits for an element to appear, a timeout, or other conditions.

Modes:
  <selector>           Wait for element to appear
  <ms>                 Wait for specified milliseconds
  --url <pattern>      Wait for URL to match pattern
  --load <state>       Wait for load state (load, domcontentloaded, networkidle)
  --fn <expression>    Wait for JavaScript expression to be truthy
  --text <text>        Wait for text to appear on page (substring match)
  --download [path]    Wait for a download to complete (optionally save to path)

Download Options (with --download):
  --timeout <ms>       Timeout in milliseconds for download to start

Wait for text to disappear:
  Use --fn or --state hidden to wait for text or elements to go away:
  wait --fn "!document.body.innerText.includes('Loading...')"
  wait "#spinner" --state hidden
  wait @e5 --state detached

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser wait "#loading-spinner"
  agent-browser wait 2000
  agent-browser wait --url "**/dashboard"
  agent-browser wait --load networkidle
  agent-browser wait --fn "window.appReady === true"
  agent-browser wait --text "Welcome back"
  agent-browser wait --download ./file.pdf
  agent-browser wait --download ./report.xlsx --timeout 30000
  agent-browser wait --fn "!document.body.innerText.includes('Loading...')"
```
