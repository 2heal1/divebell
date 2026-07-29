# Divebell Quick Start

Chinese version: [Divebell 快速体验](quick-start.zh-CN.md)

Try Divebell with the public Module Federation Playground:

[Open the Module Federation Playground](https://module-federation.io/playground/index.html)

This quick start uses a published remote package. You do not need to clone a
repository, install a browser extension, or read the remote source code. The
flow intentionally starts with the wrong props so the Agent can observe the
Playground Terminal error, correct the input, and verify the running page.

## Install Divebell

Install the CLI globally once, then confirm that it is available:

```bash
npm install --global @divebell/cli
divebell check --fix
divebell --help
```

Divebell is a machine-level debugging tool. Do not add the CLI to the
application's dependencies.

## Start with the Agent skill

Install the complete `skills/divebell` directory in an Agent that supports
skills. For Codex, place it at:

```text
~/.codex/skills/divebell
```

Then ask:

```text
Use Divebell to complete the official Quick Start. Open the Module Federation
Playground, load the Divebell remote with the intentionally wrong props,
read the Playground Terminal error, update the props to the required config,
and verify that the remote renders the interactive diagnostics game.
```

The skill uses the globally installed `divebell` command and never adds the
CLI to the current project.

## Playground inputs

Use this manifest URL:

```text
https://unpkg.com/@divebell/mf-playground-remote@0.1.0/dist/mf/mf-manifest.json
```

The remote name is:

```text
divebell_mf_playground_remote
```

The expose is:

```text
.
```

Start with intentionally wrong props:

```tsx
{
  title: 'Divebell',
}
```

Then fix the props to:

```tsx
{
  config: {
    appName: 'MF Playground',
    environment: 'staging',
    sessionId: 'mf-quickstart',
  },
}
```

## What the walkthrough demonstrates

1. **Load a real remote:** use the public Module Federation Playground and a
   versioned remote manifest from npm/unpkg.
2. **Observe the failure:** read the runtime prop validation error from the
   Playground Terminal instead of inspecting the remote source.
3. **Apply the fix:** update the props from the old `title` shape to the
   required `config` shape.
4. **Verify the page:** confirm that the Divebell remote renders and the
   interactive diagnostics game responds to pointer, arrow-key, or WASD
   movement.

## What this is and is not

The Quick Start is a remote debugging walkthrough inside the public Module
Federation Playground. It is meant to show how an Agent can use page-visible
evidence and runtime errors to make a concrete fix without downloading the
remote source code.

It does not require the Module Federation browser extension or a Divebell
Extension. A later Playground-side Runtime SDK integration can make the
Terminal error and editable inputs directly available as Divebell targets and
actions, but this quick start already works through the ordinary page and
browser evidence.
