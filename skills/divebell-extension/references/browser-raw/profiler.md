# `browser.raw`: `profiler`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["profiler", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser profiler - Record Chrome DevTools performance profile

Usage: agent-browser profiler <operation> [options]

Record a performance profile using Chrome DevTools Protocol (CDP) Tracing.
The output JSON file can be loaded into Chrome DevTools Performance panel,
Perfetto UI (https://ui.perfetto.dev/), or other trace analysis tools.

Operations:
  start                Start profiling
  stop [path]          Stop profiling and save to file

Start Options:
  --categories <list>  Comma-separated trace categories (default includes
                       devtools.timeline, v8.execute, blink, and others)

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  # Basic profiling
  agent-browser profiler start
  agent-browser navigate https://example.com
  agent-browser click "#button"
  agent-browser profiler stop ./trace.json

  # With custom categories
  agent-browser profiler start --categories "devtools.timeline,v8.execute,blink.user_timing"
  agent-browser profiler stop ./custom-trace.json

The output file can be viewed in:
  - Chrome DevTools: Performance panel > Load profile
  - Perfetto: https://ui.perfetto.dev/
```
