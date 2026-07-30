# Using Divebell Extensions

Read this reference only when the task needs to install, manage, discover, or
use a Divebell Extension.

This reference covers Extension consumption. It does not cover Extension
development or Runtime SDK integration.

## What an Extension provides

A Divebell Extension can provide:

- Top-level commands mounted under `divebell`.
- Hooks that participate in `open`, `detectStack`, and `close`.
- A command-specific Skill for complex workflows.

Extensions reuse the page, browser session, Bridge, and authentication state
managed by the Divebell CLI.

Use an Extension for reusable stack detection, focused diagnostics, environment
preparation, or verification workflows. Use built-in Divebell commands for
ordinary page operations such as reading, clicking, filling, screenshots,
Console inspection, or Network inspection.

Extensions are optional. Divebell's built-in browser operations and diagnostics
work without an Extension.

## Install an Extension

Install only trusted npm packages or local directories.

From npm:

```bash
divebell extensions add <package>
```

From a local directory:

```bash
divebell extensions add ./path/to/extension
divebell extensions add /absolute/path/to/extension
```

Do not infer an npm package name from a framework name or from a detection ID.
Use only a package supplied by the user, the project, or trusted Divebell
documentation.

After installation, inspect the installed Extensions and current commands:

```bash
divebell extensions list
divebell --help
```

Installed Extension commands appear in the CLI help and run through the same
Divebell browser context as built-in commands.

## Manage Extensions

List installed Extensions:

```bash
divebell extensions list
```

Update an npm Extension:

```bash
divebell extensions update <package>
```

Remove an Extension:

```bash
divebell extensions remove <package>
```

The default Extension directory is:

```text
~/.divebell/extensions
```

Use another directory when required:

```bash
DIVEBELL_EXTENSIONS_DIR=/path/to/extensions divebell --help
```

Temporarily disable external Extension loading:

```bash
DIVEBELL_DISABLE_EXTENSIONS=1 divebell --help
```

## Detect stack capabilities

Stack detection is optional. Use it only when the task needs an
Extension-provided capability or when selecting among installed Extensions.

Open the target page first:

```bash
divebell open <url>
divebell stack
```

`stack` invokes `detectStack` hooks from installed Extensions only.

Divebell does not use `stack` to:

- Detect frameworks without an installed detector.
- Search for installable Extension packages.
- Recommend Extensions that are not installed.
- Route every browser task through an Extension.

Example matched result:

```json
{
  "data": {
    "detections": [
      {
        "id": "mf",
        "name": "MF",
        "extension": "mf-detector",
        "command": "mf"
      }
    ],
    "failures": [],
    "cached": false
  }
}
```

Interpret the result as follows:

- `data.detections[]` contains valid matches returned by installed detectors.
- `data.detections[].extension` identifies the installed Extension that
  produced the detection.
- `data.detections[].command` is the top-level command exposed by that same
  Extension.
- `data.failures` contains hook planning, execution, timeout, or validation
  failures.
- `data.cached: true` means Divebell reused a result for the same page URL and
  compatible detector set.

The Extension system validates that a returned `command` is actually declared
by the Extension that returned the detection.

The legacy `recommendedExtensions` field is unsupported. Do not use or expect
it.

## Handle empty detections or failures

An empty detection result is valid:

```json
{
  "data": {
    "detections": [],
    "failures": [],
    "cached": false
  }
}
```

It means only that the currently installed detectors returned no match. It does
not prove that the page has no framework or that an appropriate Extension does
not exist.

When `data.detections` is empty:

1. Inspect `data.failures`.
2. Decide whether the task actually requires an Extension-specific capability.
3. Continue with built-in Divebell commands when they can complete the task.
4. If an Extension is required, run `divebell extensions list` to inspect what
   is installed.
5. Install only a trusted Extension already identified by the user, project, or
   trusted Divebell documentation.
6. Rerun detection:

```bash
divebell stack --refresh
```

Do not guess an Extension package or command from a framework name, detection
ID, or Extension name.

## Use a detected command

Continue only when a relevant detection provides `command`.

Inspect the command:

```bash
divebell <command> --help
```

Use the installed help output for the command's description, arguments, and
subcommands.

When help reports that the command has a Skill, print its path without running
the command:

```bash
divebell <command> --skill
```

Read the returned `SKILL.md` in full before invoking the command.

A command-provided Skill applies only to that Extension subtask. After the
command completes, return to the primary workflow and continue operating the
page through Divebell.

Do not run every installed or detected Extension command. Use only the smallest
capability that matches the user's goal.

## Security and boundaries

- Extensions execute local code. Install and load only trusted sources.
- Keep credentials, test accounts, browser state, and other secrets out of
  Extension packages and command output.
- Stay within the authorized account, environment, and page boundaries.
- Do not bypass access controls.
- Do not modify an application merely to make an Extension runnable.
- A successful command exit is not sufficient proof of the page result. Read
  the resulting page or explicit verification evidence through Divebell.
