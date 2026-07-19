import {
  createOpenRuntime,
  getOpenRuntimeFromWindow,
  installOpenRuntimeOnWindow,
  type OpenRuntimeCore,
  type OpenRuntimeWindowHost
} from "@openruntime/core";
import { readOpenRuntimeRenderContext } from "./render-context.js";

export interface ResolveRuntimeOptions {
  runtime?: OpenRuntimeCore;
  host?: OpenRuntimeWindowHost;
  name?: string;
  source?: string;
  parentRuntimeId?: string;
  beforeConnect?: (runtime: OpenRuntimeCore) => void;
}

export function resolveOpenRuntime(options: ResolveRuntimeOptions = {}): OpenRuntimeCore {
  const host = options.host ?? getDefaultHost();
  const runtime = options.runtime ?? getOpenRuntimeFromWindow(host) ?? createOpenRuntime();

  options.beforeConnect?.(runtime);

  if (host !== undefined) {
    const context = readOpenRuntimeRenderContext();
    const source = options.source ?? context?.source;
    installOpenRuntimeOnWindow(runtime, host, {
      ...(context?.runtimeId === undefined ? {} : { runtimeId: context.runtimeId }),
      ...(context?.renderId === undefined ? {} : { renderId: context.renderId }),
      ...(options.name === undefined ? {} : { name: options.name }),
      ...(source === undefined ? {} : { source }),
      ...(options.parentRuntimeId === undefined ? {} : { parentRuntimeId: options.parentRuntimeId })
    });
  }

  return runtime;
}

function getDefaultHost(): OpenRuntimeWindowHost | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window;
}
