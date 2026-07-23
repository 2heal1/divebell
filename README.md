<p align="center">
  <img src="./assets/openruntime.svg" width="120" alt="OpenRuntime" />
</p>

<h1 align="center">OpenRuntime</h1>

<p align="center">
<b>Let coding agents debug and verify real web scenarios autonomously.</b>
<br/>
A web development debugging tool for coding agents.
</p>

---

English | [中文](./README.zh-CN.md)

Agent entry point: [OpenRuntime Skill](./skills/openruntime/SKILL.md)

# OpenRuntime

OpenRuntime is a **web development debugging tool** for coding agents.

It helps agents reproduce, diagnose, and verify problems in real, authorized, and repeatable browser scenarios, reducing the number of times a person has to log in, grant access, demonstrate a flow, or confirm an intermediate result.

OpenRuntime does not replace the coding agent that edits source code, and it is not a backend debugger. It provides the browser context, diagnostic capabilities, and verification evidence needed before and after a code change so the agent can keep working between code and the real page.

---

## Why OpenRuntime

OpenRuntime addresses four problems:

1. General browser tools must rediscover the page, plan operations, and handle waits each time. Reasoning from scratch gets slower as the page and user journey become more complex.
2. Users discover problems on the web, while diagnostic tools often live in CLIs. A person usually has to extract page context for the agent and carry CLI results back to the browser. OpenRuntime lets the agent connect both sides in the same page and session.
3. Working sign-in methods, user journeys, diagnostics, and verification flows can be saved as Auth Profiles, scripts, Extensions, or Skills, then reused by other agents and CI as a growing team asset.
4. A real scenario needs more than a URL: it also needs a test account, login state, target environment, prepared data, and success criteria. OpenRuntime prepares and reuses these conditions so the agent can move from reproduction and diagnosis through code changes and re-verification.

The goal is not to bypass authorization. It is to make authorization, test accounts, and allowed actions explicit, reusable, and inspectable.

## A Real Development Debugging Flow

Consider an orders page that is only available after sign-in:

1. The team imports a test account's login state, or provides account and environment setup through an Extension.
2. The agent opens the real page in a named session and reproduces the user journey.
3. OpenRuntime reads page errors, requests, page state, memory, or code execution. If the page uses Runtime Core, it can also read application-internal state.
4. The coding agent edits the source based on that evidence.
5. OpenRuntime reuses the same account, session, and page context to reload and verify the result.
6. Troubleshooting or verification logic worth keeping can become an Extension, an automation script, or a Runtime Core signal.

Browser operation is the foundation of this flow, not the product boundary. OpenRuntime focuses on entering real scenarios, preserving development context, applying specialized diagnostics, and verifying changes repeatably.

See [Coding Agent Development Debugging Loop](./docs/agent-devloop.md) for the complete workflow.

## Core Capabilities

| Module | Responsibility | Entry point | Page integration required |
| --- | --- | --- | --- |
| Auth Profiles | Export, import, and reuse browser login state | `openruntime auth` | No |
| Browser Session & Diagnostics | Manage page sessions, operate pages, and read Console, Network, screenshots, and code execution | OpenRuntime CLI | No |
| Extensions | Add account and environment setup, stack detection, focused diagnostics, verification commands, and Skills | CLI commands, Extension API | No |
| Runtime Core | Expose application-internal state, events, declared actions, and wait conditions | `@openruntime/core`, framework plugins | Yes |

### Auth Profiles

An Auth Profile stores browser login state that has already been authorized. It does not create an account or bypass authorization. `auth export`, `auth import`, `auth list`, and `auth clear` manage login state; later `openruntime open` calls automatically reuse imported state.

[Browser Auth Profiles](./docs/auth-profiles.md)

### Browser Session & Diagnostics

`openruntime open` creates a reusable page context, and `--session` identifies the session. Page and diagnostic commands include `page-snapshot`, `click`, `fill`, `eval`, `wait-eval`, `console`, `network`, `screenshot`, and `coverage`.

These capabilities work with regular pages and do not depend on Runtime Core.

[CLI Reference](./docs/cli-reference.md)

### Extensions

