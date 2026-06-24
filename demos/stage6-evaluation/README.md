# Stage 6 Evaluation Demo

This demo makes the Stage 6 roadmap checks repeatable.

It has two parts:

1. Modern.js coverage points to the existing runnable demos:
   - `demos/modern-basic`: route, loader, business ready, declared action.
   - `demos/modern-ssr`: SSR and hydration.
   - `demos/modern-ssr-stream`: streaming SSR, hydration, route loader.
2. Module Federation coverage rebuilds the old `agent-runtime-mf` cases as OpenRuntime evaluation scenarios. The local Modern.js checkout only has built artifacts for those cases, so this demo keeps the case names and manifest shapes, but does not duplicate MF loading instrumentation inside OpenRuntime.

Run it with:

```sh
pnpm run evaluate:stage6
```

`pnpm check` also runs this evaluation.

The evaluator fails if:

- the Modern.js demo set no longer covers route, loader, SSR, hydration, and business ready;
- the MF scenario set no longer covers remote success, remote error, shared conflict, manifest failure, and remoteEntry failure;
- a runtime round cannot name the target that is ready or blocked;
- runtime evidence does not improve over the baseline round.

CI does not need an API key for this evaluation. It runs deterministic local
checks and writes the measured evaluator runtime to the GitHub Actions summary.
A true end-to-end AI agent benchmark would need model credentials, so it should
stay manual or quota-gated instead of running on every PR.
