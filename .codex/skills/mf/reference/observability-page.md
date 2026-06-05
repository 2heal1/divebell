# Observability: Page Observation

Use this reference for one-time browser page checks, such as "open/visit this
URL", "看下 MF 加载情况", or live diagnosis with no report yet.

## Route

- If the user already provided a report file, trace id, `read:` command, or
  browser reader expression, stop here and route to `observability-read.md` or
  `observability-analyze.md`.
- If a project path or local dev context is available, run Fast Integration
  Check, then follow its result:
  - Existing integration found: use the installed plugin report path in
    `observability-read.md`. Run the Chrome Debug Preflight below before
    starting a collector, opening, or reloading the page. If collector config is
    found, start `skills/mf/scripts/observability-collector.js` only after the
    preflight succeeds, then open or reload the page and read the collected
    report files. Otherwise open the page and read the existing browser report
    with `skills/mf/scripts/read-observability-report.mjs --scope auto`. Do not
    inject another observability plugin, do not use
    `skills/mf/scripts/open-observability-page.mjs`, and do not try Playwright
    or project tests.
  - Integration absent or unconfirmed: use Live Browser Injection.
- If no project context is available, use Live Browser Injection.

Do not read `observability-use.md` for one-time page checks unless the user asks
to install or keep the plugin in the project.

## Browser Control Rule

For one-time page checks, use a fixed Chrome debug profile by default. Do not
try the Codex Chrome plugin, do not operate the user's current tab directly, and
do not close or restart the user's daily Chrome. The fixed profile keeps its own
cookies and local storage across runs, but it is separate from the user's daily
Chrome profile. If the page needs login and this profile is not logged in yet,
open the page first, then ask the user to log in inside that debug window.

Run only the minimal browser observation path:

1. Optionally run one cheap availability check such as `curl -I <url>` for a
   local URL.
2. Run Fast Integration Check when project context is available.
3. Run Chrome Debug Preflight with the fixed debug profile before starting a
   collector, opening, reloading, or injecting into the target page.
4. If the installed plugin uses collector output, start
   `skills/mf/scripts/observability-collector.js`, then open or reload the
   target page. If it uses browser-reader output, open the page with
   `skills/mf/scripts/open-chrome-debug.mjs`.
5. Read the installed plugin report through the collector files or
   `skills/mf/scripts/read-observability-report.mjs`.
6. Analyze the report. If the report is unavailable, follow the permission or
   restart branch below.

Do not consult memory, run project tests, create Cypress/Playwright files, use
Electron/test browsers, use the Codex in-app Browser skill, or inspect broad
source history as a substitute for the browser report. A local demo URL still
uses this installed-plugin report path. Existing project tests can be mentioned
only when the user explicitly asks to run tests.

### Chrome Debug Preflight

Before any live page observation that needs to open, reload, inject into, or
read a browser page, verify the fixed Chrome debug profile first:

```bash
node skills/mf/scripts/open-chrome-debug.mjs --url about:blank --timeout-ms 3000 --json
```

This preflight must happen before starting
`skills/mf/scripts/observability-collector.js`. The helper creates and reuses
`~/.chrome-debug-profiles/mf-obs` by default, so Chrome can expose a debug port
without closing the user's daily Chrome.

If running the preflight is blocked by local permissions, rerun the same helper
with tool permission/escalation before starting a collector or page read. If it
returns `debug-port-unavailable`, do not restart the user's daily Chrome. Ask
the user to close the `mf-obs` debug Chrome window if it is already open, or
choose another debug port.

Only after the preflight succeeds should you start a collector, open the target
URL, reload the page, or run live injection.

For collector output, run the preflight first, start the collector, then run
this helper to open or reload the page. For browser-reader output, run the
preflight first, then open the page with this helper before reading the page:

```bash
node skills/mf/scripts/open-chrome-debug.mjs --url "<target-url>" --json
```

