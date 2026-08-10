import { once } from "node:events";
import { createBridgeServer, type BridgeServer } from "@divebell/bridge";
import { DIVEBELL_BRIDGE_DEFAULT_PORT } from "@divebell/core";
import { getNumberOption, type ParsedCliArgs } from "../utils/args.js";
import type { BrowserRunner } from "../features/browser/runner.js";
import {
  createFileBridgeStateStore,
  ensureBridge,
  stopManagedBridge,
  type BridgeProcessController,
  type BridgeStarter,
  type BridgeStateStore,
  type StopBridgeResult
} from "../features/bridge/process.js";
import type { Fetcher } from "../features/runtime/client.js";
import type { CliOperationLogStore } from "../utils/operation-log.js";
import {
  createOptionalNumberProperty,
  createOptionalObjectProperty,
  writeJson
} from "../utils/command.js";
import { createBridgeUrl } from "../features/bridge/config.js";
import { applyOpenContextBrowserMode, applyOpenContextDefaults, createBrowserCloseArgs } from "../open-context.js";

export interface StopResult {
  browser: {
    command: "stop";
    exitCode: number;
  };
  bridge:
    | {
        bridgeUrl: null;
        stopped: false;
        reason: string;
      }
    | StopBridgeResult;
}

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
  bridgeStateDirectory: string | undefined,
  operationLogStore: CliOperationLogStore,
  bridgeProcessController: BridgeProcessController | undefined,
  beforeBrowserClose?: () => Promise<void>
): Promise<number> {
  const openContext = await operationLogStore.read();
  const commandArgs = applyOpenContextDefaults(args, openContext);
  await beforeBrowserClose?.();
  const browserStopResult = await applyOpenContextBrowserMode(browserRunner, openContext).run(
    createBrowserCloseArgs(commandArgs)
  );
  await operationLogStore.remove();
  const bridgeUrl = openContext?.bridgeUrl === null &&
      !commandArgs.options.has("bridge") &&
      !commandArgs.options.has("port")
    ? null
    : createBridgeUrl(commandArgs);
  const bridgeResult: StopResult["bridge"] = bridgeUrl === null
    ? {
        bridgeUrl: null,
        stopped: false,
        reason: "The opened page does not use a Bridge."
      }
    : await stopManagedBridge({
        bridgeUrl,
        stateStore: createFileBridgeStateStore(bridgeUrl, bridgeStateDirectory),
        ...createOptionalObjectProperty("processController", bridgeProcessController)
      });
  const result: StopResult = {
    browser: { command: "stop", exitCode: browserStopResult.exitCode },
    bridge: bridgeResult
  };
  writeJson(stdout, result);
  return 0;
}

export async function runBridgeServerCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  waitUntilClosed: ((server: BridgeServer) => Promise<void>) | undefined
): Promise<number> {
  const server = createBridgeServer();
  const address = await server.listen({
    port: getNumberOption(args, "port") ?? DIVEBELL_BRIDGE_DEFAULT_PORT
  });
  if (typeof process.send === "function") {
    process.send({
      type: "divebell.bridge.ready",
      port: address.port,
      url: address.url
    });
  } else {
    stdout.write(`Divebell Bridge listening on ${address.url}\n`);
  }
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
