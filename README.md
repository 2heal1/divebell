<p align="center">
  <img src="./assets/divebell.png" width="160" alt="Divebell" />
</p>

<h1 align="center">Divebell</h1>

<p align="center">
<b>Go below the surface.</b>
<br/>
An extensible toolkit for coding agents to debug, understand, and verify real web applications.
</p>

---

English | [中文](./README.zh-CN.md)

Agent entry point: [Divebell Skill](./skills/divebell/SKILL.md)

# Divebell

Divebell is an **extensible toolkit for coding agents to debug, understand, and verify real web applications**.

Divebell makes the web page the coding agent's point of entry. It connects page context, browser capabilities, and the team's existing development and debugging tools so the agent can reproduce, diagnose, and verify issues directly in real web scenarios.

Starting from the current page, an agent can call existing SDKs, OpenAPIs, CLIs, and diagnostic capabilities without requiring a person to extract page information and connect the tools first.

The coding agent reads and modifies code. Divebell prepares reusable browser context and exposes page operations, browser diagnostics, and result verification as directly callable capabilities. Teams can use Extensions to connect their own accounts, environments, internal platforms, focused diagnostics, and verification workflows.

---

## Quick Start

Install the Divebell CLI globally once:

```bash
npm install --global @divebell/cli
divebell check --fix
divebell --help
```

Install the [Divebell Skill](./skills/divebell/SKILL.md) in your coding agent.

Then ask:

```text
Use Divebell to complete the official Quick Start. Open the Module Federation
Playground at https://module-federation.io/playground/index.html, replace the
manifest with
https://unpkg.com/@divebell/mf-playground-remote@0.1.0/dist/mf/mf-manifest.json,
and run the preview. If the Playground reports an error, analyze the visible
Terminal, Console, and Network evidence, update the Playground inputs as
needed, and verify that the remote renders the interactive diagnostics game.
```

That's the full Quick Start: install the CLI and skill, then send the prompt
above to your agent. The Divebell CLI stays global and does not need to be
added to the project.

## Why Divebell

Coding agents can already read and modify code, and they can call many development tools. But real web development issues usually happen in the page itself: users see a page, while diagnosing the problem requires its state, runtime environment, business context, and the team's existing diagnostic capabilities.

That information and those capabilities are usually scattered across:

- User actions and runtime state on the page
- Browser diagnostics such as Console and Network
- Existing SDKs, OpenAPIs, CLIs, and internal platforms

An agent often still needs a person to explain what the current page represents and which capability to call next.

Divebell makes the web page the agent's point of entry, connecting page context, browser diagnostics, and the team's existing tools so the agent can reproduce, diagnose, and verify issues directly in the real scenario.

Teams can use Extensions to bring existing capabilities into the current page scenario without rebuilding a separate tool system for agents. Once a workflow works, other agents and CI can keep using it as a durable team asset.

## Core Capabilities

| Module | Responsibility | Entry point | Page integration required |
| --- | --- | --- | --- |
| Web Context & Diagnostics | Make a real web page the agent's point of entry and provide page context, browser diagnostics, and same-scenario verification | Divebell CLI | No |
| Extensions | Connect the web page with the team's existing development and debugging capabilities | CLI commands, Extension API | No |
| Runtime SDK | Expose application-internal facts that browser information cannot represent reliably | `@divebell/core`, framework plugins | Yes |

### Web Context & Diagnostics

Divebell makes a real web page the agent's point of entry, providing page context, page operations, browser diagnostics, and same-scenario verification after a code change.

These capabilities include the current page and user journey, page operations such as `click`, `fill`, and `eval`, and diagnostic evidence from Console, Network, Screenshot, and Coverage. Agents can call them directly through the Divebell CLI without Runtime SDK.

[CLI Reference](./docs/cli-reference.md)

For protected pages, Divebell can reuse an existing Chrome profile, browser state, or encrypted credentials explicitly supplied by the user, and work within the account's existing permissions.

[Browser Authentication and State](./docs/browser-auth.md)

When a script must manage the complete browser flow, see [Automating with Divebell CLI](./docs/cli-automation-scripts.md).

### Extensions

Extensions are the mechanism for connecting a web page with the team's existing development capabilities.

