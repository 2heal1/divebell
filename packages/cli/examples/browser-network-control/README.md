# Divebell browser network control with Bifrost

These demos use real Divebell-launched Chromium processes and Bifrost temporary
proxy ports. They do not enable the operating-system proxy, change Bifrost's
default enabled rules, or require TLS interception.

## Prerequisites

Build and run from the repository worktree containing the browser-network
control changes. Check Bifrost first:

```sh
bifrost status --format json
```

If it is not already running, start it without changing the system proxy:

```sh
bifrost start -p 9900 --daemon --no-system-proxy --no-intercept
```

The demos use `bifrost port bind --port 0 --rule-text ...` to allocate temporary
ports. Each port sees only its explicitly bound rules, and the runner destroys
the ports and Divebell daemons in `finally` cleanup.

## 1. Two daemons, two Bifrost rule sets

Both Chromium daemons open `http://divebell-demo.test/`. The first daemon uses a
Bifrost port whose rule returns `from-bifrost-a`; the second uses another port
whose rule returns `from-bifrost-b`:

```sh
pnpm --filter @divebell/cli run demo:network-control:bifrost-multi-daemon
```

The demo verifies that the two browser-daemon CDP URLs differ and that each page
receives only its own rule result. Fixed `--proxy` does not start Divebell's CDP
request-control process; that process is needed only for PAC hosting or
`--network-rules`.

## 2. Conditional PAC backed by two Bifrost ports

This demo loads a temporary trusted Divebell Extension provider. Divebell hosts
the generated PAC file, routes `pac-a.divebell.test` to Bifrost port A, routes
`pac-b.divebell.test` to Bifrost port B, and sends the local page itself through
the `DIRECT` fallback:

```sh
pnpm --filter @divebell/cli run demo:network-control:bifrost-pac
```

## Inspect the browser and temporary ports

Set these environment variables to launch visible Chromium windows and delay
cleanup for 30 seconds:

```sh
DIVEBELL_DEMO_UI=1 DIVEBELL_DEMO_PAUSE_MS=30000 \
  pnpm --filter @divebell/cli run demo:network-control:bifrost-multi-daemon
```

While it is paused, another terminal can inspect the Bifrost bindings and
traffic:

```sh
bifrost port list
bifrost traffic list --listener-port <printed-port> --limit 10
```

## Run rewrite and fulfill independently

These existing real-Chromium E2E scenarios do not need Bifrost because they
exercise Divebell's CDP request controls directly:

```sh
pnpm --filter @divebell/cli run test:network-control-multi-daemon-e2e
pnpm --filter @divebell/cli run test:network-control-pac-e2e
pnpm --filter @divebell/cli run test:network-control-fixed-proxy-e2e
pnpm --filter @divebell/cli run test:network-control-https-e2e
```

The HTTPS scenario covers HTTPS-to-HTTPS `rewrite` and HTTPS-to-HTTP localhost
`fulfill`. Divebell does not expose `redirect` in v1.

## Can Bifrost use different rules at the same time?

Yes. Keep the main Bifrost proxy running and bind different explicit rule sets
to different temporary ports:

```sh
bifrost port bind --port 18888 --rule-text "demo.test status://200 resBody://(rule-a)"
bifrost port bind --port 18889 --rule-text "demo.test status://200 resBody://(rule-b)"
bifrost port active 18888
bifrost port active 18889
```

Then point separate Divebell browser daemons at `http://127.0.0.1:18888` and
`http://127.0.0.1:18889`. Use `bifrost port update` to replace one port's rule
set without changing the other, and destroy the ports when finished:

```sh
bifrost port destroy 18888
bifrost port destroy 18889
```
