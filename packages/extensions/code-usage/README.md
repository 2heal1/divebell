# @divebell/extension-code-usage

> Ask your Agent: `Run divebell extensions add @divebell/extension-code-usage to install the Extension, then run divebell code-usage --skill and follow the returned Skill to analyze the current project and open a code-usage size report for the current page.`

This Divebell Extension maps browser code coverage back to build chunks, application source files, workspace packages, and third-party dependencies. It can create a JSON result, a standalone interactive report, or a local streaming report for larger page-experience results.

## Install

```bash
divebell extensions add @divebell/extension-code-usage
divebell code-usage --skill
```

The second command prints the path to the Agent skill shipped inside the
Extension package without starting an analysis.

The target build must produce an `divebell-chunks.json` file through `@divebell/modern-plugin/chunk-map` or `@divebell/rspack-plugin`. Keep the matching JavaScript files and source maps from the exact deployed build.

## Analyze recorded coverage

To include page-ready time and loading memory, measure them before starting
code coverage:

```bash
divebell open https://example.com/ --code-usage-experience
divebell code-usage experience \
  --output /tmp/first-screen.experience.json \
  --label first-screen
```

This separate load prevents code coverage from changing the performance
measurement. If the application exposes a real ready signal, append exactly one
of `--code-usage-ready-measure <name>`, `--code-usage-ready-mark <name>`, or
`--code-usage-ready-selector <css>` to `divebell open`. Otherwise the recorder
uses `page-stable@2` (DOMContentLoaded/root/FCP, at most two in-flight requests,
an initial network drain with a 10-second fallback, no pending JS/CSS/WASM
fetches, and a 500 ms render quiet window) and labels the result as inferred.
After the fallback, fetch/XHR activity contributes to the in-flight limit but
background completion alone does not reset render stability, so long polling,
telemetry, and HTML prefetching do not block readiness forever. The page
observer records the timestamp, so a later CLI call does not inflate ready
time.

Record one or more representative phases with the base CLI:

```bash
divebell open https://example.com/
divebell coverage start
divebell reload
divebell coverage take /tmp/first-screen.coverage.json --label first-screen
# Perform the next page journey.
divebell coverage stop /tmp/orders.coverage.json --label orders
```

Combine the recordings with build metadata:

```bash
divebell code-usage analyze \
  --chunk-map /path/to/dist/divebell-chunks.json \
  --coverage /tmp/first-screen.coverage.json \
  --coverage /tmp/orders.coverage.json \
  --experience /tmp/first-screen.experience.json \
  --experience /tmp/orders.experience.json \
  --output /tmp/code-usage-report.json
```

Experience files are optional, but when supplied their labels must match every
coverage phase. Without them, the report hides readiness and memory instead of
showing empty cards.

The Chunk Map and asset base can be local paths or HTTP/HTTPS URLs. When
JavaScript and source maps are not beside the Chunk Map, pass their directory
or URL with `--assets`.

## View the result

Create and open a standalone report:

```bash
divebell code-usage report /tmp/code-usage-report.json
```

Use `--no-open` to create the report without opening it. For a large report, start the local streaming viewer:

```bash
divebell code-usage serve /tmp/code-usage-report.json --port 4173
```

The standalone report is an artifact set. Keep the generated HTML, its reported
`dataPath`, and the neighboring `-code` directory together when moving or
sharing it. The command result prints all generated paths.

“Unused” means that code did not execute during the recorded journeys. It does not prove that the code can be removed.

Every phase also contains ranked optimization opportunities. They are ordered
by `potentialSavingsBytes`: the maximum raw JavaScript that could leave the
recorded phase if its unexecuted bytes are deferred or removed. The report also
shows `coverageFloorBytes`, the executed-byte coverage floor. Neither value is
a predicted output size: source/package opportunities can overlap their chunks,
and only a candidate build proves raw/gzip/brotli bytes and request count.
Implementation cost does not affect the order; confidence determines whether a
candidate can be acted on safely. Compare both the chosen target and all
JavaScript requested in the phase; a large percentage change in a small chunk
may have little page-level impact.

See the complete [code usage guide](../../docs/code-usage-analysis.md).
