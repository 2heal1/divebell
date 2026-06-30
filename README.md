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

openruntime wait-for \
  docs:release-notes ready \
  --url https://example.com/openruntime/release-notes

openruntime run-action \
  --url https://example.com/openruntime/release-notes \
  release-note.list-latest \
  --payload '{"limit":3}'
```

Both the Target and Action here are declared by the page.

The Agent does not need to analyze the DOM or look for buttons. It only needs to call the unified Runtime API to get the result.

Teams can further wrap these steps into their own commands:

```sh
open-runtime release-note latest --limit 3
```

This turns page capabilities into a stable Runtime that Agents can call, rather than one-off browser scripts.

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
