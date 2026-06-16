import type { GetActionsQuery, RuntimeActionDescriptor } from "../action/types.js";
import type { GetEventsQuery, GetEventsResult } from "../event/types.js";
import type { GetSnapshotQuery, RuntimeSnapshot } from "../snapshot/types.js";
import type { GetTargetsQuery, RuntimeTargetDescriptor } from "../target/types.js";
import type { RuntimeDataCondition, RuntimeWaitOptions } from "../wait/types.js";

export const OPEN_RUNTIME_BRIDGE_DEFAULT_PORT = 17321;
export const OPEN_RUNTIME_SESSION_QUERY_PARAM = "openruntimeSessionId";

export interface BridgeConnectOptions {
  port?: number;
  autoReconnect?: boolean;
  pageInstanceId?: string;
  runtimeId?: string;
  sessionId?: string;
  renderId?: string;
}

export interface BridgeServerSyncOptions {
  port?: number;
  runtimeId: string;
  sessionId?: string;
  renderId?: string;
  url: string;
  source?: string;
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
  where?: RuntimeDataCondition[];
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

export interface BridgeServerRuntimeSyncPayload {
  runtimeId: string;
  sessionId?: string;
  renderId?: string;
  url: string;
  source?: string;
  targets?: RuntimeTargetDescriptor[];
  snapshot?: RuntimeSnapshot;
  events?: GetEventsResult;
  actions?: RuntimeActionDescriptor[];
}

export interface BridgeServerRuntimeSyncResponse {
  runtimeId: string;
  renderId?: string;
  accepted: true;
}
