# `browser.raw`: `network`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["network", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser network - Network interception and monitoring

Usage: agent-browser network <subcommand> [args]

Intercept, mock, or monitor network requests.

Subcommands:
  route <url> [options]      Intercept requests matching URL pattern
    --abort                  Abort matching requests
    --body <json>            Respond with custom body
  unroute [url]              Remove route (all if no URL)
  requests [options]         List captured requests
    --clear                  Clear request log
    --filter <pattern>       Filter by URL pattern
    --type <types>           Filter by resource type (comma-separated: xhr,fetch,document)
    --method <method>        Filter by HTTP method (GET, POST, etc.)
    --status <code>          Filter by status (200, 2xx, 400-499)
  request <requestId>        View full request/response detail (including body)
  har <start|stop> [path]    Record and export a HAR file
    --content <mode>         Response bodies to embed on start: text (default), all, none

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser network route "**/api/*" --abort
  agent-browser network route "**/data.json" --body '{"mock": true}'
  agent-browser network unroute
  agent-browser network requests
  agent-browser network requests --filter "api"
  agent-browser network requests --type xhr,fetch
  agent-browser network requests --method POST --status 2xx
  agent-browser network requests --clear
  agent-browser network request 1234.5
  agent-browser network har start
  agent-browser network har start --content all
  agent-browser network har stop ./capture.har
```
