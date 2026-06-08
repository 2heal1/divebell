import type {
  GetActionsQuery,
  RegisterActionInput,
  RuntimeActionDescriptor,
  RuntimeActionResult,
  RuntimeInputOption,
  RuntimeInputOptionsOptions
} from "../action/types.js";
import type { GetEventsQuery, GetEventsResult } from "../event/types.js";
import type { GetSnapshotQuery, RuntimeSnapshot, UpdateSnapshotInput } from "../snapshot/types.js";
import type { GetTargetsQuery, RegisterTargetInput, RuntimeTargetDescriptor } from "../target/types.js";
import type { RuntimeCondition, RuntimeWaitOptions, RuntimeWaitResult } from "../wait/types.js";
import type { BridgeConnectOptions } from "../bridge/types.js";

export interface RuntimeError {
  message: string;
  code?: string;
  stack?: string;
  data?: unknown;
}

export interface OpenRuntimeCore {
  connectBridge(options?: BridgeConnectOptions): void;
  registerTarget(target: RegisterTargetInput): void;
  unregisterTarget(targetId: string): void;
  getTargets(query?: GetTargetsQuery): RuntimeTargetDescriptor[];
  updateSnapshot(input: UpdateSnapshotInput): void;
  getSnapshot(query?: GetSnapshotQuery): RuntimeSnapshot;
  getEvents(query?: GetEventsQuery): GetEventsResult;
  registerAction(action: RegisterActionInput): void;
  unregisterAction(actionName: string): void;
  getActions(query?: GetActionsQuery): RuntimeActionDescriptor[];
  getInputOptions(
    actionName: string,
    inputName: string,
    currentPayload?: Record<string, unknown>,
    options?: RuntimeInputOptionsOptions
  ): Promise<RuntimeInputOption[]>;
  runAction(actionName: string, payload?: Record<string, unknown>): Promise<RuntimeActionResult>;
  waitFor(condition: RuntimeCondition, options?: RuntimeWaitOptions): Promise<RuntimeWaitResult>;
}

export interface RuntimeClock {
  now(): number;
}

export interface CreateOpenRuntimeOptions {
  clock?: RuntimeClock;
}
