import { once } from "node:events";
import { createBridgeServer, type BridgeServer } from "@openruntime/bridge";
import { OPEN_RUNTIME_BRIDGE_DEFAULT_PORT } from "@openruntime/core";
import { getNumberOption, type ParsedCliArgs } from "../utils/args.js";
import type { BrowserRunner } from "../features/browser/runner.js";
import {
  ensureBridge,
  stopManagedBridge,
  type BridgeProcessController,
  type BridgeStarter,
  type BridgeStateStore
} from "../features/bridge/process.js";
import type { Fetcher } from "../features/runtime/client.js";
import type { CliOperationLogStore } from "../utils/operation-log.js";
import {
  createOptionalNumberProperty,
  createOptionalObjectProperty,
  writeJson
} from "../utils/command.js";
import { createBridgeUrl } from "../features/bridge/config.js";

export async function runStartCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  fetcher: Fetcher,
  bridgeStarter: BridgeStarter,
  bridgeStateStore: BridgeStateStore
): Promise<number> {
  const result = await ensureBridge({
    fetcher,
    bridgeUrl: createBridgeUrl(args),
    starter: bridgeStarter,
    stateStore: bridgeStateStore,
    ...createOptionalNumberProperty("port", getNumberOption(args, "port"))
  });
  writeJson(stdout, result);
  return 0;
}

export async function runStopCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  browserRunner: BrowserRunner,
  bridgeStateStore: BridgeStateStore,
  operationLogStore: CliOperationLogStore,
  bridgeProcessController: BridgeProcessController | undefined,
  beforeBrowserClose?: () => Promise<void>
): Promise<number> {
  await beforeBrowserClose?.();
  const closeResult = await browserRunner.run(["close"]);
  await operationLogStore.remove();
  const bridgeResult = await stopManagedBridge({
    bridgeUrl: createBridgeUrl(args),
    stateStore: bridgeStateStore,
    ...createOptionalObjectProperty("processController", bridgeProcessController)
  });
  writeJson(stdout, {
    browser: { command: "close", exitCode: closeResult.exitCode },
    bridge: bridgeResult
  });
  return 0;
}

export async function runBridgeServerCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  waitUntilClosed: ((server: BridgeServer) => Promise<void>) | undefined
): Promise<number> {
  const server = createBridgeServer();
  const address = await server.listen({
    port: getNumberOption(args, "port") ?? OPEN_RUNTIME_BRIDGE_DEFAULT_PORT
  });
  stdout.write(`OpenRuntime Bridge listening on ${address.url}\n`);
  if (waitUntilClosed !== undefined) await waitUntilClosed(server);
  else await waitForProcessExit(server);
  return 0;
}

async function waitForProcessExit(server: BridgeServer): Promise<void> {
  const close = async () => await server.close();
  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
  await once(process, "beforeExit");
}
