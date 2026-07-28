# Modern.js SSR Demo

This demo verifies the Divebell state exposed by Modern.js during SSR and hydration.

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

Start the SSR demo in a second terminal:

```bash
pnpm --filter @divebell/demo-modern-ssr dev
```

Then open:

```txt
http://localhost:19082/
```

## Verify

Run the verification in a third terminal:

```bash
pnpm --filter @divebell/demo-modern-ssr verify
```

You can also inspect the state manually:

```bash
divebell targets --url http://localhost:19082/
divebell snapshot --url http://localhost:19082/
```

Expected results:

- `targets` shows `modern:app`, `modern:route`, `modern:ssr`, and `modern:hydration`.
- In `snapshot`, `modern:ssr` is `server-rendered` and its source is the server.
- In `snapshot`, `modern:hydration` is `success`.
- In `snapshot`, `modern:route` is `ready` and its current pathname is `/`.
- The `runtimeId` shown by `runtimes` matches the server `runtimeId` recorded by `modern:ssr`.

You can also wait for the server SSR state directly:

```bash
divebell wait-for modern:ssr server-rendered --url http://localhost:19082/ --where environment=server --timeout 5000
```

## Build Check

```bash
pnpm --filter @divebell/demo-modern-ssr build
```
