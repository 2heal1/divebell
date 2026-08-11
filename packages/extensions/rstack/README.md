# `@divebell/extension-rstack`

Observe Rspack HMR and React Refresh through non-pausing logpoints in the
compiled JavaScript loaded by Chromium. The Extension does not require source
maps and does not integrate `@divebell/core` into the application or
`@rspack/plugin-react-refresh`.

Install both the Rstack and MF Extensions, then open the page:

```sh
divebell extensions add @divebell/extension-mf
divebell extensions add @divebell/extension-rstack
divebell open http://localhost:3000 --mf
```

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

Use `wait` with `--expect applied` for a pass/fail answer. On failure, rerun
`status <observation-id> --verbose` to inspect the runtime-scoped status path,
module IDs, compiled locations, probe gaps, Refresh boundary branch, reload
evidence, and MF owner/provider evidence. Compilation failures are explicitly
reported as Console fallback evidence because no build-server integration is
required.
