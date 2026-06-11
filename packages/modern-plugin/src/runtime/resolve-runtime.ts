import {
  createOpenRuntime,
  getOpenRuntimeFromWindow,
  installOpenRuntimeOnWindow,
  type BridgeConnectOptions,
  type OpenRuntimeCore,
  type OpenRuntimeWindowHost
} from "@openruntime/core";
import { readOpenRuntimeRenderContext } from "./render-context.js";

export interface ResolveRuntimeOptions {
  runtime?: OpenRuntimeCore;
  bridge?: false | BridgeConnectOptions;
  host?: OpenRuntimeWindowHost;
  beforeConnect?: (runtime: OpenRuntimeCore) => void;
}

const connectedRuntimes = new WeakSet<OpenRuntimeCore>();

export function resolveOpenRuntime(options: ResolveRuntimeOptions = {}): OpenRuntimeCore {
  const host = options.host ?? getDefaultHost();
  const runtime =
    options.runtime ?? getOpenRuntimeFromWindow(host) ?? installOpenRuntimeOnWindow(createOpenRuntime(), host);

  options.beforeConnect?.(runtime);

  if (host !== undefined && options.bridge !== undefined && options.bridge !== false && !connectedRuntimes.has(runtime)) {
    runtime.connectBridge(withRenderContext(options.bridge));
    connectedRuntimes.add(runtime);
  }

  return runtime;
}

function withRenderContext(options: BridgeConnectOptions): BridgeConnectOptions {
  const context = readOpenRuntimeRenderContext();
  if (context === undefined) {
    return options;
  }

  return {
    ...options,
    runtimeId: options.runtimeId ?? context.runtimeId,
    renderId: options.renderId ?? context.renderId
  };
}

function getDefaultHost(): OpenRuntimeWindowHost | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window;
}
