# Analyze Code Usage

This mode measures and explains. It does not modify application source, build
configuration, or chunking.

## Invariants

- Use the globally installed browser CLI that returned this Skill. Set
  `BROWSER_CLI` to that command (`divebell` or `bytedbrowser`); do not add the
  CLI or Extension to the app or switch browser tools mid-workflow.
- The browser page, Chunk Map, JavaScript, and source maps must be one build.
  Prove the match rather than inferring it from a filename.
- Reuse the intended authenticated profile and record the actual user workflow.
  Never bypass authorization.
- Coverage changes JavaScript-engine behavior. Collect readiness and memory in
  a separate load with coverage disabled.
- Keep builds, lint, and other heavy analysis out of both coverage and timing
  loads: interference can change which delayed code executes before a checkpoint,
  not only elapsed time. Preserve contaminated records and rerun the full phase
  under the fixed conditions; do not select samples by the resulting ratio or speed.
- “Unused” means unexecuted in the recorded workflows, not safely removable.
- Rank chunks by observed unexecuted bytes: the legacy `potentialSavingsBytes`
  equals `totalBytes - usedBytes`, not a net-savings bound. `coverageFloorBytes`
  equals observed `usedBytes`, not required remaining code; executed initialization
  can be deferred too. Source/package rows overlap chunks and are attribution only.

## 1. Confirm capability

Run:

```bash
BROWSER_CLI=<the CLI that returned this Skill>
"$BROWSER_CLI" code-usage --help
```

If unavailable, ask the user to install the global CLI and Code Usage
Extension. Do not install either in the application project.

Then establish the browser context before collecting any page evidence:

```bash
"$BROWSER_CLI" setup
```

If setup reports a Unix-socket path-length failure, retry it once with a short,
writable socket directory, for example:

```bash
export AGENT_BROWSER_SOCKET_DIR="$(mktemp -d /tmp/code-usage-browser.XXXXXX)"
"$BROWSER_CLI" setup
```

A browser-connection error from a sandbox is not proof that the user denied
Chrome access. Inspect its diagnostics and use the host's normal permission
or escalation flow to retry when socket, process, or profile access was
restricted. Do not disable approvals or bypass authentication. If the same
`needs_input` error (for example `DIVEBELL_SETUP_REMOTE_DEBUGGING_REQUIRED`)
persists in the permitted environment and the required connection is actually
unavailable, use `PAUSED` and report the exact evidence and user action. Reuse
the intended authenticated context through supported connection methods;
do not substitute an unauthenticated browser or manufacture page evidence.

## 2. Establish an analyzable build

Read project documentation, package files, build configuration, and startup
scripts to find the target URL, build mode, output/static base, and package
manager. Confirm the build emits `divebell-chunks.json`, JavaScript, and
JavaScript source maps.

For Modern.js use `@divebell/modern-plugin/chunk-map`; for Rspack/Rsbuild use
`@divebell/rspack-plugin`. Confirm every mapped JS and `.js.map` exists at the
asset base used by the browser.

Prefer a production build for production-size and production-chunking claims.
If an authenticated reverse-proxy workflow can only use a local dev server,
record it as local-analysis evidence. Enable external JS source maps, the
Chunk Map plugin, and an **analysis-only** write-to-disk flag so the exact dev
assets and maps can be supplied to the analyzer. For example, make
`dev.writeToDisk` conditional on `CODE_USAGE_LOCAL_ANALYSIS=1`, start the dev
server with that flag, and point `--assets` at its exact local static base.
Remove the temporary analysis setting after the experiment.

A reverse proxy can preserve the production hostname in Resource Timing and
DevTools even when its response came from the local server. Do not reject the
build merely because the asset URL is still a CDN URL. Instead prove local
serving with a response/dev-server marker or a dev asset identity, plus a
digest or exact-content comparison against the local asset; also confirm the
application rendered. Do not present HMR topology or offline compression as
production results.

## 3. Capture readiness before coverage

After creating or switching a page target and navigating, read its actual URL
and visible page state. For an experience capture, also read the installed
ready spec and verify the saved URL and `ready.specId` against the intended
measurement. An `open` success response alone does not prove that the active
target navigated or that its recorder belongs to this load. A blank, stale,
or mismatched target is not a valid sample; correct the context and recapture.

Ask once: “Can you provide a page or interaction ready signal (a Performance
mark/measure or a visible CSS selector)? If not, I will use the tool-default
`page-stable@3` signal unless an existing business signal can be verified.”
Do not block on an unanswered question.

Prefer a business Performance measure, then a mark, then a unique visible
selector. An existing signal discovered in source may be used after verifying
its firing boundary and current-page behavior. Announce it and record its
provenance as `discovered`, with source and runtime evidence, not
`user-provided`: passing an explicit CLI option does not establish human
provenance. Fix the signal before baseline and keep it identical for A/B.
If neither a supplied nor a verified existing signal is available, use the
default. Open a measurement-enabled page and save one experience file per phase:

```bash
"$BROWSER_CLI" open <page-url> --code-usage-experience
# Add one for a supplied or verified discovered signal:
# --code-usage-ready-measure <name>
# --code-usage-ready-mark <name>
# --code-usage-ready-selector <css>
"$BROWSER_CLI" code-usage experience \
  --output /tmp/first-screen.experience.json \
  --label first-screen
```

