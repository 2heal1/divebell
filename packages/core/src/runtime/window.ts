import { createOpenRuntime } from "./center.js";
import type { OpenRuntimeCore } from "./types.js";

export interface OpenRuntimeWindowHost {
  __OPEN_RUNTIME__?: OpenRuntimeCore;
}

export function installOpenRuntimeOnWindow(
  runtime: OpenRuntimeCore = createOpenRuntime(),
  host: OpenRuntimeWindowHost | undefined = getDefaultWindowHost()
): OpenRuntimeCore {
  if (host === undefined) {
    return runtime;
  }

  host.__OPEN_RUNTIME__ = runtime;
  return runtime;
}

export function getOpenRuntimeFromWindow(
  host: OpenRuntimeWindowHost | undefined = getDefaultWindowHost()
): OpenRuntimeCore | undefined {
  return host?.__OPEN_RUNTIME__;
}

function getDefaultWindowHost(): OpenRuntimeWindowHost | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window;
}

declare global {
  interface Window {
    __OPEN_RUNTIME__?: OpenRuntimeCore;
  }
}
