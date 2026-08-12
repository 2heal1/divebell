# Module Federation Observability

To inspect an MF page through the Divebell CLI, install [`@divebell/extension-mf`](../packages/extensions/mf/README.md), which provides the `divebell mf` command. A one-off page investigation can use `divebell open <url> --mf`; the application does not need to install the observability plugin first.

`@module-federation/observability-plugin` is the official Module Federation-side integration path used by Divebell. It records structured loading evidence from Module Federation's own runtime hooks, allowing a coding agent to identify the exact loading phase and likely owner without reconstructing MF state from DOM or Network results.

This package is a Module Federation runtime plugin for long-term collection, not a CLI Extension. Add it to the MF consumer only when the application needs to continuously record, upload, or retain MF reports. It does not add a standalone `divebell` command.

## One-off module performance analysis

The MF Extension also provides:

```bash
divebell mf module-perf [remote/expose]
```

This command requires only `divebell open <url> --mf`; consumers and producers
do not add Slardar, the observability plugin, or application callbacks for a
one-off run. Divebell installs a bounded browser collector before navigation
and combines official MF lifecycle evidence with browser paint, Resource
Timing, and Manifest assets. MF lifecycle intervals come from one
Observability trace rather than a second runtime plugin. It analyzes actual
page loads and never loads or renders a module merely to create another
sample. Module success means that
the observed `loadRemote` operation finished successfully; the command does not
claim that the consumer UI rendered or became ready.

Without a target it covers every producer/expose load observed in the page. An
MF Manifest is optional: get and factory timing remains available without one.
With a Manifest, the command maps the expose's declared JavaScript assets to
actual browser resource start/end timing, allowing evidence-based preload
recommendations. Code Usage remains a separate follow-up for exact expose
assets because enabling coverage would change the performance measurement.
For remoteEntry, the full observed request lifecycle remains visible while
bottleneck calculations use only the part that actually blocked the module;
cross-origin network phases that the browser does not expose are omitted.
Page impact is expressed as signed start and end deltas between `loadRemote`
and FP, FCP, and LCP; it does not infer a loading trigger or component render.

`module-perf --report` additionally returns a navigation-relative swimlane
timeline. It aligns the main HTML response, observed page scripts, FP/FCP/LCP,
consumer `loadRemote`, and the provider Manifest, remoteEntry, container-init,
get, factory, and result phases. An MF preload lane is included only for
official `preloadRemote` JavaScript attributed to the same MF target or for a
browser `preload`/`modulepreload` resource that matches that target's Manifest
assets. Unrelated page preloads are not included.

## What the plugin provides

The observability plugin records evidence for:

- the consumer and matched remote;
- manifest and remoteEntry resolution;
- expose resolution and module-factory execution;
- shared-dependency selection, version mismatch, and eager-boundary problems;
- preload and recovery paths;
- runtime error codes, failed phases, and loading timelines; and
- optional component-ready signals explicitly reported by application code.

The report distinguishes runtime loading from business readiness. A remote or expose reaching a loaded state proves that the Module Federation runtime completed that layer of work; it does not prove that the consuming UI rendered correctly or that its data is ready.

## Add long-term application integration

When the application needs continuous MF reporting, install the package in the MF consumer:

```bash
pnpm add @module-federation/observability-plugin
```

Register it on the same Module Federation runtime instance that loads the remotes:

```ts
import { createInstance } from "@module-federation/runtime";
import { ObservabilityPlugin } from "@module-federation/observability-plugin";

createInstance({
  name: "host",
  remotes: [],
  plugins: [
    ObservabilityPlugin({
      level: "verbose",
      browser: {
        enabled: true,
        scope: "host",
      },
    }),
  ],
});
```

Browser output is opt-in. Use a stable, unique `scope` for each runtime instance. The plugin does not upload reports by default; production upload and retention remain application-owned decisions.

## Read the evidence

When browser output is enabled, reports are available from the scoped reader:

```js
window.__FEDERATION__.__OBSERVABILITY__.host.getLatestReport();
window.__FEDERATION__.__OBSERVABILITY__.host.findReports({
  remote: "remote1",
});
```

Start with `diagnosis`, `summary.outcome`, `summary.phases`, and the `traceId`, then inspect the event timeline only when more detail is needed. A missing field means that the plugin did not observe that fact; it should not be treated as a successful or failed phase.

When the MF integration exposes Divebell targets and report actions, the same evidence can be selected and waited on through the normal Runtime workflow:

```bash
divebell targets --type mf.remote
divebell targets --type mf.remote.expose
divebell targets --type mf.shared
divebell run-action mf:list-reports \
  --payload '{"remote":"remote1"}'
```

Wait for the concrete expose or shared dependency required by the user flow instead of relying only on a remote summary.

## Boundaries

- Keep the integration in the Module Federation observability plugin. If a required signal is missing, add a formal MF runtime hook instead of adding a Divebell-side detector.
- Do not infer shared-provider selection from `window.__FEDERATION__` alone. Use an observability report, an `mf.shared` target, or clearly labeled browser fallback evidence.
- Do not treat runtime success as proof of business UI success. Verify the consuming page separately or add an explicit application-owned ready signal.
- Console, Network, screenshots, and runtime error codes remain valid fallback evidence when source changes are not allowed, but they should be identified as fallback evidence rather than MF structured state.
