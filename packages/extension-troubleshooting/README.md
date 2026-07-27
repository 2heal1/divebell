# @openruntime/extension-troubleshooting

This OpenRuntime Extension adds `openruntime verify`, a focused command for checking that a page-declared business target reaches the expected status and optional data conditions.

The package requires a page connected to Runtime Core. Framework targets such as Modern.js, Module Federation, or Garfish provide supporting evidence, but they do not by themselves prove that the business result is correct.

## Install

```bash
openruntime extensions add @openruntime/extension-troubleshooting
```

## Verify a business result

Open or select the real page, then verify a business target:

```bash
openruntime verify business:orders ready --timeout 5000
```

Select a specific page, session, Bridge, or Runtime when needed:

```bash
openruntime verify \
  --session orders-debug \
  business:orders ready \
  --timeout 5000
```

Add one or more data conditions with `--where <path=value>`:

```bash
openruntime verify \
  business:orders ready \
  --where data.count=3 \
  --where data.region=eu
```

The command succeeds only when the requested business target reaches the expected result. If only framework-level evidence exists, the output explains why final business verification is still missing and suggests a suitable business target when one is available.

See [Runtime Core API](../../docs/runtime-core-api.md), [Runtime Core API 中文版](../../docs/runtime-core-api.zh-CN.md), and [Browser Connections and Multiple Runtimes](../../docs/runtime-connections.md).
