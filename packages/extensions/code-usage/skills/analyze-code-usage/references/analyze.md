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
- “Unused” means unexecuted in the recorded workflows, not safely removable.
- `potentialSavingsBytes` ranks a chunk's possible phase deferral. Source and
  package rows overlap their containing chunks and are attribution only.

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

If setup still returns a stable `needs_input` browser-connection error such as
`DIVEBELL_SETUP_REMOTE_DEBUGGING_REQUIRED`, set the workflow state to
`PAUSED`. Report the exact code and the required user action (for example,
approve the Chrome remote-debugging connection). Do not open a replacement
browser, bypass the signed-in profile, or continue to `open`, coverage, or
analysis. The Skill cannot turn an unavailable browser context into evidence.

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

Ask once: “Can you provide a page or interaction ready signal (a Performance
mark/measure or a visible CSS selector)? If not, I will use the tool-default
`page-stable@2` signal.” Continue with the default if no answer is available.

Prefer a business Performance measure, then a mark, then a unique visible
selector. Open a measurement-enabled page and save one experience file per
phase:

```bash
"$BROWSER_CLI" open <page-url> --code-usage-experience
# Add one only when supplied:
# --code-usage-ready-measure <name>
# --code-usage-ready-mark <name>
# --code-usage-ready-selector <css>
"$BROWSER_CLI" code-usage experience \
  --output /tmp/first-screen.experience.json \
  --label first-screen
```

Without a supplied signal, `page-stable@2` waits for DOMContentLoaded and the
document root, FCP when available, initial network settling, no pending
JS/CSS/WASM fetch, and a 500ms render-quiet window. It allows at most two
ordinary requests in flight, falls back after a 10-second initial drain, and
times out after 30 seconds. Mark it as inferred; it is comparable but not a
business-ready event. Compare `ready.specId` in any later A/B.

## 4. Record coverage

Use a fresh browser page target for every first-screen capture. Chromium can
retain already compiled scripts across reloads in a reused target, which makes
an earlier route or interaction look like first-screen execution. Keep the
same authenticated browser profile, but create a blank tab, start coverage
there, then navigate it to the target page:

```bash
"$BROWSER_CLI" tab new about:blank
"$BROWSER_CLI" coverage start
"$BROWSER_CLI" goto <page-url>
"$BROWSER_CLI" coverage take /tmp/first-screen.coverage.json --label first-screen
```

Wait for the same recorded ready boundary or fixed workflow checkpoint before
taking coverage. For a representative interaction, take the first-screen
checkpoint, perform
the action with the same CLI, then stop coverage under an action-specific
label. If recording fails, cancel coverage, correct the environment, and retry.

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
3. Chunk opportunities in descending `potentialSavingsBytes`: total, used,
   unexecuted, source-map coverage, request timing, and owners.
4. Later interaction coverage, so “not on first screen” is not confused with
   “not needed by the product.”
5. Small, high-execution chunks that always arrive before the same ready point.
   This is a topology observation, not a claimed byte saving.

## Report

State page/workflows, build mode and proof, artifact paths, matching scope,
ready signal/confidence, aggregate ratio, and an opportunity ledger ordered by
`potentialSavingsBytes`. Distinguish raw build bytes from production transfer
bytes. Do not claim a target chunk's percentage change is a page-level result.
