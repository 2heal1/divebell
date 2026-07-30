# Runtime SDK Integration

This reference describes how to integrate `@divebell/core` without unnecessary
or misleading instrumentation.

## When to use Runtime SDK

Use Runtime SDK when the application must expose internal facts that browser
evidence cannot represent reliably, such as:

- Stable business completion state.
- The application resource or dependency blocking progress.
- Reusable business verification signals for Agents or CI.
- Explicit page-declared Actions with inputs, availability, and risk.
- A real state transition that should be awaited instead of using fixed delays.

Do not add Runtime SDK when:

- The page result, Console, or Network already proves the conclusion.
- The task only needs screenshots, memory, coverage, or browser diagnostics.
- An Extension can complete the requirement outside the page.
- The integration would expose no durable or reusable fact.

## Inspect existing integration first

Before installing or initializing anything:

- Search for `@divebell/core`.
- Search for `createDivebell`, `installDivebellOnWindow`, and
  `getDivebellFromWindow`.
- Check framework or runtime plugins already used by the application.
- Reuse existing Target IDs and conventions where they already express the
  required fact.
- Identify the correct application lifecycle location for initialization and
  updates.

Facts already owned by a framework or runtime should come from its integration
instead of being duplicated as business probes.

## Install and initialize

Add `@divebell/core` as an application dependency using the project's package
manager.

For an ordinary browser application, reuse an installed Runtime or create one:

```ts
import {
  createDivebell,
  getDivebellFromWindow,
  installDivebellOnWindow,
} from "@divebell/core";

export function ensureDivebellRuntime() {
  return (
    getDivebellFromWindow() ??
    installDivebellOnWindow(createDivebell())
  );
}
```

Initialize it from one stable application entry point.

Do not call `createDivebell()` independently from several components or
features. A host and independently mounted sub-application may use separate
Runtimes only when that architecture is deliberate; assign stable Runtime IDs
and clean up the sub-application Runtime during unmount.

## Model a Target

A Target declares a stable object or result that an Agent may reference or
await.

```ts
runtime.registerTarget({
  id: "business:orders:list",
  type: "business.list",
  source: "orders",
  statuses: ["loading", "ready", "error"],
});
```

Guidelines:

- Model one stable capability or result per Target.
- Use stable, unique, readable IDs.
- A useful business convention is `business:<area>:<capability>`.
- Declare the complete set of statuses the Target may use.
- Do not create synonymous Targets for the same fact.
- Do not create a Target merely so a verification command has something to
  query.

Register a Target before updating its Snapshot.

Unregister dynamic Targets when their owning page or sub-application is
permanently removed.

## Update the Snapshot

A Snapshot is the Target's current fact.

```ts
runtime.updateSnapshot({
  id: "business:orders:list",
  status: "ready",
  data: {
    count: orders.length,
  },
});
```

Update it from the real application lifecycle that owns the fact.

Rules:

- Use a status declared by the Target.
- Include only the data required to prove the current conclusion.
- Do not include a full DOM, full API response, store dump, or unrelated
  business object.
- Put structured failures in `error`.
- Use `dependsOn` only for Targets that currently block or determine this state.

Example error state:

```ts
runtime.updateSnapshot({
  id: "business:orders:list",
  status: "error",
  error: {
    message: error instanceof Error ? error.message : String(error),
  },
});
```

## Events

Runtime Events explain how Snapshots and Actions changed over time.

Use Events when history is needed to diagnose a failed wait, missing update, or
Action sequence. Use the Snapshot for current state.

Do not treat event history as the primary representation of a fact, and do not
read every event when a Target-specific query is available.

## Declare an Action

An Action is an operation that the page explicitly permits an Agent to execute.

```ts
runtime.registerAction({
  name: "orders.refresh",
  description: "Refresh the current orders list.",
  source: "orders",
  risk: "safe",
  async handler() {
    await refreshOrders();
    return { accepted: true };
  },
});
```

Guidelines:

- Keep Actions small, deterministic, and repeatable.
- Declare an appropriate risk.
- Define input constraints when payload is accepted.
- Use availability conditions when the Action is temporarily disabled.
- Do not expose arbitrary code execution or unrestricted internal methods.
- Unregister Actions when their owning dynamic application is removed.

`runAction` records whether the handler completed. It does not update a
Snapshot automatically and does not prove the expected business result.

The application must update the relevant Target, and the Agent verifies that
state separately.

## Wait for state

Use `waitFor` when code or tests need to await a Target state:

```ts
const result = await runtime.waitFor(
  {
    id: "business:orders:list",
    status: "ready",
  },
  {
    timeout: 10_000,
  },
);
```

For Agent-side verification, the Divebell CLI normally reads the Runtime and
waits for the same Target.

A successful Action followed by a failed wait is not success. Inspect the
current Snapshot and relevant Events.

## Preserve application behavior

Runtime wiring exposes facts; it should not become a parallel business system.

Do not:

- Add alternate API calls solely for Runtime state.
- Change routes or rendering branches for Agent access.
- Mutate business state from Snapshot updates.
- Add duplicate state machines that can drift from the application.
- Expose credentials, tokens, personal data, or large internal payloads.

Prefer observing the application's existing source of truth and translating
only the minimum stable fact into Runtime state.

## Verify through Divebell

Use the installed CLI help as the source of truth:

```bash
divebell --help
divebell runtimes --help
divebell targets --help
divebell snapshot --help
divebell actions --help
divebell run-action --help
divebell wait-for --help
```

Open the real application through Divebell, then confirm:

1. The expected Runtime is connected.
2. The Target definition is present.
3. The initial Snapshot reflects the real application state.
4. Real application transitions update the same Target.
5. Error paths produce structured errors.
6. Actions show correct risk and availability.
7. Running an Action updates or leads to the expected Target state.
8. `wait-for` succeeds only when the real business condition is satisfied.
9. The same account, environment, and user path are used for verification.

Do not claim Runtime verification when no Runtime is connected.
