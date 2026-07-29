# Divebell Runtime SDK Reference

Use this reference for details that do not belong in the `SKILL.md` entry point.
Load only the sections required by the current task.

`@divebell/core` is the optional page-side API package for creating a
runtime, connecting it to Bridge, registering targets, updating snapshots, and
registering actions. Ordinary pages can use Divebell authentication,
browser debugging, and Extensions without Runtime SDK. Add Runtime SDK only when the task
requires application-internal facts or stable long-term verification signals.

Start from this reference, existing Divebell initialization or connection
code in the project, and nearby page examples. Do not inspect installed
`node_modules/@divebell/**` package files preemptively; `.d.ts` files count
as package internals. Patch from public guidance and adjacent project patterns,
then let typecheck or build validate the result. Inspect package internals only
after a real error cannot be explained by this reference, the skill, or project
examples.

## Contents

- [Concepts](#concepts)
- [Public API](#public-api)
  - [`createDivebell`](#createdivebell)
  - [`installDivebellOnWindow`](#installdivebellonwindow)
  - [`getDivebellFromWindow`](#getdivebellfromwindow)
  - [`registerTarget`](#registertarget)
  - [`unregisterTarget`](#unregistertarget)
  - [`getTargets`](#gettargets)
  - [`updateSnapshot`](#updatesnapshot)
  - [`getSnapshot`](#getsnapshot)
  - [`getEvents`](#getevents)
  - [`registerAction`](#registeraction)
  - [`unregisterAction`](#unregisteraction)
  - [`getActions`](#getactions)
  - [`runAction`](#runaction)
  - [`waitFor`](#waitfor)
  - [`matchesRuntimeCondition`](#matchesruntimecondition)
  - [`syncServerRuntimeBridge`](#syncserverruntimebridge)
  - [`RuntimeCenter`](#runtimecenter)
- [Agent-Side CLI Mapping](#agent-side-cli-mapping)
- [Minimal Page-Side Sequence](#minimal-page-side-sequence)
- [Bridge and Connections](#bridge-and-connections)
- [Modeling Guidance](#modeling-guidance)
- [Examples](#examples)

## Concepts

Divebell is an extensible web development and debugging tool for Coding
Agents. It helps an Agent reuse authenticated, real browser context to
reproduce, diagnose, and verify page issues, while Extensions adapt team
accounts, environments, and specialized debugging workflows.

Runtime SDK is the deeper integration layer. When browser-visible evidence
cannot reliably provide an internal fact, an application can expose runtime
state, events, waitable targets, and declared actions to an Agent. Runtime SDK is not a
prerequisite for every Divebell task.

The primary objects are:

- **Bridge**: the connection channel between the CLI and page runtimes.
- **Runtime**: a Divebell instance inside the page. It registers targets,
  updates snapshots, records events, and executes actions.
- **Target**: an object the page makes referenceable or waitable, such as a
  business component, route, remote, shared dependency, or sub-application.
- **Snapshot**: the target's current fact. It answers "what is its state now?"
- **Event**: state-change, error, and action history. It answers "how did the
  state get here?"
- **Action**: a safe operation declared by the page for an Agent. It answers
  "what may the Agent ask the page to do?"

Runtime SDK does not infer application-internal facts from the DOM,
screenshots, Console, or Network. Those remain normal browser-diagnosis
evidence. Information labeled as a target, snapshot, event, or action must be
provided directly by the page or a supported framework plugin.

## Public API

Import page APIs from `@divebell/core`. Ordinary integrations need only
these public APIs and should not inspect installed package internals.

### createDivebell

Create a page runtime instance.

Use it when:

- The project has no Divebell initialization.
- A test or isolated page needs to create a runtime manually.

Behavior:

- Every call creates a new instance.
- The instance is not installed on `window.__DIVEBELL__` automatically.
- Call `installDivebellOnWindow` when the CLI, plugins, or business modules
  need to share it.

```ts
import { createDivebell } from "@divebell/core";

interface CreateDivebellOptions {
  // Optional clock. Tests may provide a fixed clock; the real clock is the default.
  clock?: { now(): number };
}

function createDivebell(options?: CreateDivebellOptions): RuntimeCenter;
```

```ts
const runtime = createDivebell();
```

### installDivebellOnWindow

Install a runtime on `window.__DIVEBELL__` and return the reusable runtime.

Use it when:

- Plugins, business code, and the CLI must access the same page runtime.
- A runtime exists but is not installed on the global host.

Behavior:

- When `runtime` is omitted, create and install a default runtime.
- Install on the current `window` by default, or pass another window-like
  object as `host`.
- Reuse existing initialization. Do not install duplicate runtimes from
  multiple locations.

```ts
import { installDivebellOnWindow } from "@divebell/core";

function installDivebellOnWindow(
  // Runtime to install. Create a new runtime when omitted.
  runtime?: DivebellCore,
  // Window-like host. Defaults to the current window.
  host?: DivebellWindowHost,
  // Optional metadata for this runtime instance.
  options?: DivebellInstanceOptions,
): DivebellCore;

interface DivebellWindowHost {
  // Runtime installed on this host.
  __DIVEBELL__?: DivebellCore;
  // Registry containing every runtime installed on this host.
  __DIVEBELL_REGISTRY__?: DivebellRegistry;
}

interface DivebellInstanceOptions {
  // Stable runtime ID. Generate one automatically when omitted.
  runtimeId?: string;
  // Human-readable runtime name.
  name?: string;
  // Runtime source.
  source?: string;
  // Parent runtime ID for nested runtimes.
  parentRuntimeId?: string;
  // Optional render instance ID.
  renderId?: string;
}
```

```ts
const runtime = installDivebellOnWindow(createDivebell());
```

### getDivebellFromWindow

Read an installed runtime from `window.__DIVEBELL__`.

Use it when:

- Avoiding duplicate runtime creation.
- Reusing an existing page runtime from business modules, framework plugins, or
  debugging code.

Behavior:

- Return the existing runtime when found.
- Return `undefined` when none is installed; the caller decides whether to
  create and install one.

```ts
import { getDivebellFromWindow } from "@divebell/core";

function getDivebellFromWindow(
  // Window-like host. Defaults to the current window.
  host?: DivebellWindowHost,
): DivebellCore | undefined;
```

```ts
const runtime =
  getDivebellFromWindow() ??
  installDivebellOnWindow(createDivebell());
```

A single page may register multiple runtimes. When a host and sub-application
install separate instances, assign each a stable `runtimeId` and unregister the
sub-application runtime during unmount. The first instance remains the default
for legacy callers; obtain the complete list from the registry.

```ts
import {
  getDivebellRegistryFromWindow,
  installDivebellOnWindow,
  uninstallDivebellFromWindow,
} from "@divebell/core";

installDivebellOnWindow(runtime, window, {
  runtimeId: "runtime-orders",
  name: "orders",
  parentRuntimeId: "runtime-main",
});

const instances = getDivebellRegistryFromWindow()?.list() ?? [];
uninstallDivebellFromWindow(runtime);
```

### registerTarget

Declare an observable page object. A target answers "what can be referenced or
waited for on this page?"

Use it when:

- A business component, flow, loading chain, or debugging fact must be queried
  by an Agent.
- `updateSnapshot`, `waitFor`, or `verify` needs a stable target ID.

Behavior:

- Keep `id` stable, unique, and readable.
- Let the integration declare `type` and `statuses`; Runtime SDK does not provide a
  fixed set of target types or statuses.
- Model one stable capability or result per target. Do not register synonymous
  duplicates.

```ts
type RuntimeObjectType = string;
type RuntimeStatus = string;

interface RegisterTargetInput {
  // Stable unique ID, for example business:orders:risk-panel.
  id: string;
  // Target type, for example business.component.
  type: RuntimeObjectType;
  // Business domain, framework plugin, or other target source.
  source: string;
  // Short human-readable label.
  label?: string;
  // Additional human-readable description.
  description?: string;
  // Complete set of statuses allowed for this target.
  statuses: RuntimeStatus[];
  // Parameter declarations for a parameterized target.
  params?: RuntimeTargetParam[];
  // Target matching rule.
  matcher?: RuntimeTargetMatcher;
  // Small amount of static registration data.
  data?: unknown;
}

interface RuntimeTargetParam {
  // Parameter name.
  name: string;
  // Parameter type.
  type: "string" | "number" | "boolean";
  // Whether the parameter is required.
  required?: boolean;
  // Parameter description.
  description?: string;
}

interface RuntimeTargetMatcher {
  // Exact, path-pattern, or custom matching.
  type: "exact" | "path-pattern" | "custom";
  // Matching pattern when applicable.
  pattern?: string;
}

interface DivebellCore {
  registerTarget(target: RegisterTargetInput): void;
}
```

```ts
runtime.registerTarget({
  id: "business:orders:risk-panel",
  type: "business.component",
  source: "orders",
  statuses: ["pending", "ready", "error"],
});
```

### unregisterTarget

Remove a target and its current snapshot.

Use it when:

- A page, micro-application, or dynamic capability is unmounted or removed.
- A test needs to clean up a temporary target.

Behavior:

- The Agent can no longer wait for or verify that ID after removal.
- Do not remove a target while it still represents a relevant business fact.

```ts
interface DivebellCore {
  unregisterTarget(
    // Target ID to remove.
    targetId: string,
  ): void;
}
```

```ts
runtime.unregisterTarget("business:orders:risk-panel");
```

### getTargets

Read target definitions inside the page.

Use it when:

- Debugging page-side registration.
- A plugin or test must confirm that a target class has been registered.

Behavior:

- Return definitions only, not current state.
- Agents normally query targets through the CLI instead of page code.

```ts
interface RuntimeTargetDescriptor extends RegisterTargetInput {
  // First registration time.
  registeredAt: number;
  // Most recent definition update time.
  updatedAt: number;
}

interface GetTargetsQuery {
  // Filter by target type.
  type?: RuntimeObjectType | RuntimeObjectType[];
  // Filter by source.
  source?: string | string[];
  // Filter by target ID.
  id?: string | string[];
  // Filter by current status.
  status?: RuntimeStatus | RuntimeStatus[];
  // Full-text search.
  query?: string;
}

interface DivebellCore {
  getTargets(query?: GetTargetsQuery): RuntimeTargetDescriptor[];
}
```

```ts
const targets = runtime.getTargets({ query: "orders" });
```

### updateSnapshot

Update a target's current fact. A snapshot answers "what is its state now?"

Use it when:

- A target moves through states such as `pending`, `ready`, or `error`.
- Business results must become verifiable before or after an action.
- A Console, Network, or framework error should become a structured debugging
  snapshot.

Behavior:

- Call `registerTarget` before `updateSnapshot`.
- Use a `status` declared in the target's `statuses`.
- Put structured errors in `error`; place only necessary context in `data`.
- Use `dependsOn` only for dependencies or blockers in the current state.

```ts
interface RuntimeError {
  // Error message.
  message: string;
  // Optional error code.
  code?: string;
  // Optional stack trace.
  stack?: string;
  // Additional structured error data.
  data?: unknown;
}

interface UpdateSnapshotInput {
  // Target ID to update.
  id: string;
  // Current status; must be declared in target.statuses.
  status: RuntimeStatus;
  // Optional type; normally inherited from the registered target.
  type?: RuntimeObjectType;
  // Optional source; normally inherited from the registered target.
  source?: string;
  // Current state description.
  description?: string;
  // Small amount of structured data required to prove the fact.
  data?: unknown;
  // Structured error for an error state.
  error?: RuntimeError;
  // Target IDs that the current state depends on or is blocked by.
  dependsOn?: string[];
}

interface DivebellCore {
  updateSnapshot(input: UpdateSnapshotInput): void;
}
```

```ts
runtime.updateSnapshot({
  id: "business:orders:risk-panel",
  status: "ready",
  data: { visible: true, riskCount },
});
```

:::warning
Do not store a complete DOM, full API response, or large unrelated business
payload in a snapshot. Keep only fields required to prove the conclusion.
:::

### getSnapshot

Read the current snapshot inside the page.

Use it when:

- Debugging current page facts.
- An action handler needs current state to choose its next step.

Behavior:

- Return current facts, not complete history.
- Use `getEvents` when the state-change history matters.

```ts
interface RuntimeSnapshotTarget {
  // Target ID.
  id: string;
  // Target type.
  type: RuntimeObjectType;
  // Current status.
  status: RuntimeStatus;
  // Target source.
  source?: string;
  // Current state description.
  description?: string;
  // Small amount of structured proof data.
  data?: unknown;
  // Structured error for an error state.
  error?: RuntimeError;
  // Most recent update time.
  updatedAt: number;
  // Target IDs that the current state depends on or is blocked by.
  dependsOn?: string[];
}

interface RuntimeSnapshot {
  // Current state indexed by target ID.
  targets: Record<string, RuntimeSnapshotTarget>;
  // Latest event ID represented by this snapshot.
  latestEventId: number;
  // Snapshot capture time.
  capturedAt: number;
}

interface GetSnapshotQuery {
  // Filter by target ID.
  id?: string | string[];
  // Filter by target type.
  type?: RuntimeObjectType | RuntimeObjectType[];
  // Filter by source.
  source?: string | string[];
  // Filter by status.
  status?: RuntimeStatus | RuntimeStatus[];
  // Full-text search.
  query?: string;
}

interface DivebellCore {
  getSnapshot(query?: GetSnapshotQuery): RuntimeSnapshot;
}
```

```ts
const snapshot = runtime.getSnapshot({
  id: "business:orders:risk-panel",
});
```

### getEvents

Read event history inside the page. Events answer "how did state and actions
change?"

Use it when:

- `waitFor` or `verify` fails and the cause may be a missing snapshot update,
  failed action, or mismatched data condition.
- The error sequence must be reconstructed.

Behavior:

- When a target is known, filter with `targetId` rather than reading all events.
- `truncated: true` means the result was limited. Narrow the query or increase
  `limit`.

```ts
interface RuntimeEvent {
  // Monotonically increasing event ID.
  id: number;
  // Event type, for example snapshot.updated or action.finished.
  type: string;
  // Event source.
  source: string;
  // Event time.
  timestamp: number;
  // Related target ID.
  targetId?: string;
  // Related action name.
  actionName?: string;
  // Related status.
  status?: RuntimeStatus;
  // Event payload.
  payload?: unknown;
  // Structured event error.
  error?: RuntimeError;
}

interface GetEventsQuery {
  // Return events after this event ID.
  since?: number;
  // Filter by target ID.
  targetId?: string | string[];
  // Filter by action name.
  actionName?: string | string[];
  // Filter by event type.
  type?: string | string[];
  // Filter by source.
  source?: string | string[];
  // Filter by status.
  status?: RuntimeStatus | RuntimeStatus[];
  // Maximum number of returned events.
  limit?: number;
  // Full-text search.
  query?: string;
}

interface GetEventsResult {
  // Matching events.
  events: RuntimeEvent[];
  // Current latest event ID.
  latestEventId: number;
  // Whether the result was truncated.
  truncated: boolean;
}

interface DivebellCore {
  getEvents(query?: GetEventsQuery): GetEventsResult;
}
```

```ts
const result = runtime.getEvents({
  targetId: "business:orders:risk-panel",
  limit: 50,
});
```

### registerAction

Declare an action that the page permits an Agent to execute. An action answers
"what may the Agent ask the page to do?"

Use it when:

- The page should expose a stable operation such as refresh, navigation, login,
  or selection.
- The Agent must perform an operation and then verify its result through a
  snapshot, `wait-for`, or `verify`.

Behavior:

- Keep actions small, deterministic, and repeatable.
- `runAction` proves only that the handler ran. Write business results to a
  target snapshot.
- Use `availableWhen` to enable an action only under specific Runtime
  conditions.

```ts
type RuntimeActionRisk =
  | "safe"
  | "state-changing"
  | "destructive"
  | "sensitive";

interface RegisterActionInput {
  // Action name, for example orders.refreshRiskPanel.
  name: string;
  // Human-readable action description.
  description?: string;
  // Action source.
  source?: string;
  // Risk classification.
  risk?: RuntimeActionRisk;
  // Conditions under which the action is enabled.
  availableWhen?: RuntimeCondition | RuntimeCondition[];
  // Input JSON Schema.
  inputSchema?: RuntimeJsonSchema;
  // Action implementation.
  handler: RuntimeActionHandler;
}

type RuntimeActionHandler = (
  // Action payload supplied by the Agent.
  payload: unknown,
  // Action execution context.
  context: RuntimeActionContext,
) => Promise<unknown> | unknown;

interface RuntimeActionContext {
  // Current action name.
  actionName: string;
  // Read the current snapshot.
  getSnapshot: () => RuntimeSnapshot;
  // Update a target snapshot.
  updateSnapshot: (input: UpdateSnapshotInput) => void;
  // Wait for a Runtime condition.
  waitFor: (
    condition: RuntimeCondition,
    options?: RuntimeWaitOptions,
  ) => Promise<RuntimeWaitResult>;
}

interface RuntimeJsonSchema {
  // Only object is supported as the top-level schema.
  type: "object";
  // Field definitions.
  properties?: Record<string, RuntimeJsonSchemaProperty>;
  // Required fields.
  required?: string[];
  // Whether undeclared fields are allowed.
  additionalProperties?: boolean;
}

interface RuntimeJsonSchemaProperty {
  // Field type.
  type: "string" | "number" | "boolean" | "array" | "object";
  // Field description.
  description?: string;
  // Allowed enum values.
  enum?: Array<string | number | boolean>;
  // Array item schema.
  items?: RuntimeJsonSchemaProperty;
  // Object field schema.
  properties?: Record<string, RuntimeJsonSchemaProperty>;
  // Required object fields.
  required?: string[];
  // Whether undeclared object fields are allowed.
  additionalProperties?: boolean;
}

interface DivebellCore {
  registerAction(action: RegisterActionInput): void;
}
```

```ts
runtime.registerAction({
  name: "orders.refreshRiskPanel",
  source: "orders",
  risk: "safe",
  description: "Refresh the order risk panel",
  async handler(_payload, context) {
    await refreshRiskPanel();
    context.updateSnapshot({
      id: "business:orders:risk-panel",
      status: "ready",
    });
    return { refreshed: true };
  },
});
```

### unregisterAction

Remove a registered action.

Use it when:

- A page, micro-application, or dynamic action is unmounted or removed.
- A test must clean up a temporary action.

Behavior:

- The Agent cannot run the action after removal.
- Do not remove and re-register an action merely because it is temporarily
  unavailable. Express temporary availability with `availableWhen`.

```ts
interface DivebellCore {
  unregisterAction(
    // Action name to remove.
    actionName: string,
  ): void;
}
```

```ts
runtime.unregisterAction("orders.refreshRiskPanel");
```

### getActions

Read action definitions inside the page.

Use it when:

- Debugging actions exposed by the page.
- A plugin or test must confirm that an action is registered.

Behavior:

- Return action descriptions without executing them.
- Agents normally read actions through the CLI or Bridge.

```ts
interface GetActionsQuery {
  // Filter by action name.
  name?: string | string[];
  // Filter by source.
  source?: string | string[];
  // Filter by risk.
  risk?: RuntimeActionRisk | RuntimeActionRisk[];
  // Filter by current enabled state.
  enabled?: boolean;
  // Full-text search.
  query?: string;
}

interface RuntimeActionDescriptor {
  // Action name.
  name: string;
  // Action description.
  description?: string;
  // Action source.
  source: string;
  // Risk classification.
  risk: RuntimeActionRisk;
  // Availability conditions.
  availableWhen?: RuntimeCondition | RuntimeCondition[];
  // Input JSON Schema.
  inputSchema?: RuntimeJsonSchema;
  // Whether current conditions enable the action.
  enabled: boolean;
  // Reason the action is disabled.
  reason?: string;
  // Registration time.
  registeredAt: number;
  // Most recent definition update time.
  updatedAt: number;
}

interface DivebellCore {
  getActions(query?: GetActionsQuery): RuntimeActionDescriptor[];
}
```

```ts
const actions = runtime.getActions({ query: "orders" });
```

### runAction

Execute a registered action inside the page.

Use it when:

- A page-side test or debugging flow must trigger an action directly.
- The CLI or Bridge invokes an action handler through the page-side entry
  point.

Behavior:

- Execute the handler and record action events.
- Do not update snapshots automatically. The handler must call
  `updateSnapshot` explicitly.
- Continue observing the business result through snapshots, events, `wait-for`,
  or `verify`.

```ts
interface RuntimeActionResult {
  // Whether the handler completed successfully.
  success: boolean;
  // Action name.
  actionName: string;
  // Handler return value.
  result?: unknown;
  // Error thrown by the handler.
  error?: RuntimeError;
}

interface DivebellCore {
  runAction(
    // Action name.
    actionName: string,
    // Action payload.
    payload?: Record<string, unknown>,
  ): Promise<RuntimeActionResult>;
}
```

```ts
const result = await runtime.runAction("orders.refreshRiskPanel", {});
```

:::warning
A successful `runAction` means only that action handling completed. It does not
prove that the expected result is present. Verify the corresponding state; when
the page has a business target, use its snapshot, `wait-for`, or `verify`.
:::

### waitFor

Wait inside the page for a target to reach a requested status and data
condition.

Use it when:

- Waiting for state progress after an action.
- A page-side test must wait for a business target to become ready.
- Navigation, loading, or remote readiness is an intermediate condition.

Behavior:

- Return `success: true` and the matching target when the condition is met.
- On timeout or mismatch, return a failure reason and the current snapshot.
- Agents normally use CLI `wait-for`; when a suitable business target and
  Extension exist, they may use `verify` for final verification.

```ts
interface RuntimeCondition {
  // Target ID to wait for.
  id: string;
  // Required status.
  status: RuntimeStatus;
  // Optional data conditions.
  where?: RuntimeDataCondition[];
}

interface RuntimeDataCondition {
  // Path inside target.data.
  path: string;
  // Expected value.
  equals: unknown;
}

interface RuntimeWaitOptions {
  // Timeout in milliseconds.
  timeout?: number;
}

interface RuntimeWaitResult {
  // Whether the condition matched.
  success: boolean;
  // Original wait condition.
  condition: RuntimeCondition;
  // Snapshot at completion.
  snapshot: RuntimeSnapshot;
  // Matching target when available.
  target?: RuntimeSnapshotTarget;
  // Failure reason.
  reason?: string;
}

interface DivebellCore {
  waitFor(
    condition: RuntimeCondition,
    options?: RuntimeWaitOptions,
  ): Promise<RuntimeWaitResult>;
}
```

```ts
const result = await runtime.waitFor(
  { id: "business:orders:risk-panel", status: "ready" },
  { timeout: 10000 },
);
```

### matchesRuntimeCondition

Check synchronously whether a snapshot satisfies a Runtime condition.

Use it when:

- Testing a `RuntimeCondition`.
- Custom logic must evaluate a condition without starting a wait.

Behavior:

- Perform a synchronous check only.
- Ordinary page integrations rarely need to call it directly.

```ts
function matchesRuntimeCondition(
  // Condition to evaluate.
  condition: RuntimeCondition,
  // Current snapshot.
  snapshot: RuntimeSnapshot,
): boolean;
```

```ts
const matched = matchesRuntimeCondition(
  { id: "business:orders:risk-panel", status: "ready" },
  runtime.getSnapshot(),
);
```

### syncServerRuntimeBridge

Synchronize server-side Runtime state to Bridge.

Use it when:

- A server runtime or SSR flow must publish structured state to Bridge.
- Do not use it for an ordinary browser-page integration.

Behavior:

- This is the server synchronization entry point, not the default browser-page
  integration.
- `divebell open` connects all registered browser runtimes automatically.

```ts
function syncServerRuntimeBridge(
  // Runtime to synchronize.
  runtime: DivebellCore,
  // Server-to-Bridge synchronization options.
  options: BridgeServerSyncOptions,
): Promise<BridgeServerRuntimeSyncResponse>;

interface BridgeServerSyncOptions {
  // Bridge port. Defaults to 17321.
  port?: number;
  // Server runtime ID.
  runtimeId: string;
  // Optional session ID.
  sessionId?: string;
  // Optional render instance ID.
  renderId?: string;
  // Associated page URL.
  url: string;
  // Optional source.
  source?: string;
}

interface BridgeServerRuntimeSyncResponse {
  // Runtime ID accepted by Bridge.
  runtimeId: string;
  // Render instance ID.
  renderId?: string;
  // Bridge acceptance marker.
  accepted: true;
}
```

:::tip
When adding page verification, do not start with
`syncServerRuntimeBridge`. First determine whether the page runtime can connect
to Bridge, register a target, and update its snapshot.
:::

### RuntimeCenter

`RuntimeCenter` is the runtime class.

Use it when:

- Framework or library internals must construct the runtime class directly.
- Ordinary business integrations should not call `new RuntimeCenter()`.

Behavior:

- Prefer `createDivebell()` for ordinary pages.
- Direct construction makes the caller responsible for installation,
  connection, and lifecycle.

```ts
class RuntimeCenter implements DivebellCore {
  // RuntimeCenter implements all DivebellCore instance methods.
}
```

## Agent-Side CLI Mapping

Agents normally use the CLI instead of calling `getSnapshot`, `getEvents`,
`runAction`, or `waitFor` from page code:

```bash
divebell snapshot --id <target-id> --url <url>
divebell events --target-id <target-id> --url <url> --limit 50
divebell run-action <action-name> --url <url> --payload '{}'
divebell wait-for <target-id> ready --url <url> --timeout 10000
```

## Minimal Page-Side Sequence

A common page-side setup is:

```ts
import {
  createDivebell,
  getDivebellFromWindow,
  installDivebellOnWindow,
} from "@divebell/core";

const runtime =
  getDivebellFromWindow() ??
  installDivebellOnWindow(createDivebell());

runtime.registerTarget({
  id: "business:orders:risk-panel",
  type: "business.component",
  source: "orders",
  statuses: ["pending", "ready", "error"],
});

runtime.updateSnapshot({
  id: "business:orders:risk-panel",
  status: "pending",
});
```

Update the same target when the business operation succeeds:

```ts
runtime.updateSnapshot({
  id: "business:orders:risk-panel",
  status: "ready",
  data: { visible: true },
});
```

Update it with a structured error when the operation fails:

```ts
runtime.updateSnapshot({
  id: "business:orders:risk-panel",
  status: "error",
  error: {
    message: error instanceof Error ? error.message : String(error),
  },
});
```

## Bridge and Connections

Page source registers the runtime. The CLI connects it to Bridge when opening
the browser.

Minimal Runtime SDK setup:

```ts
import {
  createDivebell,
  installDivebellOnWindow,
} from "@divebell/core";

const runtime = installDivebellOnWindow(createDivebell());
```

Confirm the connection:

```bash
divebell open <app-url> --bridge http://localhost:17321
divebell runtimes --bridge http://localhost:17321
```

At least one runtime must have `status: "connected"`. When `runtimes` is empty,
do not claim that targets, snapshots, events, or `verify` were used.

When a project has no Divebell initialization, create and install a runtime
through public APIs. Reuse existing initialization instead of installing
duplicates:

```ts
import {
  createDivebell,
  getDivebellFromWindow,
  installDivebellOnWindow,
} from "@divebell/core";

export function ensureDivebellInstalled() {
  const existing = getDivebellFromWindow();
  return existing ?? installDivebellOnWindow(createDivebell());
}
```

## Modeling Guidance

### Targets

A target is an observable object declared by the page. Model one stable
capability or result per target.

```ts
runtime.registerTarget({
  id: "business:orders:risk-panel",
  type: "business.component",
  label: "Orders risk panel",
  source: "orders",
  statuses: ["pending", "ready", "error"],
});
```

Naming guidance:

- Business target: `business:<area>:<capability>`
- Debug target: `debug:<area>:runtime-error`
- Framework target: generated by the Modern, MF, or Garfish plugin

Do not register synonymous duplicates. Reuse an existing target when it already
proves the fact.

### Snapshots

A snapshot is the target's current fact. Store only fields needed to prove the
conclusion.

Register the target before updating it, and use a status declared in
`target.statuses`.

```ts
runtime.updateSnapshot({
  id: "business:orders:risk-panel",
  status: "ready",
  data: {
    orderId,
    visible: true,
    riskCount,
  },
});
```

Avoid placing error details only in `data`:

```ts
runtime.updateSnapshot({
  id: "debug:consumer:runtime-error",
  status: "error",
  data: {
    message: error.message,
    stack: error.stack,
    pathname: location.pathname,
  },
});
```

Prefer the structured `error` field and keep only necessary context in `data`:

```ts
runtime.updateSnapshot({
  id: "debug:consumer:runtime-error",
  status: "error",
  error: {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  },
  data: { pathname: location.pathname },
});
```

Query snapshots with:

```bash
divebell snapshot --url <url> --id business:orders:risk-panel
divebell snapshot --url <url> --query runtime-error
```

### Events

Use events to reconstruct state changes, action history, and error sequences.
Read them only when history is required.

```bash
divebell events --url <url> --target-id business:orders:risk-panel --limit 50
divebell events --url <url> --query runtime-error --limit 50
```

Do not read every event as the default first step. Filter by target ID when it
is known.

### Actions

An action is an operation declared by the page for an Agent. Keep it small,
deterministic, and repeatable.

Action execution proves only that the handler ran. Write business results to a
target snapshot and verify them with `wait-for` or `verify`.

```ts
runtime.registerAction({
  name: "orders.refreshRiskPanel",
  description: "Refresh the order risk panel",
  handler: async () => refreshRiskPanel(),
});
```

Run and verify it:

```bash
divebell run-action --url <url> orders.refreshRiskPanel --payload '{}'
divebell wait-for business:orders:risk-panel ready --url <url> --timeout 10000
```

For a complex action, use an action-result target:

```ts
runtime.registerTarget({
  id: "business:orders:refresh-risk-panel",
  type: "business.action-result",
  source: "orders",
  statuses: ["idle", "running", "success", "error"],
});

runtime.registerAction({
  name: "orders.refreshRiskPanel",
  source: "orders",
  risk: "safe",
  description: "Refresh the order risk panel",
  async handler(_payload, context) {
    context.updateSnapshot({
      id: "business:orders:refresh-risk-panel",
      status: "running",
    });

    try {
      await refreshRiskPanel();
      context.updateSnapshot({
        id: "business:orders:refresh-risk-panel",
        status: "success",
      });
      return { refreshed: true };
    } catch (error) {
      context.updateSnapshot({
        id: "business:orders:refresh-risk-panel",
        status: "error",
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  },
});
```

After the action, continue observing snapshots, events, `wait-for`, or `verify`.
`run-action` is not final verification.

### wait-for and Optional verify

Use `wait-for` for intermediate state such as navigation, loading, and
post-action progress:

```bash
divebell wait-for business:orders:risk-panel ready --url <url> --timeout 10000
```

`verify` is a business-target verification command provided by the
troubleshooting Extension. Use it as a post-change final check only when the
page already has a business target suited to the task:

```bash
divebell verify business:orders:risk-panel ready --url <url> --timeout 10000
```

A ready Modern, MF, or Garfish target proves only its underlying loading layer.
It does not prove that the business UI succeeded. When an ordinary page has no
business target, verify through a directly relevant page result, request
result, or specialized Extension. Do not add a low-value target solely to run
`verify`.

## Examples

### Verify Login

```ts
runtime.registerTarget({
  id: "business:auth:login",
  type: "business.flow",
  source: "auth",
  label: "Login flow",
  statuses: ["pending", "ready", "error"],
});
```

```bash
divebell run-action --url http://localhost:3000/login auth.login --payload '{"username":"demo"}'
divebell snapshot --url http://localhost:3000/login --id business:auth:login
divebell verify business:auth:login ready --url http://localhost:3000/login --timeout 10000
```

### Read Release Notes

```bash
divebell snapshot --url <url> --query release-notes
divebell verify business:release-notes:content ready --url <url> --timeout 10000
```

### Wait for a Remote

```bash
divebell snapshot --url <url> --query opsConsoleProvider
divebell wait-for mf:remote:opsConsoleProvider ready --url <url> --timeout 10000
```

Remote readiness proves only the loading layer. If the task requires business
UI, verify an existing business target or an explicit page result as well.

### Convert a Console Error into a Debug Snapshot

Register `debug:consumer:runtime-error` before installing the listener, then
update it with a structured error:

```ts
window.addEventListener("error", (event) => {
  runtime.updateSnapshot({
    id: "debug:consumer:runtime-error",
    status: "error",
    error: {
      message: event.message,
    },
    data: {
      filename: event.filename,
      pathname: location.pathname,
    },
  });
});
```

```bash
divebell snapshot --url <url> --id debug:consumer:runtime-error
```
