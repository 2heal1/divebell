# `browser.raw`: `session`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["session", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser session - Manage sessions

Usage: agent-browser session [operation]

Manage isolated browser sessions. Each session has its own browser
instance with separate cookies, storage, and state.

Operations:
  (none)               Show current session name
  id                   Generate stable session id (--scope worktree|cwd|git-root, --prefix)
  info                 Show daemon, launch, and restore diagnostics
  list                 List all active sessions

Environment:
  AGENT_BROWSER_SESSION    Default session name
  AGENT_BROWSER_NAMESPACE  Namespace for daemon sockets and restore state

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session
  --namespace <name>   Use specific namespace

Examples:
  agent-browser session
  agent-browser session id --scope worktree --prefix next-dev-loop
  agent-browser session info --json
  agent-browser session list
  agent-browser --session test open example.com
```
