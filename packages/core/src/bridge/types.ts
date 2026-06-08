import type { GetActionsQuery } from "../action/types.js";
import type { GetEventsQuery } from "../event/types.js";
import type { GetSnapshotQuery } from "../snapshot/types.js";
import type { GetTargetsQuery } from "../target/types.js";
import type { RuntimeWaitOptions } from "../wait/types.js";

export const OPEN_RUNTIME_BRIDGE_DEFAULT_PORT = 17321;

export interface BridgeConnectOptions {
  port?: number;
  autoReconnect?: boolean;
}

export type BridgeRuntimeCommandName =
  | "getTargets"
  | "getSnapshot"
  | "getEvents"
  | "getActions"
  | "getInputOptions"
  | "runAction"
  | "waitFor";

export type BridgeRuntimeQuery =
  | GetTargetsQuery
  | GetSnapshotQuery
  | GetEventsQuery
  | GetActionsQuery;

export interface BridgeRuntimeRequest {
  requestId: string;
  method: BridgeRuntimeCommandName;
  query?: BridgeRuntimeQuery;
  actionName?: string;
  inputName?: string;
  payload?: Record<string, unknown>;
  targetId?: string;
  status?: string;
  options?: RuntimeWaitOptions;
}

export interface BridgeRuntimeResponse {
  success: boolean;
  result?: unknown;
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
}
