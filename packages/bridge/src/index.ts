import { createPackageInfo } from "@divebell/core";

export const bridgePackageInfo = createPackageInfo("@divebell/bridge", "page bridge");

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
