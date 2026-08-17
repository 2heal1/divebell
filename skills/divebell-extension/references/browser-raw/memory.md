# `browser.raw`: `memory`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["memory", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser memory - Capture page memory evidence

Usage: agent-browser memory <operation> [options]

Read lightweight metrics, record allocation call stacks, or stream a Chrome
heap snapshot directly to a local file. Memory commands use the current
agent-browser session and do not require a separate CDP address.

Operations:
  metrics                         Read JS heap and DOM counters
  status                          Show the active memory capture
  sampling start                  Start allocation sampling
  sampling stop [path]            Stop sampling and save the profile
  snapshot [path]                 Save a heap snapshot
  collect-garbage                 Request garbage collection
  cancel                          Cancel the active capture

Sampling options:
  --sampling-interval <bytes>     Average allocated bytes between samples
  --top <count>                   Number of top allocation sites to return
  --max-size <bytes>              Maximum artifact size

Snapshot options:
  --no-gc                         Skip garbage collection before capture
  --timeout <ms>                  Capture timeout, default 120000
  --max-size <bytes>              Maximum artifact size

Global Options:
  --json                          Output as JSON
  --session <name>                Use a specific session

Examples:
  agent-browser memory metrics
  agent-browser memory sampling start --sampling-interval 65536
  agent-browser memory sampling stop ./allocations.heapprofile --top 10
  agent-browser memory snapshot ./page.heapsnapshot
  agent-browser memory status --json

Memory diagnostics are supported on Chrome and Chromium. Other engines return
an explicit unsupported-engine error. Heap snapshots can contain page text,
application data, and credentials. Keep artifacts local and out of source control.
```
