import { ActionRegistry, getAvailability } from "../action/registry.js";
import type {
  GetActionsQuery,
  RegisterActionInput,
  RuntimeActionContext,
  RuntimeActionResult,
  RuntimeInputOption,
  RuntimeInputOptionsOptions
} from "../action/types.js";
import { validateActionPayload } from "../action/validation.js";
import { EventLog } from "../event/log.js";
import type { GetEventsQuery, GetEventsResult } from "../event/types.js";
import { SnapshotStore } from "../snapshot/store.js";
import type { GetSnapshotQuery, RuntimeSnapshot, UpdateSnapshotInput } from "../snapshot/types.js";
import { TargetRegistry } from "../target/registry.js";
import type { GetTargetsQuery, RegisterTargetInput, RuntimeTargetDescriptor } from "../target/types.js";
import { WaitManager } from "../wait/manager.js";
import type {
  RuntimeCondition,
  RuntimeWaitOptions,
  RuntimeWaitResult
} from "../wait/types.js";
import type {
  CreateOpenRuntimeOptions,
  OpenRuntimeCore,
  RuntimeClock,
  RuntimeError
} from "./types.js";

const systemSource = "openruntime";

export class RuntimeCenter implements OpenRuntimeCore {
  readonly #targets: TargetRegistry;
  readonly #snapshot: SnapshotStore;
  readonly #events: EventLog;
  readonly #actions: ActionRegistry;
  readonly #waits = new WaitManager();

  constructor(options: CreateOpenRuntimeOptions = {}) {
    const clock = options.clock ?? systemClock;
    this.#targets = new TargetRegistry(clock);
    this.#snapshot = new SnapshotStore(clock);
    this.#events = new EventLog(clock);
    this.#actions = new ActionRegistry(clock);
  }

  registerTarget(target: RegisterTargetInput): void {
    this.#targets.register(target);
  }

  unregisterTarget(targetId: string): void {
    this.#targets.unregister(targetId);
    this.#snapshot.remove(targetId);
    this.#waits.rejectForTarget(targetId, () => this.getSnapshot());
  }

  getTargets(query?: GetTargetsQuery): RuntimeTargetDescriptor[] {
    return this.#targets.list(query);
  }

