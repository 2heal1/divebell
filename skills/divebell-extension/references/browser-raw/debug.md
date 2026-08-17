# `browser.raw`: `debug`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["debug", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser debug - Debug compiled JavaScript in Chrome

Usage: agent-browser debug <operation> [options]

The debugger works directly with JavaScript loaded by Chrome. Source files and
source maps are not required. Script locations are one-based and columns use
UTF-16 code units, matching Chrome DevTools Protocol after conversion.

Session operations:
  enable [selectors] [--all-tabs]       Enable Runtime, Debugger, and Page events
  disable [selectors] [--all-tabs]      Disable and remove debugger state
  status [selectors]                    List enabled and paused sessions
  pause [selectors]                     Request a JavaScript pause
  resume [pause selectors]              Resume one paused session
  step-over|step-into|step-out          Continue one paused session by one step
  stack [pause selectors]               Read paused call frames
  eval <expression> [--frame <index>]   Evaluate in a paused call frame

Compiled source operations:
  scripts [--filter <url>] [selectors]  List script instances and lineage evidence
  source <script-id> [selectors]        Print one compiled script
  source search <text> [options]        Search loaded compiled source text

Probe operations:
  breakpoint set <script-id> <line> [options]
  breakpoint list
  breakpoint remove <probe-id>
  logpoint set <script-id> <line> --expression <js> [options]
  logpoint list
  logpoint remove <probe-id>

Probe options:
  --column <n>                          One-based UTF-16 column
  --strict                              Require the requested line and explicit column
  --before                              Resolve backward within the same function
  --after                               Resolve forward within the same function, default
  --nearest                             Choose the nearest point, preferring forward on ties
  --nearest-forward                     Compatibility alias for --after
  --max-lines <n>                       Bound resolution to 3 lines by default
  --max-utf16-distance <n>              Bound resolution to 512 UTF-16 units by default
  --condition <js>                      Conditional breakpoint expression
  --expression <js>                     Logpoint value, repeatable
  --when <js>                           Emit a logpoint only when the expression is true
  --persist                             Rebind only when lineage evidence is resolved
  --tag <key=value>                     Attach trusted registry metadata

Selectors:
  --tab <tN>                            Stable agent-browser tab ID
  --session <cdp-session-id>            Exact CDP session ID
  --pause-id <pause-id>                 Exact pause generation ID

Event operations:
  events [--since <sequence>] [--wait <ms>] [--clear]

Examples:
  agent-browser debug enable
  agent-browser debug scripts --filter app
  agent-browser debug source search "checkout" --filter assets
  agent-browser debug breakpoint set 42 108 --strict
  agent-browser debug stack --json
  agent-browser debug eval "order.id" --frame 0
  agent-browser debug resume
  agent-browser debug logpoint set 42 108 --when "order.ready" --expression "order"
  agent-browser debug events --since 0 --wait 5000 --json

Pause recovery commands use a lock-independent daemon path, so a second CLI or
MCP call can inspect and resume a page while the first command is blocked at a
breakpoint. If multiple pages are paused, resume, step, stack, and frame eval
require exactly one tab, CDP session, or pause ID. Conditional breakpoints,
logpoint expressions, and logpoint when expressions require both debug.control
and evaluate policy permission. Chrome and Chromium are the only supported
engines.
```
