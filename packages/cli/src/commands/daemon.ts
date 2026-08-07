import type { ParsedCliArgs } from "../utils/args.js";
import { getNumberOption } from "../utils/args.js";
import { hasOption } from "../utils/command.js";
import {
  createCommandOutput,
  createError,
  type CommandOutput
} from "../utils/output.js";
import {
  createFileBridgeStateStore,
  killManagedBridge,
  listManagedBridges,
  type BridgeProcessController,
  type KillManagedBridgeResult,
  type ListedManagedBridge
} from "../features/bridge/process.js";
import { resolveDivebellHomeDirectory } from "../utils/home.js";
import { join } from "node:path";

export interface KillResult {
  matched: {
    index: number;
    pid?: number;
    port: number;
    bridgeUrl: string;
  };
  result: KillManagedBridgeResult;
}

export interface KillAllResult {
  count: number;
  items: KillResult[];
}

type KillSelection =
  | { kind: "index"; value: number }
  | { kind: "pid"; value: number }
  | { kind: "port"; value: number };

export async function runPsCommand(options: {
  args: ParsedCliArgs;
  stdout: { write(chunk: string): void };
  stateDirectory?: string;
  processController?: BridgeProcessController;
}): Promise<number> {
  const output = createCommandOutput(options.stdout, "ps");
  const result = await listManagedBridges({
    stateDirectory: options.stateDirectory,
    processController: options.processController
  });
  output.ok(result);
  return 0;
}

export async function runKillCommand(options: {
  args: ParsedCliArgs;
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
  stateDirectory?: string;
  processController?: BridgeProcessController;
}): Promise<number> {
  const output = createCommandOutput(options.stdout, "kill");
  const force = hasOption(options.args, "force");
  const stateDirectory = options.stateDirectory ?? resolveDivebellHomeDirectory();
  const operationLogDirectory = join(stateDirectory, "operations");

  const selection = parseKillSelection(options.args);
  const listResult = await listManagedBridges({
    stateDirectory,
    operationLogDirectory,
    processController: options.processController
  });

  if (listResult.count === 0) {
    throw createError({
      code: "DIVEBELL_DAEMON_NONE_FOUND",
      kind: "not_found",
      message: "No tracked divebell daemon processes were found.",
      hint: "Run `divebell ps` to confirm the daemon list.",
      retryable: false
    });
  }

  const matched = findListItem(listResult.items, selection);
  if (matched === undefined) {
    throw createKillNotFoundError(selection, listResult.items);
  }

  const stateStore = createFileBridgeStateStore(
    matched.bridgeUrl,
    stateDirectory
  );
  const result = await killManagedBridge({
    state: matched,
    stateStore,
    force,
    processController: options.processController
  });

  output.ok({
    matched: {
      index: matched.index,
      pid: matched.pid,
      port: matched.port,
      bridgeUrl: matched.bridgeUrl
    },
    result
  });
  return result.stopped ? 0 : 1;
}

export async function runKillAllCommand(options: {
  args: ParsedCliArgs;
  stdout: { write(chunk: string): void };
  stateDirectory?: string;
  processController?: BridgeProcessController;
}): Promise<number> {
  const output = createCommandOutput(options.stdout, "kill-all");
  const force = hasOption(options.args, "force");
  const stateDirectory = options.stateDirectory ?? resolveDivebellHomeDirectory();

  const listResult = await listManagedBridges({
    stateDirectory,
    processController: options.processController
  });

  const items: KillResult[] = [];
  for (const item of listResult.items) {
    const stateStore = createFileBridgeStateStore(
      item.bridgeUrl,
      stateDirectory
    );
    const result = await killManagedBridge({
      state: item,
      stateStore,
      force,
      processController: options.processController
    });
    items.push({
      matched: {
        index: item.index,
        pid: item.pid,
        port: item.port,
        bridgeUrl: item.bridgeUrl
      },
      result
    });
  }

  const allStopped = items.length === 0
    ? true
    : items.every((item) => item.result.stopped);
  output.ok({ count: items.length, items });
  return allStopped ? 0 : 1;
}

