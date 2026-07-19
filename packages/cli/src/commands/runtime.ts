import { getNumberOption } from "../utils/args.js";
import { createBridgeStateStore } from "../features/bridge/config.js";
import {
  fetchInputOptions,
  fetchRuntimeResource,
  fetchRuntimes,
  runRuntimeAction,
  selectRuntime
} from "../features/runtime/client.js";
import { isRuntimeResourceCommand } from "./names.js";
import {
  parsePayloadOption,
  parseWhereOptions,
  requireCommandArgument,
  requireOption,
  writeJson
} from "../utils/command.js";
import { applyOpenContextDefaultsOrThrow } from "../open-context.js";
import type { RuntimeCliCommandOptions } from "../types/cli.js";
import { createQuery } from "../features/runtime/query.js";
import {
  createRuntimeSelector,
  ensureLocalBridgeForRuntimeCommand
} from "../features/runtime/selector.js";
import {
  createWaitForFailure,
  isFailedWaitResult,
  waitForRuntimeCommand
} from "../features/runtime/wait.js";

export async function runRuntimeCliCommand(options: RuntimeCliCommandOptions): Promise<number | undefined> {
  const {
    args,
    stdout,
    stderr,
    fetcher,
    browserRunner,
    bridgeStarter,
    bridgeStateDirectory,
    operationLogStore
  } = options;

  if (args.command[0] === "runtimes") {
    const bridgeUrl = await ensureLocalBridgeForRuntimeCommand(
      args,
      fetcher,
      bridgeStarter,
      createBridgeStateStore(args, bridgeStateDirectory)
    );
    const runtimes = await fetchRuntimes(fetcher, bridgeUrl);
    writeJson(stdout, { bridgeUrl, runtimes });
    return 0;
  }

  if (isRuntimeResourceCommand(args.command[0])) {
    const resourceCommand = args.command[0];
    const commandArgs = applyOpenContextDefaultsOrThrow(
      args,
      await operationLogStore.read(),
      "unless-selector"
    );
    const bridgeUrl = await ensureLocalBridgeForRuntimeCommand(
      commandArgs,
      fetcher,
      bridgeStarter,
      createBridgeStateStore(commandArgs, bridgeStateDirectory)
    );
    const runtimes = await fetchRuntimes(fetcher, bridgeUrl);
    const runtime = selectRuntime(runtimes, createRuntimeSelector(commandArgs));
    const result = await fetchRuntimeResource(
      fetcher,
      bridgeUrl,
      runtime,
      resourceCommand,
      createQuery(commandArgs, resourceCommand)
    );
    writeJson(stdout, result);
    return 0;
  }

  if (args.command[0] === "input-options") {
    const actionName = requireOption(args, "action");
    const inputName = requireOption(args, "input");
    const payload = parsePayloadOption(args);
    const commandArgs = applyOpenContextDefaultsOrThrow(
      args,
      await operationLogStore.read(),
      "unless-selector"
    );
    const bridgeUrl = await ensureLocalBridgeForRuntimeCommand(
      commandArgs,
      fetcher,
      bridgeStarter,
      createBridgeStateStore(commandArgs, bridgeStateDirectory)
    );
    const runtimes = await fetchRuntimes(fetcher, bridgeUrl);
    const runtime = selectRuntime(runtimes, createRuntimeSelector(commandArgs));
    const result = await fetchInputOptions(
      fetcher,
      bridgeUrl,
      runtime,
      actionName,
      inputName,
      payload,
      getNumberOption(args, "timeout")
    );
    writeJson(stdout, result);
    return 0;
  }

  if (args.command[0] === "run-action") {
    const actionName = requireCommandArgument(args, 1, "action name");
    const payload = parsePayloadOption(args);
    const commandArgs = applyOpenContextDefaultsOrThrow(
      args,
      await operationLogStore.read(),
      "unless-selector"
    );
    const bridgeUrl = await ensureLocalBridgeForRuntimeCommand(
      commandArgs,
      fetcher,
      bridgeStarter,
      createBridgeStateStore(commandArgs, bridgeStateDirectory)
    );
    const runtimes = await fetchRuntimes(fetcher, bridgeUrl);
    const runtime = selectRuntime(runtimes, createRuntimeSelector(commandArgs));
    const result = await runRuntimeAction(fetcher, bridgeUrl, runtime, actionName, payload);
    writeJson(stdout, result);
    return 0;
  }

  if (args.command[0] === "wait-for") {
    const targetId = requireCommandArgument(args, 1, "target id");
    const status = requireCommandArgument(args, 2, "status");
    const commandArgs = applyOpenContextDefaultsOrThrow(
      args,
      await operationLogStore.read(),
      "unless-selector"
    );
    const bridgeUrl = await ensureLocalBridgeForRuntimeCommand(
      commandArgs,
      fetcher,
      bridgeStarter,
      createBridgeStateStore(commandArgs, bridgeStateDirectory)
    );
    const where = parseWhereOptions(commandArgs);
    try {
      const result = await waitForRuntimeCommand(
        commandArgs,
        fetcher,
        bridgeUrl,
        browserRunner,
        bridgeStarter,
        createBridgeStateStore(commandArgs, bridgeStateDirectory),
        targetId,
        status,
        where
      );
      writeJson(stdout, result);
      return isFailedWaitResult(result.result) ? 1 : 0;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      writeJson(stdout, createWaitForFailure(targetId, status, where, reason));
      stderr.write(`${reason}\n`);
      return 1;
    }
  }

  return undefined;
}
