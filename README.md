<p align="center">
  <img src="./assets/openruntime.svg" width="120" alt="OpenRuntime" />
</p>

<h1 align="center">OpenRuntime</h1>

<p align="center">
<b>Expose your application's runtime to AI Agents.</b>
<br/>
Runtime API for AI-powered development.
</p>

---

English | [中文](./README.zh-CN.md)

Agent usage: [OpenRuntime Skill](./skills/openruntime/SKILL.md)

# OpenRuntime

OpenRuntime is a frontend **Runtime API** for Agents.

It defines a unified set of runtime interfaces that allow applications to expose their runtime state, key events, and executable actions to Agents in a structured way, instead of forcing Agents to infer what is happening on the page from the DOM, screenshots, Console, or Network alone.

OpenRuntime defines five core Runtime APIs:

- **Target** — declares which objects on the page can be referenced, waited for, or observed
- **Snapshot** — reads the current runtime state of the page
- **Event** — reads key events produced during runtime
- **Action** — declares business actions that the page allows Agents to invoke
- **waitFor** — waits for a specific Target to reach a target state

Together, these APIs form a unified Runtime protocol.

Whether a page is built with React, Modern.js, Module Federation, Garfish, or a regular frontend stack, it can use OpenRuntime to expose its runtime semantics, allowing different Agents to validate, debug, and automate with the same API set.

---

## Why OpenRuntime

Today, most AI Coding Agents can already:

- modify code
- start projects
- open browsers
- interact with pages

However, when verifying whether a page has actually been fixed, they still mainly rely on:

- DOM
- Screenshots
- Console
- Network
- Browser Automation

These signals reflect how the page appears externally, but they struggle to answer the questions that truly matter:

- What state is the page really in right now?
- Which step has not completed?
- Which module is blocking the page?
- Which actions is the Agent allowed to execute?
- What should the Agent wait for instead of continuously polling the page?

As a result, many validation flows are still built on top of "guessing".

OpenRuntime aims to expose these business semantics directly, so Agents can make decisions based on Runtime information instead of page appearance.

---

## Runtime API + Browser Control

Runtime API is the core capability of OpenRuntime.

In addition, OpenRuntime provides a CLI and local Bridge, enabling Agents to access these Runtime APIs directly.

The CLI also provides browser control capabilities, including:

- opening pages
- navigation
- clicking
- typing
- taking screenshots
- inspecting Network
- inspecting Console
- importing and exporting browser profiles

Browser capabilities are responsible for entering pages and collecting external information.

Runtime API is responsible for providing the real internal runtime state of the page.

For Agents, it is recommended to read Runtime API first and then combine it with browser capabilities for validation, instead of relying entirely on browser automation.

For browser login state export, import, inspection, and cleanup, see [Browser Auth Profiles](docs/auth-profiles.md). Chinese documentation is available at [浏览器登录态 Profile](docs/auth-profiles.zh-CN.md).

---

## Record a Browser Workflow

OpenRuntime includes an installable Agent skill that turns one manual browser walkthrough into a reusable JavaScript automation draft.

After the skill starts a visible browser, the user can navigate, click, type, and optionally describe the intended result by voice. When the user says the workflow is complete, the Agent closes the browser, aligns the recorded actions with page state and speech timestamps, and produces a script that can be reviewed and run again.

This workflow is useful when the expected automation is easier to demonstrate than to describe from scratch. The first version generates a JavaScript script rather than a new skill, making the result easier to inspect, test, and refine.