function parseKillSelection(args: ParsedCliArgs): KillSelection {
  const explicitPid = getNumberOption(args, "pid");
  if (explicitPid !== undefined) {
    if (!Number.isInteger(explicitPid) || explicitPid <= 0) {
      throw createError({
        code: "DIVEBELL_KILL_PID_INVALID",
        kind: "validation",
        message: `--pid must be a positive integer, got ${explicitPid}.`,
        retryable: false
      });
    }
    return { kind: "pid", value: explicitPid };
  }

  const explicitPort = getNumberOption(args, "port");
  if (explicitPort !== undefined) {
    if (!Number.isInteger(explicitPort) || explicitPort <= 0 || explicitPort > 65535) {
      throw createError({
        code: "DIVEBELL_KILL_PORT_INVALID",
        kind: "validation",
        message: `--port must be an integer between 1 and 65535, got ${explicitPort}.`,
        retryable: false
      });
    }
    return { kind: "port", value: explicitPort };
  }

  const explicitIndex = getNumberOption(args, "index");
  if (explicitIndex !== undefined) {
    if (!Number.isInteger(explicitIndex) || explicitIndex <= 0) {
      throw createError({
        code: "DIVEBELL_KILL_INDEX_INVALID",
        kind: "validation",
        message: `--index must be a positive integer, got ${explicitIndex}.`,
        retryable: false
      });
    }
    return { kind: "index", value: explicitIndex };
  }

  const token = args.command[1];
  if (token === undefined || token.length === 0) {
    throw createError({
      code: "DIVEBELL_KILL_TARGET_REQUIRED",
      kind: "validation",
      message: "Provide a ps index, PID, or port number to stop.",
      hint: "Usage: `divebell kill <index|pid|port> [--force]` or use --pid, --port, or --index explicitly.",
      retryable: false
    });
  }

  const asNumber = Number(token);
  if (!Number.isFinite(asNumber) || !Number.isInteger(asNumber) || asNumber <= 0) {
    throw createError({
      code: "DIVEBELL_KILL_TARGET_INVALID",
      kind: "validation",
      message: `Kill target "${token}" is not a valid positive integer index, PID, or port number.`,
      hint: "Usage: `divebell kill <index|pid|port> [--force]`.",
      retryable: false
    });
  }

  if (asNumber <= 65535) {
    return { kind: "index", value: asNumber };
  }
  return { kind: "pid", value: asNumber };
}

function findListItem(
  items: readonly ListedManagedBridge[],
  selection: KillSelection
): ListedManagedBridge | undefined {
  switch (selection.kind) {
    case "index":
      return items.find((item) => item.index === selection.value);
    case "pid":
      return items.find((item) => item.pid === selection.value);
    case "port":
      return items.find((item) => item.port === selection.value);
  }
}

function createKillNotFoundError(
  selection: KillSelection,
  items: readonly ListedManagedBridge[]
): never {
  const maxIndex = items.length > 0 ? items[items.length - 1].index : 0;
  const available = items.map((item) => ({
    index: item.index,
    pid: item.pid,
    port: item.port,
    alive: item.alive,
    stale: item.stale
  }));
  const label = describeSelection(selection);
  throw createError({
    code: "DIVEBELL_KILL_TARGET_NOT_FOUND",
    kind: "not_found",
    message: `No tracked divebell daemon matched ${label}.`,
    hint: maxIndex === 0
      ? "Run `divebell ps` to list available daemons."
      : `Run \`divebell ps\` and choose an index between 1 and ${maxIndex}, a PID, or a port number.`,
    retryable: false,
    details: { selection, available }
  });
}

function describeSelection(selection: KillSelection): string {
  switch (selection.kind) {
    case "index":
      return `ps index ${selection.value}`;
    case "pid":
      return `PID ${selection.value}`;
    case "port":
      return `port ${selection.value}`;
  }
}

export { createCommandOutput as _createDaemonCommandOutput };
export type { CommandOutput as _DaemonCommandOutput };
