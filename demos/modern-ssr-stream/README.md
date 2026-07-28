# Modern.js Stream SSR Demo

This demo verifies that Divebell can connect server rendering and the browser Runtime in the same record when a Modern.js app uses the recommended streaming SSR mode.

> **WIP:** This is a contributor demo, not proof that the plugin works with a
> published Modern.js version. It requires a local Modern.js source checkout
> containing the unreleased lifecycle hooks used by Divebell.

## Prerequisites

This demo depends on the local Modern.js repository at `/Users/bytedance/fork_repo/modern.js`. Make sure it includes the hooks required by Divebell and has its dependencies installed.

Install dependencies and build from the Divebell repository root:

```bash
pnpm install
pnpm build
```

## Start

Start the Bridge in the first terminal:

```bash
divebell start
```

Start the streaming SSR demo in a second terminal:

```bash
pnpm --filter @divebell/demo-modern-ssr-stream dev
```

Then open:

```txt
http://localhost:19083/
```

## Verify

Run the verification in a third terminal:

```bash
pnpm --filter @divebell/demo-modern-ssr-stream verify
```

You can also inspect the state manually:

```bash
divebell targets --url http://localhost:19083/
divebell snapshot --url http://localhost:19083/
```

Expected results:

- `targets` shows `modern:app`, `modern:route`, `modern:ssr`, and `modern:hydration`.
- In `snapshot`, `modern:ssr` is `server-rendered` and its source is the server.
- In `snapshot`, `modern:hydration` is `success` and its `renderMode` is `stream`.
- In `snapshot`, `modern:route` is `ready` and its current pathname is `/`.
- The `runtimeId` shown by `runtimes` matches the server `runtimeId` recorded by `modern:ssr`.

You can also wait for the server SSR state directly:

```bash
divebell wait-for modern:ssr server-rendered --url http://localhost:19083/ --where environment=server --timeout 5000
```

## Build Check

```bash
pnpm --filter @divebell/demo-modern-ssr-stream build
```
