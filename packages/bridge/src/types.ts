export type BridgeRuntimeStatus = "server" | "connected" | "disconnected";

export interface BridgeRuntimeInfo {
  runtimeId: string;
  url: string;
  sessionId?: string;
  renderId?: string;
  source?: string;
  pageInstanceId?: string;
  status: BridgeRuntimeStatus;
  connectedAt: number;
  lastSeenAt: number;
  disconnectedAt?: number;
}

export interface BridgeListenOptions {
  port?: number;
  hostname?: string;
}

export interface BridgeServerAddress {
  port: number;
  hostname: string;
  url: string;
}

export interface BridgeServer {
  listen(options?: BridgeListenOptions): Promise<BridgeServerAddress>;
  close(): Promise<void>;
  address(): BridgeServerAddress | undefined;
}

export interface CreateBridgeServerOptions {
  clock?: {
    now(): number;
  };
  commandTimeout?: number;
  idGenerator?: () => string;
}

export interface BridgeErrorBody {
  error: {
    message: string;
    code?: string;
  };
}