Use the returned `port`, `userDataDir`, and, when present, `pageId`. If `pageId` is missing, use
`--url-contains "<target-url>"` with the reader. The helper first reuses an
existing Chrome debug port when available and opens the target URL there;
otherwise it launches Chrome with the fixed debug profile and remote debugging
enabled. Do not use the user's daily Chrome profile and do not create a fresh
one-off `/tmp` profile unless the user explicitly asks for a stateless run.

Permission and restart handling are part of this flow:

- If running the helper or connecting to `127.0.0.1:<port>` is blocked by the
  Codex sandbox or local process permissions, immediately rerun the same built-in
  helper or reader with tool permission/escalation. Do not stop to ask the user
  for a business decision, and do not create ad hoc WebSocket or CDP scripts in
  `/tmp`.
- If the helper returns `debug-port-unavailable`, do not close, restart, or kill
  the user's daily Chrome. Ask the user to close the fixed debug-profile Chrome
  window if it is stuck, or choose another debug port.
- Do not answer "cannot determine" just because no debug port was available.
  Either open the debug session through the helper, request tool permission for
  the same helper, or ask for debug-profile cleanup/another port.

After opening the target URL, classify page-open failures before asking the
user to act:

- For localhost or local-network URLs, use a cheap request such as `curl -I` to
  distinguish service-down, wrong port, DNS, TLS, or HTML-fallback problems.
- If the page opens but redirects to a login page, shows an auth wall, or the
  app report says authentication is missing, ask the user to log in inside the
  fixed debug Chrome window, then reload and continue.
- If the page opens normally, continue directly to collector/read/analyze. Do
  not ask the user to log in just because the fixed profile is separate.

Do not use Playwright, Cypress, Electron, project e2e tests, the Codex in-app
Browser skill, or a generic browser automation runtime for the report read. The
skill already provides CDP helpers and collector helpers for this flow.

Do not use a quick-completion heuristic for normal page observation. A single
remote or shared event does not prove the page is finished, because Module
Federation may be only one part of the page. Also do not take screenshots unless
the user asks to inspect visual page state.

## Fast Integration Check

Run this only when a project path or local dev context is available.

1. Read the nearest `package.json`.
2. If `@module-federation/observability-plugin` is absent, use Live Browser
   Injection.
3. If the dependency exists, inspect only existing common entry/config files for
   `observability-plugin`, `createObservability`, `ObservabilityPlugin`,
   `runtimePlugins`, `plugins: [observability.plugin]`, `collector`, and
   `browser`:
   `rsbuild.config.*`, `rspack.config.*`, `webpack.config.*`,
   `vite.config.*`, `module-federation.config.*`,
   `modern.config.*`, `edenx.config.*`, `src/observability*`,
   `src/runtime*`, `src/bootstrap*`, `src/main*`, and local page files that
   import an `observability` helper.
   - `ObservabilityBuildPlugin` is the build-side companion and does not replace
     the runtime observability plugin. Do not conclude from
     `ObservabilityBuildPlugin` alone that the runtime report is unavailable.
     Continue the fast check in `runtimePlugins`, `src/observability*`,
     bootstrap, runtime, main, and page files before deciding whether runtime
     integration exists.
   - `createObservability(...)`, `ObservabilityPlugin(...)`, or
     `plugins: [observability.plugin]` means runtime integration exists when
     connected to the runtime/init/createInstance path.
4. If both dependency and registration are found, treat the installed plugin as
   authoritative for this task:
   - If `collector: true` or `collector: { enabled: true }` is found, complete
     Chrome Debug Preflight first, then route to `observability-read.md`, start
     `skills/mf/scripts/observability-collector.js`, and open or reload the
     target page.
   - Otherwise complete Chrome Debug Preflight first, then open the page
     through `skills/mf/scripts/open-chrome-debug.mjs --url "<target-url>" --json` and
     read the existing browser report with the built-in reader using
     `--scope auto`.
   - Do not use Live Browser Injection, do not run
     `skills/mf/scripts/open-observability-page.mjs`, and do not add a second
     observability plugin to a page that already registered one.
