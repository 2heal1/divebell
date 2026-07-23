# Runtime Core API

Chinese version: [Runtime Core API](runtime-core-api.zh-CN.md)

`@openruntime/core` is OpenRuntime's page-side API. It lets an application expose internal state, key events, declared actions, and wait conditions that cannot be obtained reliably from the browser surface.

Runtime Core is an optional enhancement. It is not required for the OpenRuntime CLI, login-state reuse, browser diagnostics, or Extensions.

## When to Use It

Runtime Core is useful when:

- page appearance cannot reliably prove that a business flow completed;
- an agent needs to know which data, module, remote, or child application is blocking progress;
- agents, automation scripts, or CI will verify the same result over time;
- a page needs to declare which actions an agent may execute, with explicit inputs and risk; or
- the team needs to await a real business state instead of using fixed delays or repeated DOM queries.

It is usually unnecessary when:

- a one-off page problem can already be diagnosed and verified reliably through Console, Network, or an explicit page result;
- the task only needs memory, code usage, screenshots, or browser-side performance diagnostics;
- an Extension can handle the requirement entirely outside the page; or
- the integration would exist only to demonstrate that the project uses OpenRuntime.

## Five Capabilities

- **Target** declares which page objects or business results may be referenced, observed, and awaited.
- **Snapshot** records a Target's current factual state and necessary data.
- **Event** records how state or actions changed over time.
- **Action** declares an operation the page allows an agent to execute, including input, availability, and risk.
- **waitFor** waits for a Target to reach a requested state.

These capabilities expose application-internal facts. Do not infer them from DOM, Console, or Network and present them as application-declared state.

## Minimal Integration

Install the page-side package:

```sh
pnpm add @openruntime/core
```

Create and install a Runtime:

```ts
import {
  createOpenRuntime,
  installOpenRuntimeOnWindow,
} from "@openruntime/core";

const runtime = installOpenRuntimeOnWindow(createOpenRuntime());
```

Reuse an existing framework or host Runtime when one is already available. Do not create competing instances in multiple entry points.

## Expose Stable State

Register a Target before updating its Snapshot:

```ts
runtime.registerTarget({
  id: "business:orders:list",
  type: "business.list",
  source: "orders",
  statuses: ["loading", "ready", "error"],
});

runtime.updateSnapshot({
  id: "business:orders:list",
  status: "ready",
  data: {
    count: orders.length,
  },
});
```

A Target ID should be stable, unique, and readable. The integration declares `type` and `statuses`; Core does not define fixed business types or states.

A Snapshot should contain only the data needed to prove the current fact. Put current blocking relationships in `dependsOn`. An Event records a change but does not replace current-state queries.

## Declare Allowed Actions

An Action exposes only a stable operation the page explicitly allows an agent to run:

```ts
runtime.registerAction({
  name: "orders.refresh",
  description: "Refresh the current orders list.",
  source: "orders",
  risk: "safe",
  handler: async () => {
    await refreshOrders();
    return { accepted: true };
  },
});
```

An Action should declare risk, availability, input constraints, and dynamic choices where relevant. `runAction` executes the operation and records an action event; it does not update a Snapshot automatically. The application updates the Snapshot, and the agent verifies the outcome with `waitFor`.

## Read It from an Agent

After OpenRuntime CLI opens the page, it can read the connected Runtime:

```sh
openruntime targets --session orders-debug
openruntime snapshot --session orders-debug --id business:orders:list
openruntime events --session orders-debug --target-id business:orders:list
openruntime actions --session orders-debug
openruntime run-action orders.refresh --session orders-debug
openruntime wait-for business:orders:list ready --session orders-debug
```

Without Runtime Core, these commands do not provide application-internal information, but browser diagnostics and Extensions continue to work.

## Runtime Core vs. Extensions

| Need | Mechanism |
| --- | --- |
| Test accounts, login state, and environment preparation | Extension or agent-browser profile/state/auth |
| Console, Network, screenshots, memory, and code execution | CLI or Extension |
| Team-specific diagnostic and verification commands | Extension |
| Internal business state and blocking relationships | Runtime Core |
| Stable business actions an agent may execute | Runtime Core |

An Extension organizes development debugging outside the page. Runtime Core exposes facts inside the page. They can be combined, but neither requires the other.

## Framework Integration

Facts already known by a framework or runtime should come from the corresponding plugin rather than duplicated business probes:

- Modern.js uses `@openruntime/modern-plugin` for route, loader, SSR, hydration, and Garfish state.
- Module Federation integration should reuse MF observability for remote, shared, expose, and runtime-error information.
- Regular applications and stable business outcomes may use `@openruntime/core` directly.

If a framework lacks a required lifecycle, add a formal hook instead of simulating framework state through DOM, Console, or Network inspection.

See the [Core Reference](../skills/openruntime/references/core.md) for complete fields, behavior, and examples.
