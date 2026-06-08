import { createPackageInfo } from "@openruntime/core";

export const bridgePackageInfo = createPackageInfo("@openruntime/bridge", "page bridge");

export { createBridgeServer } from "./server.js";
export type {
  BridgeErrorBody,
  BridgeListenOptions,
  BridgeRuntimeInfo,
  BridgeRuntimeStatus,
  BridgeServer,
  BridgeServerAddress,
  CreateBridgeServerOptions
} from "./types.js";
