import { getNumberOption, getOptionValue, type ParsedCliArgs } from "../../utils/args.js";
import {
  canAutoStartBridge,
  ensureBridge,
  type BridgeStarter,
  type BridgeStateStore
} from "../bridge/process.js";
import type { Fetcher, RuntimeSelector } from "./client.js";
import { createBridgeUrl } from "../bridge/config.js";
import { createOptionalNumberProperty } from "../../utils/command.js";
import { withOpenRuntimeSession } from "../../utils/url.js";

export function createRuntimeSelector(
  args: ParsedCliArgs,
  options: { ignoreRuntimeId?: boolean } = {}
): RuntimeSelector {
  const selector: RuntimeSelector = {};
  const runtimeId = getOptionValue(args, "runtime");
  const sessionId = getOptionValue(args, "session");
  const url = getOptionValue(args, "url");
  if (runtimeId !== undefined && options.ignoreRuntimeId !== true) selector.runtimeId = runtimeId;
  if (sessionId !== undefined) selector.sessionId = sessionId;
  if (url !== undefined) selector.url = withOpenRuntimeSession(url, sessionId);
  return selector;
}

export async function ensureLocalBridgeForRuntimeCommand(
  args: ParsedCliArgs,
  fetcher: Fetcher,
  bridgeStarter: BridgeStarter,
  bridgeStateStore: BridgeStateStore
): Promise<string> {
  const bridgeUrl = createBridgeUrl(args);
  if (!canAutoStartBridge(bridgeUrl)) return bridgeUrl;

  await ensureBridge({
    fetcher,
    bridgeUrl,
    starter: bridgeStarter,
    stateStore: bridgeStateStore,
    ...createOptionalNumberProperty("port", getNumberOption(args, "port"))
  });
  return bridgeUrl;
}
