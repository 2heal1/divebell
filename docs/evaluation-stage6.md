# Stage 6 Demo And Evaluation

Stage 6 is closed by a repeatable evaluator:

```sh
pnpm run evaluate:stage6
```

`pnpm check` also runs this evaluator.

The CI job does not use any API key. It reports the real wall time for the local
evaluator in the GitHub Actions summary. The baseline/runtime numbers in
`scenarios.json` are the comparison estimates for the evaluation cases, not
paid model calls.

A true end-to-end AI agent benchmark would need model credentials. Keep that as
a manual or quota-gated workflow if it is added later; do not run it on every PR.

## Modern.js Demo Set

The Modern.js side reuses the existing runnable demos instead of creating a
second copy:

| Demo | Coverage |
| --- | --- |
| `demos/modern-basic` | route, loader, business ready, declared action |
| `demos/modern-ssr` | SSR and hydration |
| `demos/modern-ssr-stream` | stream SSR, hydration, route loader |

Each demo keeps its own `verify-openruntime.mjs` script for live Bridge checks.
The Stage 6 evaluator verifies that the set still covers route, loader, SSR,
hydration, and business ready.

## Module Federation Demo Set

The MF side is rebuilt as `demos/stage6-evaluation`. The source Modern.js
checkout has built artifacts for the old `agent-runtime-mf` cases, not a clean
source demo that can be copied directly. The Stage 6 demo therefore keeps the
old case names and manifest shape as reference data, then feeds representative
MF observability outcomes into OpenRuntime Core.

Covered MF cases:

| Scenario | Coverage | Runtime target that explains the result |
| --- | --- | --- |
| `mf-remote-success` | remote success | `mf:remote:redirectLoaderProvider:expose:RemotePanel` |
| `mf-remote-runtime-error` | remote error | `mf:remote:redirectLoaderProvider:expose:RemotePanel` |
| `mf-shared-conflict` | shared conflict | `mf:shared:react:18.3.1:default` |
| `mf-manifest-failure` | manifest failure | `mf:remote:redirectLoaderProvider` |
| `mf-remote-entry-failure` | remoteEntry failure | `mf:remote:asyncChunkRuntimeProvider` |

This keeps the OpenRuntime repo from reimplementing MF loading tracing. The
real MF instrumentation still belongs in the MF observability plugin.

## Baseline And Runtime Rounds

Baseline round means the agent only has DOM, console, network, or bundle clues.
Runtime round means the agent uses OpenRuntime targets, snapshot, events, and
`waitFor`.

The evaluator checks four things for every scenario:

1. runtime round names the expected target;
2. runtime round reaches the expected status;
3. runtime round uses fewer manual interventions;
4. runtime round has more complete evidence.

The important Stage 6 proof is that failures now point at a target such as
`modern:route`, `mf:remote:*`, or `mf:shared:*`, instead of only saying that the
page is broken.
