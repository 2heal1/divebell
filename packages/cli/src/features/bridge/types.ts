import type { Fetcher, RuntimeSelector } from "../runtime/client.js";

export interface BridgeStartOptions {
  port: number;
}

export interface BridgeStartResult {
  pid?: number;
  port?: number;
  bridgeUrl?: string;
}

export interface BridgeStarter {
  start(options: BridgeStartOptions): Promise<BridgeStartResult | void>;
}

export interface ManagedBridgeState {
  bridgeUrl: string;
  pid: number;
  port: number;
  startedAt: number;
}

export interface BridgeStateStore {
  read(): Promise<ManagedBridgeState | undefined>;
  write(state: ManagedBridgeState): Promise<void>;
  remove(): Promise<void>;
}

export interface BridgeProcessController {
  isRunning(pid: number): boolean;
  stop(pid: number): void;
}

export interface EnsureBridgeOptions {
  fetcher: Fetcher;
  bridgeUrl: string;
  starter: BridgeStarter;
  stateStore?: BridgeStateStore;
  port?: number;
  timeout?: number;
}

export interface EnsureBridgeResult {
  bridgeUrl: string;
  pid?: number;
  status: "running" | "started";
}

export interface StartDedicatedBridgeOptions {
  fetcher: Fetcher;
  starter: BridgeStarter;
  stateDirectory?: string;
  port?: number;
  timeout?: number;
}

export interface StartDedicatedBridgeResult {
  bridgeUrl: string;
  port: number;
  pid?: number;
  status: "started";
}

export interface StopBridgeOptions {
  bridgeUrl: string;
  stateStore: BridgeStateStore;
  processController?: BridgeProcessController;
}

export interface StopBridgeResult {
  bridgeUrl: string;
  pid?: number;
  stopped: boolean;
  reason?: string;
}

export interface WaitForRuntimeSelectionOptions {
  fetcher: Fetcher;
  bridgeUrl: string;
  selector: RuntimeSelector;
  timeout?: number;
}
