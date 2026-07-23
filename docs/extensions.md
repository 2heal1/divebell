# Using OpenRuntime Extensions

Chinese version: [OpenRuntime Extension 使用指南](extensions.zh-CN.md)

This guide is for agents and developers who install and use Extensions. To build your own Extension, go directly to [CLI Extension Development](cli-extensions.md). To look up fields and methods, use the [Extension API Reference](extension-api.md).

## What is an Extension?

OpenRuntime provides general page operations, browser diagnostics, and optional Runtime capabilities. Teams also have their own account preparation, environment switching, stack detection, focused troubleshooting, and verification workflows. An Extension packages that reusable knowledge and those workflows as capabilities that agents can discover and invoke.

An Extension may provide:

- Commands mounted under `openruntime`.
- Hooks that run during `open`, `detectStack`, and `close`.
- Skills that explain how to use complex commands and interpret their results.

Extensions are appropriate for development debugging workflows that a team will reuse. Use the existing CLI directly for a one-off page click or temporary check. If a capability must be exposed by the application itself as internal state, events, or allowed actions, use the [Runtime Core API](runtime-core-api.md).

## Install an Extension

Install a trusted Extension by npm package name:

```sh
openruntime extensions add @scope/package
```

See the [official Extensions in the README](../README.md#official-extensions) for available packages and their purposes.

Extensions execute local code, so install only packages with a known, trusted source. After installation, new commands appear in:

```sh
openruntime --help
```

These commands reuse the page, browser session, and login state most recently opened by OpenRuntime.

## Manage Extensions

```sh
openruntime extensions list
openruntime extensions update @scope/package
openruntime extensions remove @scope/package
```

- `list` shows installed packages, commands, and hooks.
- `update` downloads and activates the latest version; the current version remains active if the update fails.
- `remove` uninstalls the specified package.

Extensions are installed by default in:

```text
~/.openruntime/extensions
```

Set a separate directory when needed:

```sh
OPENRUNTIME_EXTENSIONS_DIR=/path/to/extensions openruntime --help
```

Temporarily disable external Extension loading with:

```sh
OPENRUNTIME_DISABLE_EXTENSIONS=1 openruntime --help
```

## Use an Extension

Check `openruntime --help` for a command's purpose and arguments, then select only the capability that matches the current task. Do not run every diagnostic without a reason.

Page commands generally operate on the page most recently opened with `openruntime open <url>`:

```sh
openruntime open https://example.com
openruntime <extension-command>
```

`openruntime stack` runs stack detectors supplied by Extensions and may recommend a more appropriate focused Extension:

```sh
openruntime stack
openruntime stack --refresh
```

A complex command may include a Skill. Print the Skill path without running the command with:

```sh
openruntime <extension-command> --skill
```

When a workflow must manage the complete lifecycle for opening, waiting on, operating, and closing a page, use an [automation script](cli-automation-scripts.md) instead of an Extension command that depends on the most recently opened page.

## Security and boundaries

- Extensions execute locally. Load only trusted sources.
- Do not place test accounts, login state, temporary credentials, or other sensitive information in an Extension package or command output.
- An Extension must stay within the authorized account, environment, and page boundaries. It must not bypass access controls.
- Browser operations and diagnostics remain available when a page does not use Runtime Core. Do not modify an application merely to run an Extension.
- After an action, continue reading the page result or wait for an explicit state. Do not claim success merely because a command ran.
