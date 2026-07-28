import type { BridgeRuntimeInfo } from "@divebell/bridge";

export type Fetcher = typeof fetch;

export interface RuntimeSelector {
  runtimeId?: string;
  sessionId?: string;
  url?: string;
}

export interface RuntimeResourceResult<T> {
  runtime: BridgeRuntimeInfo;
  result: T;
}
