import { matchesText, matchesValue } from "../shared/query.js";
import type { RuntimeClock } from "../runtime/types.js";
import type { RuntimeSnapshot } from "../snapshot/types.js";
import type { RuntimeCondition } from "../wait/types.js";
import type {
  GetActionsQuery,
  RegisterActionInput,
  RuntimeActionDescriptor
} from "./types.js";

export interface RegisteredAction extends RuntimeActionDescriptor {
  handler: RegisterActionInput["handler"];
}

export interface ActionAvailability {
  enabled: boolean;
  reason?: string;
}

const defaultActionSource = "business";
const defaultActionRisk = "state-changing";

export class ActionRegistry {
  readonly #clock: RuntimeClock;
  readonly #actions = new Map<string, RegisteredAction>();

  constructor(clock: RuntimeClock) {
    this.#clock = clock;
  }

  register(input: RegisterActionInput): void {
    const now = this.#clock.now();
    const existing = this.#actions.get(input.name);
    const action = normalizeAction(input, existing?.registeredAt ?? now, now);
    this.#actions.set(action.name, action);
  }

  unregister(actionName: string): boolean {
    return this.#actions.delete(actionName);
  }

  get(actionName: string): RegisteredAction | undefined {
    const action = this.#actions.get(actionName);
    return action === undefined ? undefined : cloneRegisteredAction(action);
  }

  list(
    query: GetActionsQuery | undefined,
    snapshot: RuntimeSnapshot
  ): RuntimeActionDescriptor[] {
    return Array.from(this.#actions.values())
      .map((action) => toDescriptor(action, getAvailability(action.availableWhen, snapshot)))
      .filter((action) => matchesAction(action, query))
      .map(cloneActionDescriptor);
  }
}

export function getAvailability(
  availableWhen: RuntimeCondition | RuntimeCondition[] | undefined,
  snapshot: RuntimeSnapshot
): ActionAvailability {
  if (availableWhen === undefined) {
    return { enabled: true };
  }

  const conditions = Array.isArray(availableWhen) ? availableWhen : [availableWhen];
  for (const condition of conditions) {
    const target = snapshot.targets[condition.id];
    if (target?.status !== condition.status) {
      return {
        enabled: false,
        reason: `Waiting for ${condition.id} to reach ${condition.status}.`
      };
    }
  }

  return { enabled: true };
}

function normalizeAction(
  input: RegisterActionInput,
  registeredAt: number,
  updatedAt: number
): RegisteredAction {
  const name = assertNonEmptyString(input.name, "action name");
  if (typeof input.handler !== "function") {
    throw new Error("action handler must be a function");
  }

  const action: RegisteredAction = {
    name,
    source: input.source ?? defaultActionSource,
    risk: input.risk ?? defaultActionRisk,
    enabled: true,
    registeredAt,
    updatedAt,
    handler: input.handler
  };

  assignOptionalActionFields(action, input);

  return action;
}

function toDescriptor(
  action: RegisteredAction,
  availability: ActionAvailability
): RuntimeActionDescriptor {
  const descriptor: RuntimeActionDescriptor = {
    name: action.name,
    source: action.source,
    risk: action.risk,
    enabled: availability.enabled,
    registeredAt: action.registeredAt,
    updatedAt: action.updatedAt
  };

  assignOptionalActionFields(descriptor, action);
  if (!availability.enabled && availability.reason !== undefined) {
    descriptor.reason = availability.reason;
  }

  return descriptor;
}

function cloneRegisteredAction(action: RegisteredAction): RegisteredAction {
  const clone: RegisteredAction = {
    ...cloneActionDescriptor(action),
    handler: action.handler
  };

  return clone;
}

function cloneActionDescriptor(action: RuntimeActionDescriptor): RuntimeActionDescriptor {
  const clone: RuntimeActionDescriptor = {
    name: action.name,
    source: action.source,
    risk: action.risk,
    enabled: action.enabled,
    registeredAt: action.registeredAt,
    updatedAt: action.updatedAt
  };

  assignOptionalActionFields(clone, action);
  if (action.reason !== undefined) clone.reason = action.reason;

  return clone;
}

function assignOptionalActionFields(
  target: RuntimeActionDescriptor,
  input: Partial<RuntimeActionDescriptor>
): void {
  if (input.description !== undefined) target.description = input.description;
  if (input.availableWhen !== undefined) {
    target.availableWhen = Array.isArray(input.availableWhen)
      ? input.availableWhen.map((condition) => ({ ...condition }))
      : { ...input.availableWhen };
  }
  if (input.inputSchema !== undefined) target.inputSchema = cloneInputSchema(input.inputSchema);
}

function cloneInputSchema<T extends RuntimeActionDescriptor["inputSchema"]>(schema: T): T {
  if (schema === undefined) {
    return schema;
  }

  return structuredClone(schema);
}

function matchesAction(action: RuntimeActionDescriptor, query: GetActionsQuery | undefined): boolean {
  if (query === undefined) {
    return true;
  }

  return (
    matchesValue(action.name, query.name) &&
    matchesValue(action.source, query.source) &&
    matchesValue(action.risk, query.risk) &&
    (query.enabled === undefined || action.enabled === query.enabled) &&
    matchesText([action.name, action.description], query.query)
  );
}

function assertNonEmptyString(value: string, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value;
}
