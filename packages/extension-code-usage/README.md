# @openruntime/extension-code-usage

This OpenRuntime Extension maps browser code coverage back to build chunks, application source files, workspace packages, and third-party dependencies. It can create a JSON result, a standalone interactive report, or a local streaming report for larger page-experience results.

## Install

```bash
openruntime extensions add @openruntime/extension-code-usage
```

The target build must produce an `openruntime-chunks.json` file through `@openruntime/modern-plugin/chunk-map` or `@openruntime/rspack-plugin`. Keep the matching JavaScript files and source maps from the exact deployed build.

## Analyze recorded coverage

Record one or more representative phases with the base CLI:

```bash
openruntime open https://example.com/
openruntime coverage start
openruntime coverage take /tmp/first-screen.coverage.json --label first-screen
# Perform the next page journey.
openruntime coverage stop /tmp/orders.coverage.json --label orders
```

Combine the recordings with build metadata:

```bash
openruntime code-usage analyze \
  --chunk-map /path/to/dist/openruntime-chunks.json \
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
openruntime code-usage report /tmp/code-usage-report.json
```

Use `--no-open` to create the report without opening it. For a large report, start the local streaming viewer:

```bash
openruntime code-usage serve /tmp/code-usage-report.json --port 4173
```

“Unused” means that code did not execute during the recorded journeys. It does not prove that the code can be removed.

See the complete [English guide](../../docs/code-usage-analysis.md) or [中文指南](../../docs/code-usage-analysis.zh-CN.md).
