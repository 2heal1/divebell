---
name: analyze-code-usage
description: Use the Divebell Code Usage Extension to analyze the current web project and page, map browser-executed JavaScript to initial and async chunks, application source, workspace packages, and third-party dependencies, and generate a code-usage size report. Use when the user asks to inspect initial-page code cost, executed or unused code size, chunk usage, dependency usage, lazy-loading opportunities, or a code-usage report for the current project or page with the globally installed divebell command.
---

# Analyze page code usage

Use `divebell coverage` to record real page workflows, then use
`divebell code-usage` to match execution ranges to the Chunk Map, JavaScript,
and source maps from the same production build.

This skill ships with `@divebell/extension-code-usage` and is discoverable
through `divebell code-usage --skill`.

## Working principles

- Use the globally installed `divebell`; do not add `@divebell/cli` or the
  Extension to the application project.
- The page, Chunk Map, JavaScript, and source maps must come from the same
  production build. Stop attribution when that cannot be proven; never guess
  from a filename.
- Reproduce the account, environment, page, and user path that matter to the
  request. Reuse existing login state and never bypass authorization boundaries.
- Code coverage changes JavaScript-engine behavior. Do not use loading-speed or
  memory measurements collected with coverage enabled as performance evidence.
- "Unused" means only that the explicitly recorded workflows did not execute
  that code. It does not prove that the code can be removed.
- After changing lazy loading or chunking, rebuild and record the same pages,
  phases, and actions again.

## 1. Confirm the command

Run:

```bash
divebell code-usage --help
```

If `divebell` is unavailable, ask the user to install `@divebell/cli` globally
and run `divebell setup`. If the `code-usage` command is missing, ask the user
to run:

```bash
divebell extensions add @divebell/extension-code-usage
```

Do not install the CLI or Extension in the application project.

## 2. Prepare an exact production build

1. Read the project documentation, package files, build configuration, and
   startup scripts to identify the build tool, production build command, output
   directory, and page URL.
2. Check whether the build already emits `divebell-chunks.json` and JavaScript
   source maps.
3. For Modern.js, use `@divebell/modern-plugin/chunk-map`. Use only this
   build-time entry; do not add the WIP runtime plugin.
4. For Rspack or Rsbuild, use `@divebell/rspack-plugin`.
5. If another build tool has no available Chunk Map integration, report the
   unsupported setup. Do not simulate build relationships.

Minimal Modern.js integration:

```ts
import { appTools, defineConfig } from "@modern-js/app-tools";
import { divebellChunkMapPlugin } from "@divebell/modern-plugin/chunk-map";

export default defineConfig({
  plugins: [appTools(), divebellChunkMapPlugin()]
});
```

Minimal Rspack integration:

```ts
import { DivebellChunkMapRspackPlugin } from "@divebell/rspack-plugin";

export default {
  plugins: [new DivebellChunkMapRspackPlugin()]
};
```

Use the project's existing package manager to add the matching build plugin,
enable JavaScript source maps, and run a production build. Confirm that the
JavaScript and `.js.map` files referenced by the Chunk Map exist, then serve
the page from that exact output.

Change build configuration only when the user requested a report and the
required integration is missing. Do not redesign unrelated build settings.

## 3. Record the current page and representative workflows

Use project documentation, routes, and existing end-to-end tests to identify
the page URL and an explicit ready condition. Open the page in the intended
account and environment, start coverage, then reload so initial execution
happens after recording begins:

```bash
divebell open <page-url>
divebell coverage start
divebell reload
# Wait for an explicit page-ready condition.
```

For a multi-phase report, save the first screen, perform one representative
user action, and stop:

```bash
divebell coverage take /tmp/first-screen.coverage.json --label first-screen
# Use divebell click, fill, goto, run-action, or another page command.
divebell coverage stop /tmp/interaction.coverage.json --label interaction
```

If the user requested only the first screen, use `coverage stop` for the
first-screen file and omit the second phase. Every `coverage take` resets
execution counts. Give each phase a name that describes the real action.

If recording fails, run `divebell coverage cancel`, fix the page, login, or
wait condition, and retry.

## 4. Generate and open the report

Use the build output that exactly matches the page:

```bash
divebell code-usage analyze \
  --chunk-map <production-output>/divebell-chunks.json \
  --coverage /tmp/first-screen.coverage.json \
  --coverage /tmp/interaction.coverage.json \
  --output /tmp/code-usage-report.json

divebell code-usage report /tmp/code-usage-report.json
```

Pass `--assets <production-output>` only when the JavaScript and source maps
are not beside the Chunk Map. Trusted HTTP or HTTPS build URLs are also
supported, but every artifact must still match the page's exact build.

## 5. Inspect the result

1. Check unmatched scripts first. Explain external third-party scripts
   separately. If an application script is unmatched, fix the build mapping
   before making source-ownership claims.
2. Inspect large, low-use application files, workspace packages, and
   third-party dependencies on the first screen.
3. Identify their initial or async chunks and the recorded split rule.
4. Compare critical interaction phases so "not needed initially" is not
   confused with "not needed by the product."
5. Change code or chunking only when the user asked for optimization. Rebuild
   and rerun the exact same workflow afterward.

## 6. Report

Clearly state:

1. The page and interaction phases that were recorded.
2. The build output and report path.
3. Whether any application scripts were unmatched.
4. The largest low-use sources in the requested phase.
5. Lazy-loading or chunking candidates and the evidence for each.
6. Which workflows the "unused" result covers and which remain unrecorded.
7. If an optimization was made, the before-and-after result from the same
   build and page workflow.