- Skill: [`record-openruntime-workflow`](./skills/record-openruntime-workflow/SKILL.md)
- Guide: [Record Browser Workflows with an Agent](./docs/record-browser-workflows.md)
- Runtime delivery: downloaded from a versioned GitHub Release, verified with SHA-256, and cached locally.
- Demo video: [Watch the browser recording workflow](https://github.com/2heal1/openruntime/releases/download/demo-assets-v1/openruntime-recording-skill-demo.mp4).

Chinese documentation is available at [录制浏览器操作并生成脚本](./docs/record-browser-workflows.zh-CN.md).

---

## Example

For example, a Release Notes page integrated with OpenRuntime can declare:

Target:

```text
docs:release-notes
```

Action:

```text
release-note.list-latest
```

When an Agent retrieves the latest Release Notes, it can follow a stable flow:

```sh
openruntime start

openruntime open \
  https://example.com/openruntime/release-notes

openruntime verify \
  docs:release-notes ready \
  --url https://example.com/openruntime/release-notes

openruntime run-action \
  --url https://example.com/openruntime/release-notes \
  release-note.list-latest \
  --payload '{"limit":3}'
```

Both the Target and Action here are declared by the page.

The Agent does not need to analyze the DOM or look for buttons. It only needs to call the unified Runtime API to get the result.
`verify` is intentionally conservative: it only treats a declared business Target as final validation, and does not turn framework or loading-state Targets into business success.
Use `wait-for` when the goal is only to wait for a specific Target state; use `verify` when the goal is final validation.

Teams can further wrap these steps into their own commands:

```sh
openruntime release-note latest --limit 3
```

This turns page capabilities into a stable Runtime that Agents can call, rather than one-off browser scripts.

---

## CLI Commands

OpenRuntime CLI can load local command files. This is useful when a team wants to add private page operation commands without changing the OpenRuntime source code.

This section is about page command development: the agent runs `openruntime open <url>` first, and the command operates on the current opened page. Use standalone automation scripts when the workflow needs to open the browser and manage the automation flow itself.

See [CLI Command Development](docs/cli-extensions.md) for the export shape, `run(options)` fields, the full `options.openruntime` API, and a complete GitHub release example. Chinese documentation is available at [CLI 命令开发](docs/cli-extensions.zh-CN.md).

For standalone scripts that open the browser, wait for the page, and run page operations, see [Automating with OpenRuntime CLI](docs/cli-automation-scripts.md). Chinese documentation is available at [使用 OpenRuntime CLI 编写自动化脚本](docs/cli-automation-scripts.zh-CN.md).

Command files are loaded from:

```text
~/.openruntime/commands
```

You can override the directory:

```sh
OPENRUNTIME_COMMANDS_DIR=/path/to/commands openruntime --help
```

You can disable external command loading:

```sh
OPENRUNTIME_DISABLE_COMMANDS=1 openruntime --help
```

Two file layouts are supported:

```text
~/.openruntime/commands/foo.mjs
~/.openruntime/commands/foo/index.mjs
```

External commands are shown separately in help:

```text
External Commands:
  openruntime foo ping - Runs Foo.
```

Complex commands may declare one local `SKILL.md`. Help lists the commands that provide a skill, and this command prints its absolute path:

```sh
openruntime foo --skill
```

If an external command conflicts with a built-in command or an internal command, OpenRuntime skips the external command and prints a warning. A broken command also does not crash the CLI; it is reported as a warning while commands are loaded.

Use `defineCommand(...)` and `validateCommand(...)` in command files, tests, or CI to keep the exported command shape valid.

External commands are local code execution. Only load files you trust.

---

## Architecture

```text
                    Application
                         │
                         ▼
                  OpenRuntime SDK
                         │
                         ▼
                   Runtime Center
      ┌──────────────────────────────────┐
      │ Target                           │
      │ Snapshot                         │
      │ Event                            │
      │ Action                           │
      │ waitFor                          │
      └──────────────────────────────────┘
                         │
                   Bridge Protocol
                         │
                         ▼
                    OpenRuntime CLI
      ┌──────────────────────────────────┐
      │ Runtime API                      │
      │ Browser Control                  │
      │ Screenshot                       │
      │ Network                          │
      │ Console                          │
      │ Browser Profile                  │
      └──────────────────────────────────┘
```
