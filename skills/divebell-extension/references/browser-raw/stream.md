# `browser.raw`: `stream`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["stream", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser stream - Manage live WebSocket browser streaming

Usage:
  agent-browser stream enable [--port <port>]
  agent-browser stream disable
  agent-browser stream status

Enables or disables the session-scoped WebSocket stream server without restarting
an already-running daemon. If --port is omitted, agent-browser binds an
available localhost port automatically and reports it back.

Notes:
  - 'stream enable' creates the WebSocket server.
  - WebSocket clients trigger frame streaming automatically.
  - Frames are delivered latest-first: the newest frame is picked at send
    time, so frames produced during an in-flight write are skipped, never
    queued. Input events dispatch immediately, independent of frame
    delivery, and are sent without waiting for the browser's reply, so a
    click stays responsive behind a burst of mouse moves.
  - Clients can cap their own frame rate by sending
    {"type":"config","maxFps":N} (1-120, 0 = uncapped, per client).
  - Clients that send {"type":"config","pacing":"ack"} receive one frame at
    a time and acknowledge it with {"type":"ack","seq":N}, so a client that
    stalls never drains a backlog of stale frames. Default is "push", where
    frames already handed to the transport are delivered in order.
  - Both settings can be declared on the URL instead, which is the only way
    to cover the opening frame: ws://127.0.0.1:<port>/?pacing=ack&maxFps=10
  - 'screencast_start' and 'screencast_stop' still control explicit CDP screencasts.
  - Streaming is always enabled. Set AGENT_BROWSER_STREAM_PORT to bind to a
    specific port instead of the default OS-assigned port.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser stream status
  agent-browser stream enable
  agent-browser stream enable --port 9223
  agent-browser stream disable
```
