---
name: observe-rstack-hmr
description: Observe whether Rspack HMR and React Refresh apply successfully in the compiled JavaScript actually loaded by Chromium, including Module Federation shared React ownership evidence.
---

# Observe Rstack HMR

Use this skill for Rspack/Rsbuild development pages when a code change should
be verified through HMR without adding Divebell Runtime SDK code to the
application or React Refresh plugin.

The workflow observes only compiled JavaScript loaded by Chromium. It does not
read source maps or accept TypeScript source locations.

## Required order

1. Open the development page. Add `--mf` when Module Federation ownership and
   shared React evidence are required.
2. Run `divebell stack --refresh`. Continue with the Rstack workflow only when
   it reports `id: "rspack"`. Detection sequentially checks every distinct
   fetched `index*`, `*main*`, and `runtime*` entry until one contains the
   `data-rspack` string. A production page may be detected without an HMR
   runtime.
3. Run `divebell rstack hmr inspect` if compatibility is not known.
4. Run `divebell rstack hmr start ...` and wait until it returns `status:
   "ready"` and `nextAction: "change-source"`.
5. Only after `ready`, change the source file.
6. Run `divebell rstack hmr wait <observation-id> --timeout 15000`.
7. Run `divebell rstack hmr stop <observation-id>` when no more evidence is
   needed.

The stack detector does not install page-load DOM observers or enable the
Debugger. Candidate URL discovery reads `document.scripts` plus Script
Resource Timing so a removed script URL may still be considered. Fetch, CORS,
CSP, timeout, or response failures are not positive evidence. HMR runtime
presence is separate capability evidence and is checked by `inspect`.

`wait` may start before or after the file write because the debugger keeps a
persistent event ring. `start` must finish before the file write.

`ready` means the current CDP document and compiled HMR/Refresh components are
fixed, the required HMR status logpoint is bound, optional probes have been attempted,
and the event/Console/state/MF baselines and observation ID are durable. It
does not mean a source edit was detected or that an HMR cycle succeeded.

## Expectations

Use `--expect applied` to require a complete apply-to-idle path. Add
`--expect-refresh` for a compatible React Refresh boundary and completed
refresh call. Add `--expect-no-reload` to reject reload fallback.

Before preparing React Refresh observation, read `reactRefreshPreflight` in this order:

1. `reactDom` identifies the loaded development/production renderer builds;
2. `globalHook` reports whether the React DevTools global hook exists;
3. `refreshRenderer` reports renderer registration and required Refresh
   scheduling helpers.

Production ReactDOM and a missing/late global hook are different failures.
Production ReactDOM exposes no Refresh scheduling helpers. A development
ReactDOM evaluated before the hook may also be absent from the hook's renderer
registry.

Plain Rspack HMR does not require React, React Refresh, Bridge, or Module
Federation. React Refresh is an additional result, never the definition of
whether the module HMR cycle applied.

## Read command results

`inspect` is a compatibility and discovery report. Read its fields as follows:

- `supported` answers only whether at least one supported Rspack HMR runtime
  was found. It does not mean React Refresh is ready.
- `hmrRuntimes` contains Rspack HMR state machines. These produce HMR status
  paths and apply/fail/abort outcomes.
- `reactRefreshRuntimes` contains React Refresh adapters. They classify React
  boundaries and may schedule Refresh, invalidate a boundary, or request a
  reload. An HMR runtime and a React Refresh adapter may be compiled into the
  same script; that is not two HMR state machines.
- `reactRefreshPreflight` checks the loaded ReactDOM build, the global DevTools
  hook, and the registered Refresh-capable renderer. Its `reactDom.scripts`
  entries are source evidence, not a renderer count or proof of ownership.
- `probePlans` lists non-pausing logpoint locations that `start` can attempt to
  install. No plan is installed by `inspect`. Associate each plan with one of
  the two runtime lists through `runtimeKind` and `runtimeId`.
- `warnings` records partial source-search or profile-recognition failures.

`start` returns `hmrRuntimeCount`, `reactRefreshRuntimeCount`, and
`installedProbeCount`. These count only runtime components selected for the
current CDP page session and probes successfully installed for the observation.
Do not edit source until `status: "ready"` is returned.

`status` and `wait` return the current or final HMR result:

- `outcome` and `cycles` describe Rspack HMR; each `cycles[].runtimeId`
  references `hmrRuntimes`.
- `refresh` describes the React Refresh boundary path and is interpreted with
  `reactRefreshRuntimes` and `reactRefreshPreflight`.
- `pageReload` is independent evidence of a reload request and main-document
  commit.
- `shared` reports optional MF runtime and shared `react`/`react-dom` provider
  evidence. Do not infer shared ownership from a script URL alone.
- `capabilities`, `gaps`, `warnings`, and `recommendedActions` state which
  conclusions were supported and what to do next.

With `--verbose`, `evidence.installedProbes` lists the logpoints actually owned
by the observation and `evidence.events` lists their normalized events. These
are diagnostic details, not additional success criteria.

To verify page state, pass a JSON file through `--state-check`:

```json
{
  "checks": [
    { "name": "counter", "selector": "#counter", "property": "textContent" },
    { "name": "input", "selector": "#name", "property": "value" }
  ]
}
```

State is reported only as `verified-preserved`, `verified-reset`, or
`not-verified`.

## Module Federation boundary

Keep these identities separate in every conclusion:

- changed module owner;
- Rspack HMR runtime that applied the update;
- React Refresh runtime whose boundary branch ran;
- selected `react` and `react-dom` shared provider for each consumer/runtime
  instance/share scope.

A Remote using React supplied by the Host does not make the Host the owner of
the Remote's HMR update. Missing or ambiguous MF evidence must remain
`unavailable`, `not-observed`, or `ambiguous`.

## Page reload boundary

Treat a main-document commit as `reloaded`, even if an apply-to-idle HMR path
was observed first. The command waits through its page-reload settle window
before returning applied success. Do not use DOM changes, React renders, or
Bridge lifecycle calls as evidence that the page stayed in the same document.

## Failure follow-up

Use `status --verbose` to inspect status paths, probe locations, module IDs,
errors, reload events, and evidence gaps. A debugger gap makes the result
unknown; start a new observation and reproduce the edit instead of inferring
success from a trailing `idle` event.