5. If only the dependency is found but no registration is found quickly, treat
   integration as unconfirmed. Do not block one-time diagnosis; use Live Browser
   Injection unless the user asked for project setup.

Do not run installs, builds, or broad repository searches for this decision.
Full project auditing belongs to `observability-use.md`, not one-time browser
diagnosis.

## Live Browser Injection

Use this when the project is not already integrated, integration cannot be
confirmed quickly, or no project path is available.

Use `scripts/open-observability-page.mjs` from the `mf` skill directory. The
script reads a ready-to-run `chrome-devtool` IIFE, wraps it with the preset
options below, registers the init script through Chrome CDP before navigation,
opens the target URL, and prints the reader expression for the fixed
`chrome_extension` scope. Run it after the fixed Chrome debug profile is ready.

Example:

```bash
node skills/mf/scripts/open-chrome-debug.mjs --url about:blank --json
node skills/mf/scripts/open-observability-page.mjs \
  --url "https://example.com/" \
  --port "<returned-port>" \
  --output "/tmp/mf-observability-open.json" \
  --json
```

The default IIFE path is `assets/observability-chrome-devtool.iife.js` inside
this skill. It is copied into the skill so live diagnosis does not need a
runtime build step. If a newer plugin build is needed, pass `--iife <file>` or
set `MF_OBSERVABILITY_IIFE`. Do not install the plugin into the user's project
unless the user asked for project setup.

The IIFE must expose `ChromeObservabilityPlugin` from the plugin's
`chrome-devtool` entry. The script does not run `esbuild`, does not import the
package at runtime, and does not generate a bundle during diagnosis. It presets
these options:

```ts
ChromeObservabilityPlugin({
  level: 'verbose',
  console: true,
  browser: {
    enabled: true,
    mode: 'development',
  },
  trace: {
    printStart: true,
  },
  devtools: {
    enabled: true,
    source: 'module-federation/observability',
  },
});
```

Do not pass `browser.scope`. The browser reader scope is fixed to
`chrome_extension` by the `chrome-devtool` export. The script reads the latest
report once before it exits and stores that in `initialRead`. Use `initialRead`
first. After additional user interaction or a later reload, route to
`observability-read.md` and reread
`window.__FEDERATION__.__OBSERVABILITY__.chrome_extension`.

After running `skills/mf/scripts/open-observability-page.mjs`, immediately open
the JSON written by `--output` and inspect these fields before doing anything
else:

```text
reportSource
initialReadAvailable
initialReadReportCount
initialReadLatestTraceId
initialRead
initialReadExceptionDetails
nextReadCommand
```

If `initialReadAvailable` is `true`, analyze `initialRead` directly and save
that output as the raw evidence for the current answer. Do not run another
reader just to confirm the same page load.

If `initialReadAvailable` is `false`, explain the `initialRead.readError`,
`initialReadExceptionDetails`, available `scopes`, and injection status from
the same output JSON. Then use `nextReadCommand` only if the page later receives
user interaction, reloads, or the user asks for a specific follow-up target.

Use the `nextReadCommand` / `readCommand` printed by this script only when a
later read is needed, or run the built-in reader directly:

```bash
node skills/mf/scripts/read-observability-report.mjs \
  --port "<returned-port>" \
  --page-id "<opened-page-id>" \
  --scope chrome_extension \
  --output "/tmp/mf-observability-report.json" \
  --json
```

Never create an ad hoc reader such as `/tmp/read-mf-report.mjs` or
`/private/tmp/read-*-cdp.*`. The live-injection path already has two supported
report sources: `initialRead` from
`skills/mf/scripts/open-observability-page.mjs`, then
`skills/mf/scripts/read-observability-report.mjs` for later reads.
