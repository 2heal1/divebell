# `browser.raw`: `deny`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["deny", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser confirm/deny - Approve or deny pending actions

Usage:
  agent-browser confirm <confirmation-id>
  agent-browser deny <confirmation-id>

When --confirm-actions is set, certain action categories return a
confirmation_required response with a confirmation ID. Use confirm/deny
to approve or reject the action.

Pending confirmations auto-deny after 60 seconds.

Examples:
  agent-browser confirm c_8f3a1234
  agent-browser deny c_8f3a1234
```
