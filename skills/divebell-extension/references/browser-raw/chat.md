# `browser.raw`: `chat`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["chat", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser chat - Natural language browser control via AI

Usage:
  agent-browser chat <message>         Single-shot: execute instruction and exit
  agent-browser chat                   Interactive REPL (when stdin is a TTY)
  echo "instruction" | agent-browser chat   Piped input

Sends natural language instructions to an AI model that translates them
into agent-browser commands and executes them against the active session.
Requires AI_GATEWAY_API_KEY to be set.

In interactive mode, type "quit", "exit", or "q" to leave the REPL.

Chat Options:
  --model <name>         AI model (or AI_GATEWAY_MODEL env, default: anthropic/claude-sonnet-4.6)
  -v, --verbose          Show tool commands and their raw output
  -q, --quiet            Show only the AI text response (hide tool calls)

Global Options:
  --json                 Structured JSON output per turn
  --session <name>       Target session for commands

Examples:
  agent-browser chat "open google.com and search for cats"
  agent-browser chat "take a screenshot of the current page"
  agent-browser -q chat "summarize this page"
  agent-browser -v chat "fill in the login form with test@example.com"
  agent-browser --model openai/gpt-4o chat "navigate to hacker news"
  agent-browser chat
```
