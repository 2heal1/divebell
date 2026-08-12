# `@divebell/extension-rstack`

Observe Rspack HMR and React Refresh through non-pausing logpoints in the
compiled JavaScript loaded by Chromium. The Extension does not require source
maps and does not integrate `@divebell/core` into the application or
`@rspack/plugin-react-refresh`.

Install the Rstack Extension, then open the page. The MF Extension is optional
and only adds runtime ownership and shared-provider evidence:

```sh
divebell extensions add @divebell/extension-rstack
divebell open http://localhost:3000
divebell stack --refresh
divebell rstack hmr inspect
```

The Rstack `open` Hook installs a document-start observer before application
scripts run. It watches only direct children added to `<head>`, records the
first transient `script[data-rspack]`, and disconnects on the first match or
the document `load` event. Rspack removes these loader scripts after they
settle, so querying the DOM later is not reliable. If no live insertion was
observed, `stack` falls back to the loaded compiled runtime's
`setAttribute("data-rspack", ...)` marker.

Rspack is reported from either of those Rspack-specific signals even when a
production page has no HMR runtime. HMR and React Refresh are reported as
separate capability evidence. A generic Webpack-compatible HMR state machine
by itself is not identified as Rstack. Use `stack --refresh` after upgrading
this Extension or when the same page URL already has a cached stack result.

Add `@divebell/extension-mf` and open with `--mf` only when Module Federation
ownership or shared React evidence is needed.

Arm before changing code:

```sh
divebell rstack hmr start --expect applied --expect-refresh --expect-no-reload
# edit the source file only after status is armed
divebell rstack hmr wait <observation-id> --timeout 15000
divebell rstack hmr stop <observation-id>
```

`start` returns the `observationId`; `status`, `wait`, and `stop` may omit it
when exactly one observation is active in the current project.

`armed` has a precise meaning: the debugger is enabled for the current CDP
page session, the loaded compiled-JavaScript runtimes have been identified,
the required HMR status logpoint is bound, optional Refresh/error/reload
logpoints have been attempted, and the event, Console, optional page-state,
and MF evidence baselines have been persisted. It does not mean that a source
edit has already been detected. Make the edit only after this result.

The report keeps the HMR runtime, React Refresh runtime, changed module owner,
and MF shared React provider as separate evidence. Shared `react` and
`react-dom` traces are collected independently for every current MF consumer
or mixed runtime instance.

`inspect` reports React Fast Refresh preconditions in this order:

1. loaded ReactDOM build (`development`, `production`, or ambiguous);
2. whether `globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__` is installed;
3. registered renderer build and the `scheduleRefresh` / `setRefreshHandler`
   helpers.

`start --expect-refresh` fails before arming when no compatible development
ReactDOM renderer is ready. This does not block plain Rspack HMR observation.

Page reload and module HMR are separate outcomes. After an apply-to-idle path,
`wait` keeps observing for a short settle window. A main-document commit during
that window produces `outcome: "reloaded"`; it cannot pass as applied HMR.
`pageReload` separately reports a reload request and the observed document
commit.

Use `wait` with `--expect applied` for a pass/fail answer. On failure, rerun
`status <observation-id> --verbose` to inspect the runtime-scoped status path,
module IDs, compiled locations, probe gaps, Refresh boundary branch, reload
evidence, and MF owner/provider evidence. Compilation failures are explicitly
reported as Console fallback evidence because no build-server integration is
required.
