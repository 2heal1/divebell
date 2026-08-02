# Using Divebell Extensions

This guide is for agents and developers who install and use Extensions. To build your own Extension, go directly to [CLI Extension Development](cli-extensions.md). To look up fields and methods, use the [Extension API Reference](extension-api.md).

## What is an Extension?

Divebell provides general page operations, browser diagnostics, and optional Runtime capabilities. Teams also have their own account preparation, environment switching, stack detection, focused troubleshooting, and verification workflows. An Extension packages that reusable knowledge and those workflows as capabilities that agents can discover and invoke.

An Extension may provide:

- Commands mounted under `divebell`.
- Hooks that run during `open`, `detectStack`, and `close`.
- Skills that explain how to use complex commands and interpret their results.

Extensions are appropriate for development debugging workflows that a team will reuse. Use the existing CLI directly for a one-off page click or temporary check. If a capability must be exposed by the application itself as internal state, events, or allowed actions, use the [Runtime SDK API](runtime-sdk-api.md).

## Install an Extension

Install Divebell globally before adding Extensions:

```sh
npm install --global @divebell/cli
divebell --help
```

Do not add the CLI to the application. Installed Extensions are shared by the
global Divebell command.

### Install from npm

Install a trusted Extension by npm package name:

```sh
divebell extensions add @scope/package
```

See the [official Extensions in the README](../README.md#official-extensions) for available packages and their purposes.

### Install from a local directory

You can also pass a local Extension directory directly. Both relative and absolute paths are supported:

```sh
divebell extensions add ./path/to/my-extension
divebell extensions add /path/to/my-extension
```

Installing from a local directory is commonly useful when developing and debugging an Extension, and it can also install an Extension that is not published to npm. The directory must contain a valid Extension package declaration and a loadable entry.

Extensions execute local code, so install only packages or local directories with a known, trusted source. After installation, new commands appear in:

```sh
divebell --help
```

These commands reuse the page, browser session, and login state most recently opened by Divebell.

## Manage Extensions

```sh
divebell extensions list
divebell extensions update @scope/package
divebell extensions remove @scope/package
```

- `list` shows installed Extensions, commands, and hooks.
- `update` downloads and activates the latest version from npm by package name; the current version remains active if the update fails.
- `remove` uninstalls the specified Extension.

Extensions are installed by default in:

```text
~/.divebell/extensions
```

If `~/.divebell` is not writable, Divebell uses a private per-user temporary
directory. Set `DIVEBELL_HOME` to keep all Divebell session and Extension files
in a specific durable writable directory.

Set a separate directory when needed:

```sh
DIVEBELL_EXTENSIONS_DIR=/path/to/extensions divebell --help
```

Temporarily disable external Extension loading with:

```sh
DIVEBELL_DISABLE_EXTENSIONS=1 divebell --help
```

## Use an Extension

Use `divebell --help` to discover the available top-level commands, then run `divebell <command> --help` for that command's detailed usage and arguments. Select only the capability that matches the current task; do not run every diagnostic without a reason.

Page commands generally operate on the page most recently opened with `divebell open <url>`:

```sh
divebell open https://example.com
divebell <extension-command>
```

`divebell stack` runs stack detectors supplied by Extensions and returns the command that matches each detection:

```sh
divebell stack
divebell stack --refresh
```

A complex command may include a Skill. Print the Skill path without running the command with:

```sh
divebell <extension-command> --skill
```

When a workflow must manage the complete lifecycle for opening, waiting on, operating, and closing a page, use an [automation script](cli-automation-scripts.md) instead of an Extension command that depends on the most recently opened page.

## Security and boundaries

- Extensions execute locally. Load only trusted sources.
- Do not place test accounts, login state, temporary credentials, or other sensitive information in an Extension package or command output.
- An Extension must stay within the authorized account, environment, and page boundaries. It must not bypass access controls.
- Browser operations and diagnostics remain available when a page does not use Runtime SDK. Do not modify an application merely to run an Extension.
- After an action, continue reading the page result or wait for an explicit state. Do not claim success merely because a command ran.
