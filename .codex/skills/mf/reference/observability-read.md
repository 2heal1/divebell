# Observability: Read Reports

Use this reference to get Module Federation observability reports from the most
direct available source.

If the user asks to open or visit a real page and observe Module Federation
loading with no existing report, use `reference/observability-page.md` first so
it can choose existing project integration or temporary browser injection.

If the report source is an already installed browser reader or a temporary
browser injection from `reference/observability-page.md`, use
`skills/mf/scripts/read-observability-report.mjs` first. Do not create a
one-off CDP or WebSocket reader script. Do not try Playwright, Cypress,
Electron, project e2e tests, the Codex in-app Browser skill, or any generic
browser runtime before this built-in reader.

When `reference/observability-page.md` found an installed observability plugin,
that installed plugin is the evidence source for the current task. Do not
switch to temporary browser injection if the installed report is missing or hard
to read. Use the collector path when the project is configured for collector
output, use the browser-reader path when it is configured for browser output, or
stop and ask for an accessible plugin report/export when neither channel is
available.

If `skills/mf/scripts/open-observability-page.mjs` already returned
`initialRead`, analyze that result before running another read. Treat
`initialRead` as the first report source for temporary injection. Rerun the
reader only after user interaction, reload, or a specific follow-up target.

For temporary injection, the only allowed read paths are:

1. the `initialRead` object already saved by
   `skills/mf/scripts/open-observability-page.mjs`
2. the built-in `skills/mf/scripts/read-observability-report.mjs` command
   printed as `nextReadCommand` / `readCommand`

Do not write or run one-off scripts such as `/tmp/read-mf-report.mjs`,
`/private/tmp/read-*-cdp.*`, custom WebSocket clients, or custom CDP readers.
If a local-port permission error occurs, rerun the same built-in helper or
reader with permission/escalation.

## Installed Plugin Fast Path

When `reference/observability-page.md` found that the project already
registered the observability plugin, first decide which installed-plugin output
channel is configured. Do not use `skills/mf/scripts/open-observability-page.mjs`
in this path.

### Installed Plugin Collector Path

Use this when the project config contains `collector: true` or
`collector: { enabled: true }`. Before starting the collector, make sure
`reference/observability-page.md` already completed Chrome Debug Preflight. If
you entered this file directly, run the preflight first:

```bash
node skills/mf/scripts/open-chrome-debug.mjs --url about:blank --timeout-ms 3000 --json
```

If running the helper is blocked by local permissions, rerun the same helper
with tool permission/escalation. If it returns `debug-port-unavailable`, do not
restart the user's daily Chrome. Ask the user to close the fixed debug-profile
Chrome window if it is stuck, or choose another debug port. Do not start the
collector until Chrome debug access is ready.

After the preflight succeeds, start the local node collector before opening or
reloading the page:

```bash
node skills/mf/scripts/observability-collector.js --port 17891
```

If the project config uses a custom collector port, use that port. If the port
is occupied, pick the next free local port and tell the user the project config
must match it before the collector can receive reports.

Then open or reload the target page through
`skills/mf/scripts/open-chrome-debug.mjs`. After the page reproduces the loading
path, read these files first:

```text
.mf/observability/collector/latest-session.json
.mf/observability/collector/<sessionId>/latest-report.json
```

If `latest-report.json` is not present yet, read
`.mf/observability/collector/<sessionId>/latest.json` and
`.mf/observability/collector/<sessionId>/events.jsonl` to explain whether the
plugin has not posted yet, the trace is still pending, or the collector received
only raw updates. Stop the collector after analysis unless the user asks to keep
it running.

If the collector receives nothing, do not inject a temporary plugin. Report that
the installed plugin did not post to the local collector and ask for the
project's collector config, `onReport` output, or browser-reader access.

### Installed Plugin Browser Reader Path

Use this when the project config exposes the browser reader, or when collector
is not configured:

