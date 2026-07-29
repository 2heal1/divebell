# @divebell/mf-playground-remote

Interactive Divebell remote used by the Module Federation Playground quick
start. Bug, performance, and network issues appear throughout the scene; steer
Divebell into them with the pointer, arrow keys, or WASD to clear them with a
golden sonar pulse. Pressing Space sends a manual sonar ping.

## Manifest

Use the immutable package URL in the Playground:

```text
https://unpkg.com/@divebell/mf-playground-remote@0.1.0/dist/mf/mf-manifest.json
```

## Required props

```tsx
<RemoteComponent
  config={{
    appName: 'MF Playground',
    environment: 'staging',
    sessionId: 'mf-quickstart',
  }}
/>
```

`environment` accepts `local`, `staging`, or `production`.

The remote intentionally validates its props at runtime. The quick start first
loads it with the old `title` prop, reports the required `config` shape in the
Playground Terminal, and succeeds after the consumer passes the props above.

Once loaded, the game continuously introduces `Bug`, `Performance`, and
`Network` issues. Moving Divebell into an issue clears it and updates the score.

## Commands

Run these commands from the repository root:

```sh
pnpm --filter @divebell/mf-playground-remote build
pnpm --filter @divebell/mf-playground-remote dev
pnpm --filter @divebell/mf-playground-remote verify:build
```

## Publish manually

This demo is intentionally not part of Divebell's synchronized package
release. Publish it directly from a local checkout:

```sh
pnpm --filter @divebell/mf-playground-remote test
pnpm --dir demos/mf-playground-remote publish --access public --no-git-checks
```

Update the version in `package.json` before each later publish. After publishing,
use the matching immutable version in the Playground manifest URL.
