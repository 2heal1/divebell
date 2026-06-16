import type { OpenRuntimeCore, RuntimeError } from "../runtime/types.js";
import {
  OPEN_RUNTIME_BRIDGE_DEFAULT_PORT,
  type BridgeServerRuntimeSyncResponse,
  type BridgeServerSyncOptions
} from "./types.js";

export async function syncServerRuntimeBridge(
  runtime: OpenRuntimeCore,
  options: BridgeServerSyncOptions
): Promise<BridgeServerRuntimeSyncResponse> {
  const port = options.port ?? OPEN_RUNTIME_BRIDGE_DEFAULT_PORT;
  const response = await fetch(`http://localhost:${port}/server-runtimes`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      runtimeId: options.runtimeId,
      ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
      ...(options.renderId === undefined ? {} : { renderId: options.renderId }),
      url: options.url,
      ...(options.source === undefined ? {} : { source: options.source }),
      targets: runtime.getTargets(),
      snapshot: runtime.getSnapshot(),
      events: runtime.getEvents(),
      actions: runtime.getActions()
    })
  });

  const body = await response.json() as BridgeServerRuntimeSyncResponse | { error?: RuntimeError };
  if (!response.ok) {
    const message = "error" in body && body.error?.message !== undefined
      ? body.error.message
      : `Bridge server runtime sync failed with status ${response.status}.`;
    throw new Error(message);
  }

  return body as BridgeServerRuntimeSyncResponse;
}
