import {
  createOpenRuntime,
  getOpenRuntimeFromWindow,
  installOpenRuntimeOnWindow,
  type BridgeConnectOptions,
  type OpenRuntimeCore,
  type OpenRuntimeWindowHost
} from "@openruntime/core";

export interface ResolveRuntimeOptions {
  runtime?: OpenRuntimeCore;
  bridge?: false | BridgeConnectOptions;
  host?: OpenRuntimeWindowHost;
}

const connectedRuntimes = new WeakSet<OpenRuntimeCore>();

export function resolveOpenRuntime(options: ResolveRuntimeOptions = {}): OpenRuntimeCore {
  const host = options.host ?? getDefaultHost();
  const runtime =
    options.runtime ?? getOpenRuntimeFromWindow(host) ?? installOpenRuntimeOnWindow(createOpenRuntime(), host);

  if (options.bridge !== undefined && options.bridge !== false && !connectedRuntimes.has(runtime)) {
    runtime.connectBridge(options.bridge);
    connectedRuntimes.add(runtime);
  }

  return runtime;
}

function getDefaultHost(): OpenRuntimeWindowHost | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window;
}
