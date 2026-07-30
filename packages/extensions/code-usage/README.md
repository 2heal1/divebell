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
  --output /tmp/code-usage-report.json
```

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

“Unused” means that code did not execute during the recorded journeys. It does not prove that the code can be removed.

See the complete [code usage guide](../../docs/code-usage-analysis.md).
