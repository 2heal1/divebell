# CLI Extension Local Development Demo

Chinese version: [CLI Extension 本地开发 Demo](README.zh-CN.md)

This demo accompanies [CLI Extension Development](../../docs/cli-extensions.md). See the [Extension API Reference](../../docs/extension-api.md) for fields and methods. It demonstrates:

- keeping the entry declaration-only and loading Command and Hook implementations on demand;
- reading subcommands and repeated options from `options.args`;
- returning success or a request for additional input through `options.output`;
- checking `options.page` and reading the current page through `options.openruntime.browser`; and
- using the `open`, `detectStack`, and `close` Hooks.

## Run in the repository

Install dependencies and build the CLI from the repository root:

```sh
pnpm install
pnpm --filter @openruntime/cli build
```

Load the demo and confirm that its Command appears:

```sh
OPENRUNTIME_EXTENSIONS_DIR="$PWD/demos/cli-extension/index.mjs" \
  node packages/cli/dist/bin.js --help
```

Run the Command path that does not require a page:

```sh
OPENRUNTIME_EXTENSIONS_DIR="$PWD/demos/cli-extension/index.mjs" \
  node packages/cli/dist/bin.js extension-demo hello --name Codex
```

Then verify the page flow:

```sh
export OPENRUNTIME_EXTENSIONS_DIR="$PWD/demos/cli-extension/index.mjs"
node packages/cli/dist/bin.js open https://example.com --no-bridge
node packages/cli/dist/bin.js extension-demo page
node packages/cli/dist/bin.js stack --refresh
node packages/cli/dist/bin.js close
```

`page` returns the page URL, title, and marker injected by the `open` Hook. `stack` detects `OpenRuntime CLI Extension Demo`.

## Run the demo tests

```sh
pnpm --dir demos/cli-extension test
```

The tests do not start a browser. They use representative inputs to check argument handling, output, missing-page behavior, and Hooks. Before publishing a real Extension, also run the complete workflow against the target page as described in the development guide.
