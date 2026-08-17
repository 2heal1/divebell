# `browser.raw`: `tab`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["tab", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser tab - Manage browser tabs

Usage: agent-browser tab [operation] [args]

Manage browser tabs in the current window. Stable tab ids look like `t1`,
`t2`, `t3`. An id is never reused within a session, so scripts can keep
referring to the same tab across commands. Optional user-assigned labels
(e.g. `docs`, `app`) are interchangeable with ids everywhere a tab ref is
accepted. CDP target ids (from `tab list --json`) are also accepted as tab
refs; unlike `t<N>` ids they stay stable across daemon restarts.

Each session remembers its active tab (bound by CDP target id) and returns
to it after a daemon restart. With --pin-tab, commands fail with a
`tab_gone` error instead of falling back to another tab when the bound tab
is closed. JSON output includes code=tab_gone, data.targetId, and an
optional sanitized data.lastUrl; batch output uses result for the recovery
object. Recover with `tab new` or `tab list`. The pin is sticky per session;
pass --no-pin-tab to turn it off again.

Operations:
  list                       List open tabs with their ids and labels (default)
  new [url]                  Open a new tab
  new --label <name> [url]   Open a new tab with a label like `docs` or `app`
  close [t<N>|label|target]  Close a tab (current if no ref given)
  <t<N>|label|target>        Switch to a tab by id, label, or CDP target id

Global Options:
  --json               Output as JSON (includes each tab's targetId)
  --session <name>     Use specific session

Examples:
  agent-browser tab
  agent-browser tab list
  agent-browser tab new
  agent-browser tab new https://example.com
  agent-browser tab new --label docs https://docs.example.com
  agent-browser tab t2
  agent-browser tab docs
  agent-browser tab close
  agent-browser tab close t1
  agent-browser tab close docs
  agent-browser tab list --json                        # Includes CDP target ids
  agent-browser tab close 4A0B7C4E1F2D3A4B5C6D7E8F90A1B2C3  # Close by target id
```