An Extension can identify applications, environments, and resources from the current page, call existing SDKs, OpenAPIs, CLIs, or internal platforms, and expose diagnostic and verification workflows that previously required a person to connect them.

[Using Extensions](./docs/extensions.md) · [CLI Extension Development](./docs/cli-extensions.md) · [Extension API Reference](./docs/extension-api.md)

#### Official Extensions

Focused capabilities are published as optional packages and installed only when needed. CLI Extensions add commands outside the page; framework integrations run inside the application and expose facts that the framework already knows:

| Package | Entry | Purpose | Guide |
| --- | --- | --- | --- |
| `@divebell/extension-memory` | `divebell memory` | Repeat a real page journey and check memory, DOM-node, and listener growth. | [Memory Analysis](./docs/memory-analysis.md) |
| `@divebell/extension-code-usage` | `divebell code-usage` | Map recorded code execution back to chunks, source files, and dependencies. | [Code-Usage Analysis](./docs/code-usage-analysis.md) |
| `@divebell/extension-imitate` | `divebell record` | Record a browser walkthrough and generate an executable, verified JavaScript replay. | [Record Browser Workflows](./docs/record-browser-workflows.md) |
| `@divebell/extension-troubleshooting` | `divebell verify` | Verify that a page-declared business target reaches the expected result. | [Runtime SDK API](./docs/runtime-sdk-api.md) |
| `@divebell/modern-plugin` | Modern.js runtime plugin (WIP) | Planned framework-state integration. Do not adopt it yet; it is waiting for a Modern.js release with the required lifecycle hooks. | [Modern.js Integration](./docs/modernjs-integration.md) |
| `@module-federation/observability-plugin` | Module Federation runtime plugin | Record consumer, remote, manifest, remoteEntry, expose, shared-dependency, and runtime-error evidence through MF observability. | [Module Federation Observability](./docs/module-federation-observability.md) |

Install a CLI Extension with:

```bash
divebell extensions add @divebell/extension-memory
```

Installed Extension commands appear in `divebell --help` and run through the same CLI, browser sessions, and login state as the built-in commands. Framework integration packages are application dependencies and must be wired into the matching framework; they do not add a CLI command by themselves.

### Runtime SDK

Runtime SDK is an optional page-side API. When the DOM, Console, Network, and other browser information cannot represent application state reliably, Runtime SDK can expose more granular application-internal facts to the agent.

It supports registering Targets, updating Snapshots, recording Events, declaring Actions, and running `waitFor`. Divebell works without Runtime SDK, and regular pages do not need to integrate it.

[Runtime SDK API](./docs/runtime-sdk-api.md)

## Examples

Explore the official Extension examples for recording browser workflows,
checking memory growth, analyzing code usage, and connecting team tools to the
current page.

### [Record a real browser walkthrough and generate a reusable script](./docs/record-browser-workflows.md)

Demonstrate a workflow in a visible browser and let the Agent generate, run, and verify a JavaScript replay from the operated elements and event sequence. Spoken intent is optional.

> [Download and install the recording Extension](./docs/record-browser-workflows.md#install), then have the Agent run `divebell record --skill` and follow the returned skill to start recording.

**Demo video**

https://github.com/user-attachments/assets/45669f30-0c10-4a04-9926-5b796c4be946

### [Check memory growth across a real page journey](./docs/memory-analysis.md)

Repeat the same user journey and determine whether JavaScript memory, DOM nodes, or event listeners keep growing.

### [Analyze code delivered to and executed by the page](./docs/code-usage-analysis.md)

Compare the first screen with later interactions and inspect chunk, source-file, and dependency loading and execution.

### [Connect existing team tools to the current page](./demos/cli-extension/README.md)

Create a local Extension that reads the current page and participates in page opening, stack detection, and closing.

## Contribution

Please read the [contributing guide](./CONTRIBUTING.md) and let's build Divebell together.

## Credits

Divebell uses [agent-browser](https://github.com/vercel-labs/agent-browser) as its default browser execution layer. Thanks to the agent-browser authors and contributors.

Extensions execute local code. Install and load only trusted content. Login-state files contain sensitive data and should remain in trusted environments.

## License

Divebell is [MIT licensed](./LICENSE).
