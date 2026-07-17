import { getNumberOption, getOptionValue, type ParsedCliArgs } from "../../utils/args.js";
import { createFileBridgeStateStore } from "./process.js";
import { normalizeBridgeUrl } from "../runtime/client.js";

export function createBridgeUrl(args: ParsedCliArgs): string {
  const bridge = getOptionValue(args, "bridge");
  if (bridge !== undefined) return normalizeBridgeUrl(bridge);
  const port = getNumberOption(args, "port");
  if (port !== undefined) return `http://localhost:${port}`;
  return normalizeBridgeUrl(undefined);
}

export function createBridgeStateStore(
  args: ParsedCliArgs,
  stateDirectory: string | undefined
): ReturnType<typeof createFileBridgeStateStore> {
  return createFileBridgeStateStore(createBridgeUrl(args), stateDirectory);
}