An Extension expands OpenRuntime CLI with reusable account and environment setup, stack detection, focused diagnostics, and verification capabilities for agents. It may provide CLI commands, hooks for page opening and detection, and Skills that agents can read.

[Using Extensions](./docs/extensions.md) · [CLI Extension Development](./docs/cli-extensions.md) · [Extension API Reference](./docs/extension-api.md)

### Official Extensions

Focused capabilities are published as optional Extension packages and installed only when needed:

| Package | Command | Purpose | Guide |
| --- | --- | --- | --- |
| `@openruntime/extension-memory` | `openruntime memory` | Repeat a real page journey and check memory, DOM-node, and listener growth. | [Memory Analysis](./docs/memory-analysis.md) |
| `@openruntime/extension-code-usage` | `openruntime code-usage` | Map recorded code execution back to chunks, source files, and dependencies. | [Code-Usage Analysis](./docs/code-usage-analysis.md) |
| `@openruntime/extension-imitate` | `openruntime record` | Record a browser walkthrough and generate a reusable script draft. | [Record Browser Workflows](./docs/record-browser-workflows.md) |
| `@openruntime/extension-troubleshooting` | `openruntime verify` | Verify that a page-declared business target reaches the expected result. | [Runtime Core API](./docs/runtime-core-api.md) |

Install an Extension with:

```bash
openruntime extensions add @openruntime/extension-memory
```

Installed Extension commands appear in `openruntime --help` and run through the same CLI, browser sessions, and login state as the built-in commands.

### Runtime Core

Runtime Core is an optional page-side API for registering Targets, updating Snapshots, recording Events, declaring Actions, and running `waitFor`. Integrate it only when application-internal facts or stable business signals are needed. It is not a prerequisite for OpenRuntime CLI, Auth Profiles, or Extensions.

[Runtime Core API](./docs/runtime-core-api.md)

When a script must manage the complete browser flow, see [Automating with OpenRuntime CLI](./docs/cli-automation-scripts.md).

## Focused Debugging Scenarios

- [Memory analysis](./docs/memory-analysis.md): determine whether memory, DOM nodes, and listeners keep growing across a real page journey.
- [Chunk and code-usage analysis](./docs/code-usage-analysis.md): map browser code execution back to chunks, source files, and packages.
- [Record browser workflows](./docs/record-browser-workflows.md): turn a manual demonstration into a script draft that can be inspected and verified.
- [Browser connections and multiple Runtimes](./docs/runtime-connections.md): preserve sessions and select the right Runtime in micro-frontend pages.

## Release Process

Ordinary feature and fix pull requests do not publish OpenRuntime. A maintainer starts the release workflow manually, reviews the generated release pull request, and merges it after CI passes. That merge publishes all public packages at one version and creates the matching GitHub Release.

See [OpenRuntime Release Process](./docs/release.md) for preparation, publishing, retries, local checks, and the temporary OpenRuntime `agent-browser` dependency.

## Components

```text
                  Coding Agent
                       │
              edits code and plans work
                       │
                       ▼
                OpenRuntime CLI
      ┌──────────────────────────────────┐
      │ Login state and persistent       │
      │ browser sessions                 │
      │ Page, Console, and Network       │
      │ Performance, memory, code        │
      │ execution, Extensions, evidence  │
      └──────────────────────────────────┘
                       │
                Real browser and page
                       │
              Optional Runtime Core API
      ┌──────────────────────────────────┐
      │ Target / Snapshot / Event        │
      │ Action / waitFor                 │
      └──────────────────────────────────┘
```

## Documentation

- [Coding Agent Development Debugging Loop](./docs/agent-devloop.md)
- [CLI Reference](./docs/cli-reference.md)
- [Browser Auth Profiles](./docs/auth-profiles.md)
- [Using Extensions](./docs/extensions.md)
- [CLI Extension Development](./docs/cli-extensions.md)
- [Extension API Reference](./docs/extension-api.md)
- [Runtime Core API](./docs/runtime-core-api.md)
- [Standalone Automation](./docs/cli-automation-scripts.md)
- [Release Process](./docs/release.md)

Extensions execute local code. Install and load only trusted content. Login-state files contain sensitive data and should remain in trusted environments.