  updateSnapshot(input: UpdateSnapshotInput): void {
    const target = this.#targets.get(input.id);
    if (target === undefined) {
      this.#recordRejectedUpdate(input, {
        message: `Cannot update unregistered target "${input.id}".`,
        code: "target_not_registered"
      });
      return;
    }

    if (input.type !== undefined && input.type !== target.type) {
      this.#recordRejectedUpdate(input, {
        message: `Snapshot type "${input.type}" does not match registered target type "${target.type}".`,
        code: "target_type_mismatch"
      }, target);
      return;
    }

    if (!target.statuses.includes(input.status)) {
      this.#recordRejectedUpdate(input, {
        message: `Status "${input.status}" is not declared for target "${input.id}".`,
        code: "target_status_not_declared"
      }, target);
      return;
    }

    this.#snapshot.update(target, input);
    this.#events.append({
      type: "snapshot.updated",
      source: input.source ?? target.source,
      targetId: input.id,
      status: input.status,
      payload: normalizeAcceptedUpdate(input, target)
    });
    this.#waits.resolveForTarget(input.id, () => this.getSnapshot());
  }

  getSnapshot(query?: GetSnapshotQuery): RuntimeSnapshot {
    return this.#snapshot.get(query, this.#events.latestEventId());
  }

  getEvents(query?: GetEventsQuery): GetEventsResult {
    return this.#events.get(query);
  }

  registerAction(action: RegisterActionInput): void {
    this.#actions.register(action);
  }

  unregisterAction(actionName: string): void {
    this.#actions.unregister(actionName);
  }

  getActions(query?: GetActionsQuery): ReturnType<OpenRuntimeCore["getActions"]> {
    return this.#actions.list(query, this.getSnapshot());
  }

  async getInputOptions(
    actionName: string,
    inputName: string,
    currentPayload?: Record<string, unknown>,
    options?: RuntimeInputOptionsOptions
  ): Promise<RuntimeInputOption[]> {
    const inputOptions = this.#actions.getInputOptions(
      actionName,
      inputName,
      currentPayload,
      this.#createActionContext(actionName)
    );

    return withTimeout(inputOptions, options?.timeout, "Timed out while reading input options.");
  }

  async runAction(
    actionName: string,
    payload?: Record<string, unknown>
  ): Promise<RuntimeActionResult> {
    const action = this.#actions.get(actionName);
    if (action === undefined) {
      return this.#recordActionFailure(actionName, payload, {
        message: `Action "${actionName}" is not registered.`,
        code: "action_not_registered"
      });
    }

    const availability = getAvailability(action.availableWhen, this.getSnapshot());
    if (!availability.enabled) {
      return this.#recordActionFailure(actionName, payload, {
        message: availability.reason ?? `Action "${actionName}" is not available.`,
        code: "action_not_available"
      }, action.source);
    }

    const validationError = validateActionPayload(action.inputSchema, payload);
    if (validationError !== undefined) {
      return this.#recordActionFailure(actionName, payload, validationError, action.source);
    }

    this.#events.append({
      type: "action.started",
      source: action.source,
      actionName,
      payload
    });

    try {
      const result = await action.handler(payload ?? {}, this.#createActionContext(actionName));
      this.#events.append({
        type: "action.success",
        source: action.source,
        actionName,
        payload: result
      });

      return {
        success: true,
        actionName,
        result
      };
    } catch (error) {
      return this.#recordActionFailure(actionName, payload, toRuntimeError(error), action.source);
    }
  }

  waitFor(condition: RuntimeCondition, options?: RuntimeWaitOptions): Promise<RuntimeWaitResult> {
    const snapshot = this.getSnapshot();
    const target = snapshot.targets[condition.id];
    if (target?.status === condition.status) {
      return Promise.resolve({
        success: true,
        condition,
        snapshot,
        target
      });
    }

    if (target === undefined && this.#targets.get(condition.id) === undefined) {
      return Promise.resolve({
        success: false,
        condition,
        snapshot,
        reason: "Target is not registered."
      });
    }

    return this.#waits.waitFor(condition, options, () => this.getSnapshot());
  }

  #recordRejectedUpdate(
    input: UpdateSnapshotInput,
    error: RuntimeError,
    target?: RuntimeTargetDescriptor
  ): void {
    this.#events.append({
      type: "snapshot.update.rejected",
      source: input.source ?? target?.source ?? systemSource,
      targetId: input.id,
      status: input.status,
      payload: input,
      error
    });
  }

  #recordActionFailure(
    actionName: string,
    payload: Record<string, unknown> | undefined,
    error: RuntimeError,
    source = systemSource
  ): RuntimeActionResult {
    this.#events.append({
      type: "action.error",
      source,
      actionName,
      payload,
      error
    });

    return {
      success: false,
      actionName,
      error
    };
  }

  #createActionContext(actionName: string): RuntimeActionContext {
    return {
      actionName,
      getSnapshot: () => this.getSnapshot(),
      updateSnapshot: (input) => this.updateSnapshot(input),
      waitFor: (condition, options) => this.waitFor(condition, options)
    };
  }
}

export function createOpenRuntime(options?: CreateOpenRuntimeOptions): RuntimeCenter {
  return new RuntimeCenter(options);
}

const systemClock: RuntimeClock = {
  now: () => Date.now()
};

function normalizeAcceptedUpdate(
  input: UpdateSnapshotInput,
  target: RuntimeTargetDescriptor
): UpdateSnapshotInput {
  const payload: UpdateSnapshotInput = {
    id: input.id,
    type: target.type,
    source: input.source ?? target.source,
    status: input.status
  };

  if (input.description !== undefined) payload.description = input.description;
  if ("data" in input) payload.data = input.data;
  if (input.error !== undefined) payload.error = { ...input.error };
  if (input.dependsOn !== undefined) payload.dependsOn = [...input.dependsOn];

  return payload;
}

function toRuntimeError(error: unknown): RuntimeError {
  if (error instanceof Error) {
    const runtimeError: RuntimeError = {
      message: error.message
    };

    if (error.stack !== undefined) {
      runtimeError.stack = error.stack;
    }

    return runtimeError;
  }

  return {
    message: String(error)
  };
}

function withTimeout<T>(promise: Promise<T>, timeout: number | undefined, message: string): Promise<T> {
  if (timeout === undefined || !Number.isFinite(timeout) || timeout < 0) {
    return promise;
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, Math.floor(timeout));

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
