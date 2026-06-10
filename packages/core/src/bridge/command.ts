import type { GetActionsQuery } from "../action/types.js";
import type { GetEventsQuery } from "../event/types.js";
import type { GetSnapshotQuery } from "../snapshot/types.js";
import type { GetTargetsQuery } from "../target/types.js";
import type { OpenRuntimeCore } from "../runtime/types.js";
import type { BridgeRuntimeRequest } from "./types.js";

export async function executeBridgeRuntimeRequest(
  runtime: OpenRuntimeCore,
  request: BridgeRuntimeRequest
): Promise<unknown> {
  switch (request.method) {
    case "getTargets":
      return runtime.getTargets(request.query as GetTargetsQuery | undefined);
    case "getSnapshot":
      return runtime.getSnapshot(request.query as GetSnapshotQuery | undefined);
    case "getEvents":
      return runtime.getEvents(request.query as GetEventsQuery | undefined);
    case "getActions":
      return runtime.getActions(request.query as GetActionsQuery | undefined);
    case "getInputOptions":
      return runtime.getInputOptions(
        requireString(request.actionName, "actionName"),
        requireString(request.inputName, "inputName"),
        request.payload,
        request.options
      );
    case "runAction":
      return runtime.runAction(requireString(request.actionName, "actionName"), request.payload);
    case "waitFor":
      return runtime.waitFor({
        id: requireString(request.targetId, "targetId"),
        status: requireString(request.status, "status"),
        ...(request.where === undefined ? {} : { where: request.where })
      }, request.options);
  }
}

function requireString(value: string | undefined, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Bridge request is missing "${field}".`);
  }
  return value;
}
