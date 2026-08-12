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

Stack detection does not install a DOM observer or enable the Debugger. After
the page loads, it collects JavaScript URLs from `document.scripts` and Script
Resource Timing entries, keeps only `index*`, `*main*`, and `runtime*`
filenames, and fetches every distinct match sequentially with
`cache: "force-cache"` until one contains `data-rspack`. Each request has a
1.2 second timeout; fetch, CORS, CSP, and response failures produce no page
exception and no positive detection.

Production Rspack can be detected without HMR. HMR and React Refresh are
inspected separately by `rstack hmr inspect`. Use `stack --refresh` after
upgrading this Extension or when the same page URL already has a cached stack
result.

Add `@divebell/extension-mf` and open with `--mf` only when Module Federation
ownership or shared React evidence is needed.

Prepare the observation before changing code:

```sh
divebell rstack hmr start --expect applied --expect-refresh --expect-no-reload
# edit the source file only after status is ready
divebell rstack hmr wait <observation-id> --timeout 15000
divebell rstack hmr stop <observation-id>
```

`start` returns the `observationId`; `status`, `wait`, and `stop` may omit it
when exactly one observation is active in the current project.

`ready` has a precise meaning: the debugger is enabled for the current CDP
page session, the loaded compiled-JavaScript runtimes have been identified,
the required HMR status logpoint is bound, optional Refresh/error/reload
logpoints have been attempted, and the event, Console, optional page-state,
and MF evidence baselines have been persisted. It does not mean that a source
edit has already been detected. The result also returns
`nextAction: "change-source"`; make the edit only after this result.

The report keeps the HMR runtime, React Refresh runtime, changed module owner,
and MF shared React provider as separate evidence. Shared `react` and
`react-dom` traces are collected independently for every current MF consumer
or mixed runtime instance.

`inspect` reports React Fast Refresh preconditions in this order:

1. loaded ReactDOM build (`development`, `production`, or ambiguous);
2. whether `globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__` is installed;
3. registered renderer build and the `scheduleRefresh` / `setRefreshHandler`
   helpers.

`start --expect-refresh` fails before becoming ready when no compatible
development ReactDOM renderer is ready. This does not block plain Rspack HMR
observation.

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