```bash
node skills/mf/scripts/read-observability-report.mjs \
  --port "<returned-port>" \
  --page-id "<opened-page-id>" \
  --scope auto \
  --limit 10 \
  --output "/tmp/mf-observability-report.json" \
  --json
```

If `pageId` is missing from the open step, use
`--url-contains "<target-url>"` instead of `--page-id`.

`--scope auto` reads the page's existing
`window.__FEDERATION__.__OBSERVABILITY__` scopes and selects
`chrome_extension` when present, otherwise the first available scope. This
avoids an extra "inspect scopes, then rerun" step for locally installed
plugins that use project-defined scopes such as `runtime_host`.

If this browser read is blocked, rerun the same built-in reader with permission.
If the read still cannot access a report, do not inject a temporary plugin into
an already integrated page. Use the collector only when the installed plugin is
configured for collector output, otherwise ask for `exportReport(traceId)`, the
app's `onReport` upload payload, or a pasted report JSON.

## Browser Capability Check

For a browser page, first use the built-in CDP reader or another backend that
can evaluate JavaScript in the page context:

1. open or inspect the target page
2. evaluate JavaScript in the page context through the built-in reader when a
   Chrome debug port is available
3. if evaluation works, read
   `window.__FEDERATION__.__OBSERVABILITY__` directly and do not start the local
   collector

Use the local collector when the installed plugin is configured for collector
output, or when the user explicitly wants a repeatable local collector loop. Do
not start it for a page that has no installed plugin collector config and then
use the lack of collector output as evidence.

## Browser Console Or Page Global

If the console hint includes a `read:` line, execute that command exactly in the
browser console context:

```ts
window.__FEDERATION__.__OBSERVABILITY__['runtime_host'].getReport('mf-...');
```

For temporary browser injection through `reference/observability-page.md`,
always try `chrome_extension` first:

```ts
window.__FEDERATION__.__OBSERVABILITY__['chrome_extension'].getLatestReport();
window.__FEDERATION__.__OBSERVABILITY__['chrome_extension'].getReports({
  limit: 10,
});
```

Do not pass or invent a custom scope for this injected path. If the app itself
configured a different browser scope, inspect:

```ts
Object.keys(window.__FEDERATION__.__OBSERVABILITY__);
```

For temporary browser injection, read and save reports with the built-in script
from the `mf` skill directory. Use the `port` and `pageId` printed by
`scripts/open-observability-page.mjs`:

```bash
node skills/mf/scripts/read-observability-report.mjs \
  --port "<returned-port>" \
  --page-id "<opened-page-id>" \
  --scope chrome_extension \
  --limit 10 \
  --output "/tmp/mf-observability-report.json" \
  --json
```

Do not run this command immediately after
`skills/mf/scripts/open-observability-page.mjs` when its output has
`initialReadAvailable: true`. In that case, analyze `initialRead` first and
only rerun the reader after a click, route change, reload, wait-for-later-state,
or user-requested filter.

Use `--trace-id`, `--remote`, `--expose`, or `--shared` when the user names a
specific trace or target. If the local Chrome debug connection is blocked by
sandbox or local process permissions, rerun this same built-in reader with
permission. If no debug port exists, return to `reference/observability-page.md`
and use `skills/mf/scripts/open-chrome-debug.mjs`; if that helper reports
`debug-port-unavailable`, ask the user to close the fixed debug-profile Chrome
window if it is stuck, or choose another debug port. Do not create a temporary
WebSocket/CDP reader script.

If the user only has the latest browser report, use:

```ts
window.__FEDERATION__.__OBSERVABILITY__['runtime_host'].getLatestReport();
```

If the user wants to inspect loading chains, observe MF loading, or debug a page
that stays in loading state without an error or `traceId`, do not wait for a
console error. Read recent reports directly:

```ts
window.__FEDERATION__.__OBSERVABILITY__['runtime_host'].getReports({ limit: 10 });
```