Without an explicit signal, `page-stable@3` waits for DOMContentLoaded and the
document root, FCP when available, initial network settling, no pending
JS/CSS/WASM fetch, and a 500ms render-quiet window. It allows at most two
ordinary requests in flight, falls back after a 10-second initial drain, and
times out after 30 seconds. Mark it as inferred; it is comparable but not a
business-ready event. Compare `ready.specId` in any later A/B. Version 3 fixes
initial requests that start before DOMContentLoaded and finish after it;
recapture both A and B instead of comparing it with historical `page-stable@2`.

Inspect `ready.initialNetworkDrain.fallbackUsed` and the reason. A drain
fallback is a bounded heuristic result, not evidence that initial work settled.
If repeated samples cluster around the configured drain deadline, the metric
may mask a real improvement. Keep those samples visible; diagnose pending
requests and use an available business signal or an independently recorded
rendering metric to assess the benefit. Never shorten the deadline after
seeing the candidate simply to make it appear faster.

## 4. Record coverage

Use a fresh browser page target for every first-screen capture. Chromium can
retain already compiled scripts across reloads in a reused target, which makes
an earlier route or interaction look like first-screen execution. Keep the
same authenticated browser profile, but create a blank tab, start coverage
there, then navigate it to the target page:

```bash
"$BROWSER_CLI" tab new about:blank
# Verify that the fresh target has the intended recorder/spec when used.
"$BROWSER_CLI" coverage start
"$BROWSER_CLI" goto <page-url>
# Verify the actual URL/spec and reach the fixed ready boundary before capture.
"$BROWSER_CLI" code-usage capture \
  --chunk-map <build-output>/divebell-chunks.json \
  --output /tmp/first-screen.coverage.json --label first-screen
```

Do not assume a new target inherits initialization. If the same-profile fresh
target has a missing or stale recorder/spec, preserve the authenticated profile
and the recorded init/ready/proxy configuration. Stop only a browser session
created and owned by this task, then reopen `about:blank` with that same
configuration; start coverage and navigate to the target. Recheck its actual
URL, recorder/spec, and coverage target before measuring. Never close the
user's other browser sessions; if a task-owned restart cannot be isolated,
pause and report the context problem instead.

Wait for the same recorded ready boundary or fixed workflow checkpoint before
taking coverage. For a representative interaction, take the first-screen
checkpoint, perform
the action with the same CLI, then use `code-usage capture --stop` under an
action-specific label. A checkpoint resets execution counts. If recording or
source capture fails, keep the raw evidence and rerun the phase from a fresh
target/start/navigation; blindly retrying the same checkpoint loses execution.

`code-usage capture` freezes a coverage checkpoint and reads actual compiled
runtime source only for scripts matching the supplied Chunk Map. It verifies
the target, URL, and debugger document identity; source comes from the current
renderer, never a later CDN fetch. The original ranges are retained alongside
`runtimeSource`, so the analyzer can verify exact content or a unique embedded
asset and align wrapper offsets (for example in micro-frontends). Check
`phase.contentIdentity.verified === true` before accepting ratios: every
target-app script instance must be `exact` or `embedded`, with zero `mismatch`
and zero `unverified`. Old source-less checkpoints are unverified; source
capture failure cannot fall back to them for optimization acceptance. A
matching URL, asset hash, or proxied HTTP body alone does not establish runtime
identity. Legal runtime wrappers require verified embedded-asset offset
alignment; mismatched scripts must not silently shrink the denominator.
Keep this debugger work in the coverage load, separate from experience loads.
The raw checkpoint `url` is the coverage-start URL (often `about:blank`); use
`captureEvidence.url` and its target/document evidence for the captured page.

## 5. Analyze and inspect

```bash
"$BROWSER_CLI" code-usage analyze \
  --chunk-map <build-output>/divebell-chunks.json \
  --coverage /tmp/first-screen.coverage.json \
  --experience /tmp/first-screen.experience.json \
  --output /tmp/code-usage-report.json

"$BROWSER_CLI" code-usage report /tmp/code-usage-report.json
```

Pass every coverage and experience phase together; their labels must match.
Use `--assets` when JS and maps are not beside the Chunk Map.

Inspect in this order:

1. Coverage scope: addressable, matched target-app, outside-build, and no-URL
   script counts. Fix target-app mapping before making ownership claims.
2. Aggregate target-app first-screen ratio, `used / total`, without adding
   overlapping source/package rows.
3. Chunk opportunities in descending observed unexecuted bytes (`potentialSavingsBytes`): total, used,
   unexecuted, source-map coverage, request timing, and owners.
4. Later interaction coverage, so “not on first screen” is not confused with
   “not needed by the product.”
5. Small, high-execution chunks that always arrive before the same ready point.
   This is a topology observation, not a claimed byte saving.

Before proposing dependency deduplication, verify the package's own version
against build metadata and the resolved module path. A pnpm peer suffix is not
the dependency version; two same-named packages are not necessarily duplicates
that can safely share one implementation.

## Report

State page/workflows, build mode and proof, artifact paths, matching scope,
ready signal/confidence, aggregate ratio, and an opportunity ledger ordered by
observed unexecuted bytes (`potentialSavingsBytes`). Distinguish this ranking
from net savings, which require a traced dependency boundary, rebuild and
recapture. Distinguish raw build bytes from production transfer bytes. Do not
claim a target chunk's percentage change is a page-level result.
