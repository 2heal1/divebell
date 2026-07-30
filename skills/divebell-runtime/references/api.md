# Runtime SDK API

Use this reference when exact Runtime SDK fields or return values are needed.

Import public page-side APIs from `@divebell/core`.

## Runtime initialization

```ts
function createDivebell(
  options?: {
    clock?: { now(): number };
  },
): RuntimeCenter;
```

Every call creates a new Runtime instance.

```ts
function installDivebellOnWindow(
  runtime?: DivebellCore,
  host?: DivebellWindowHost,
  options?: DivebellInstanceOptions,
): DivebellCore;
```

```ts
function getDivebellFromWindow(
  host?: DivebellWindowHost,
): DivebellCore | undefined;
```

```ts
interface DivebellInstanceOptions {
  runtimeId?: string;
  name?: string;
  source?: string;
  parentRuntimeId?: string;
  renderId?: string;
}
```

Prefer:

```ts
const runtime =
  getDivebellFromWindow() ??
  installDivebellOnWindow(createDivebell());
```

## Targets

```ts
interface RegisterTargetInput {
  id: string;
  type: string;
  source: string;
  label?: string;
  description?: string;
  statuses: string[];
  params?: RuntimeTargetParam[];
  matcher?: RuntimeTargetMatcher;
  data?: unknown;
}
```

```ts
interface RuntimeTargetParam {
  name: string;
  type: "string" | "number" | "boolean";
  required?: boolean;
  description?: string;
}
```

```ts
interface RuntimeTargetMatcher {
  type: "exact" | "path-pattern" | "custom";
  pattern?: string;
}
```

```ts
interface DivebellCore {
  registerTarget(target: RegisterTargetInput): void;
  unregisterTarget(targetId: string): void;
}
```

## Snapshots

```ts
interface RuntimeError {
  message: string;
  code?: string;
  stack?: string;
  data?: unknown;
}
```

```ts
interface UpdateSnapshotInput {
  id: string;
  status: string;
  type?: string;
  source?: string;
  description?: string;
  data?: unknown;
  error?: RuntimeError;
  dependsOn?: string[];
}
```

```ts
interface DivebellCore {
  updateSnapshot(input: UpdateSnapshotInput): void;
}
```

```ts
interface RuntimeSnapshotTarget {
  id: string;
  type: string;
  status: string;
  source?: string;
  description?: string;
  data?: unknown;
  error?: RuntimeError;
  updatedAt: number;
  dependsOn?: string[];
}
```

```ts
interface RuntimeSnapshot {
  targets: Record<string, RuntimeSnapshotTarget>;
  latestEventId: number;
  capturedAt: number;
}
```

## Events

```ts
interface RuntimeEvent {
  id: number;
  type: string;
  source: string;
  timestamp: number;
  targetId?: string;
  actionName?: string;
  status?: string;
  payload?: unknown;
  error?: RuntimeError;
}
```

```ts
interface GetEventsQuery {
  since?: number;
  targetId?: string | string[];
  actionName?: string | string[];
  type?: string | string[];
  source?: string | string[];
  status?: string | string[];
  limit?: number;
  query?: string;
}
```

```ts
interface GetEventsResult {
  events: RuntimeEvent[];
  latestEventId: number;
  truncated: boolean;
}
```

```ts
interface DivebellCore {
  getEvents(query?: GetEventsQuery): GetEventsResult;
}
```

Snapshot updates and Action execution produce Runtime history. Ordinary
integrations do not need to create a second event system.

## Actions

```ts
type RuntimeActionRisk =
  | "safe"
  | "state-changing"
  | "destructive"
  | "sensitive";
```

```ts
interface RegisterActionInput {
  name: string;
  description?: string;
  source?: string;
  risk?: RuntimeActionRisk;
  availableWhen?: RuntimeCondition | RuntimeCondition[];
  inputSchema?: RuntimeJsonSchema;
  handler: RuntimeActionHandler;
}
```

```ts
type RuntimeActionHandler = (
  payload: unknown,
  context: RuntimeActionContext,
) => Promise<unknown> | unknown;
```

```ts
interface RuntimeActionContext {
  actionName: string;
  getSnapshot: () => RuntimeSnapshot;
  updateSnapshot: (input: UpdateSnapshotInput) => void;
  waitFor: (
    condition: RuntimeCondition,
    options?: RuntimeWaitOptions,
  ) => Promise<RuntimeWaitResult>;
}
```

```ts
interface RuntimeJsonSchema {
  type: "object";
  properties?: Record<string, RuntimeJsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}
```

```ts
interface RuntimeJsonSchemaProperty {
  type: "string" | "number" | "boolean" | "array" | "object";
  description?: string;
  enum?: Array<string | number | boolean>;
  items?: RuntimeJsonSchemaProperty;
  properties?: Record<string, RuntimeJsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}
```

```ts
interface DivebellCore {
  registerAction(action: RegisterActionInput): void;
  unregisterAction(actionName: string): void;
}
```

## Conditions and waiting

```ts
interface RuntimeCondition {
  id: string;
  status: string;
  where?: RuntimeDataCondition[];
}
```

```ts
interface RuntimeDataCondition {
  path: string;
  equals: unknown;
}
```

```ts
interface RuntimeWaitOptions {
  timeout?: number;
}
```

```ts
interface RuntimeWaitResult {
  success: boolean;
  condition: RuntimeCondition;
  snapshot: RuntimeSnapshot;
  target?: RuntimeSnapshotTarget;
  reason?: string;
}
```

```ts
interface DivebellCore {
  waitFor(
    condition: RuntimeCondition,
    options?: RuntimeWaitOptions,
  ): Promise<RuntimeWaitResult>;
}
```

## Action result

```ts
interface RuntimeActionResult {
  success: boolean;
  actionName: string;
  result?: unknown;
  error?: RuntimeError;
}
```

```ts
interface DivebellCore {
  runAction(
    actionName: string,
    payload?: Record<string, unknown>,
  ): Promise<RuntimeActionResult>;
}
```

A successful result means the handler completed. Verify the business outcome
through the relevant Snapshot or `waitFor`.
