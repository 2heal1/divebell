# Run the Official Divebell Quick Start

Use this workflow when the user wants a first experience and has not provided
another page. The public Module Federation Playground can load a published
Divebell remote without cloning a repository, installing a browser extension,
or reading the remote source code.

Playground:

```text
https://module-federation.io/playground/index.html
```

Remote manifest:

```text
https://unpkg.com/@divebell/mf-playground-remote@0.1.0/dist/mf/mf-manifest.json
```

Remote name:

```text
divebell_mf_playground_remote
```

Expose:

```text
.
```

## 1. Resolve the CLI

Use the globally installed CLI:

```bash
divebell --help
```

If the command is unavailable, stop and ask the user to install it globally:

```bash
npm install --global @divebell/cli
divebell setup
```

Do not install `@divebell/cli` in the user's application.

Read scoped help before using commands whose arguments are not confirmed.

## 2. Open the Playground

Open the public Playground visibly unless the user requested a headless run:

```bash
divebell open https://module-federation.io/playground/index.html --ui
divebell page-snapshot
```

Use the visible controls in the Playground page. Do not inspect or download the
remote package source; the point of the walkthrough is to rely on the page,
Terminal, Console, Network, and the published manifest.

## 3. Load the remote manifest

Replace the Playground manifest with:

```text
https://unpkg.com/@divebell/mf-playground-remote@0.1.0/dist/mf/mf-manifest.json
```

Use the exposed module:

```text
divebell_mf_playground_remote
.
```

Run the Playground preview. Do not intentionally create a failing input. If the
remote renders successfully, continue to final verification.

If the Playground reports an error, read the visible Terminal output first,
then use browser Console and Network as supporting evidence. Determine which
Playground input needs to change and update it.

When the Terminal says that the remote expected a `config` object, use this
compatible props shape:

```tsx
{
  config: {
    appName: 'MF Playground',
    environment: 'staging',
    sessionId: 'mf-quickstart',
  },
}
```

If the Playground UI has changed, use `divebell page-snapshot`, screenshots,
Console, and Network evidence to find the equivalent manifest, exposed module,
props, and run controls.

## 4. Verify the page

Run the preview after any required input update and verify all of the following:

- The Terminal does not report a blocking remote-loading or props error.
- The remote renders a Divebell diagnostics game.
- Moving the pointer, arrow keys, or WASD steers the Divebell logo.
- Colliding with Bug, Performance, or Network icons produces the golden sonar
  pulse and updates the located count.

Use page-visible evidence first. Console and Network are fallback evidence for
ordinary page or remote-loading errors. Do not require a Module Federation
browser extension.

## 5. Finish

Summarize:

- the manifest that was loaded;
- any Terminal, Console, or Network error that appeared;
- the Playground input that was changed to resolve it, if a change was needed;
- the final visible verification that the remote rendered and interacted.

Do not imply that this quick start modifies application source. Source editing
belongs to a later workflow in the user's own repository or in the Module
Federation Playground if the user explicitly asks to integrate Divebell there.