Then look for reports with `status: "pending"` or
`summary.outcome: "pending"`. Use `startedAt`, `updatedAt`, `duration`,
`summary.phases`, and `diagnosis.pendingPhases` to explain which phase has
started, which phase has not completed, and how long the trace has been idle.
When the browser reader is enabled in development mode, the console prints
`Observability trace started` lines for `loadRemote` and `loadShare` by default;
use the printed `traceId` to read that exact report. In production browser mode,
these start logs are disabled unless the app explicitly sets
`trace.printStart: true`.

For recent or filtered browser reports, use:

```ts
window.__FEDERATION__.__OBSERVABILITY__['runtime_host'].getReports({ limit: 5 });
window.__FEDERATION__.__OBSERVABILITY__['runtime_host'].findReports({
  remote: 'remote1',
});
window.__FEDERATION__.__OBSERVABILITY__['runtime_host'].findReports({
  expose: './Button',
});
window.__FEDERATION__.__OBSERVABILITY__['runtime_host'].findReports({
  shared: 'react',
});
window.__FEDERATION__.__OBSERVABILITY__['runtime_host'].exportReport('mf-...');
```

If the browser global is disabled, ask for the app's `onReport` output, uploaded
observability record, or the full report output pasted by the user.

If the browser console only contains `traceId` and `errorCode`, treat it as
production-safe output. Do not assume the full report is globally readable. Ask
for an explicit `exportReport(traceId)` output, the app's `onReport` output, or
the user's uploaded observability record.

## Shared Dependency Read Boundary

Do not run another browser read only because the report has no shared dependency
records. Only use `--shared` or rerun for shared data when the user explicitly
asks about shared dependencies, names a shared package, or the report/error
points to shared loading.

Shared dependency evidence is only expected when the page uses Module
Federation `>= 2.5.0` and that runtime path emits shared observability events.
If the MF version is missing, unknown, or lower than `2.5.0`, absence of
`summary.shared`, `shared-resolved`, or shared events is not a reason to reread
the page and is not proof that shared dependencies are healthy.

## Chrome DevTools Export

If the user has the Module Federation Chrome extension, use the `Loading Trace`
tab to inspect or export the same reports. If the page already registered its
own observability plugin, the tab reads those reports. If not, the tab can start
temporary collection for the current tab.

When the user provides an exported JSON file from Chrome DevTools, read that
file as the report source and then use `reference/observability-analyze.md`.

## Local Collector

If evaluation is unavailable and the project enables
`ObservabilityPlugin({ collector: true })` or
`collector: { enabled: true, port }`, complete Chrome Debug Preflight from
`reference/observability-page.md` first, then start the lightweight collector
before opening the page.

Before starting the collector, check whether the configured port is available.
Use `17891` by default. If it is occupied, pick the next free local port
(`17892`, `17893`, ...), then tell the user to make the runtime plugin config
match that port:

```ts
ObservabilityPlugin({
  collector: {
    enabled: true,
    port: 17892,
  },
});
```

Start the collector with the selected port:

```bash
node skills/mf/scripts/observability-collector.js --port 17891
```

The collector listens only on `127.0.0.1`, receives browser reports from the
runtime plugin, and writes:

```text
.mf/observability/collector/latest-session.json
.mf/observability/collector/<sessionId>/events.jsonl
.mf/observability/collector/<sessionId>/latest.json
.mf/observability/collector/<sessionId>/latest-report.json
```

After opening the target page and reproducing the issue, read
`latest-report.json` first. If the page is still loading, read `latest.json` or
`events.jsonl` to inspect pending traces. Stop the collector process after the
analysis unless the user asks to keep collecting.

## Node Or SSR

Read `.mf/observability/latest.json` first. Use `.mf/observability/events.jsonl`
only if multiple traces or event ordering are needed.

`latest.json` is the formatted latest complete report. `events.jsonl` is an
append-only stream where each line is one runtime event with its own `traceId`,
`timestamp`, `phase`, `status`, context, and error fields when present.

## Build

Read `.mf/observability/build-report.json` for build failures and
`.mf/observability/build-info.json` for successful build facts.
