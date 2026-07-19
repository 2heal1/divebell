import { readFile } from "node:fs/promises";
import { getNumberOption, getOptionValue, type ParsedCliArgs } from "../utils/args.js";
import { createBridgeUrl } from "../features/bridge/config.js";
import { createFileBridgeStateStore, ensureBridge, type BridgeStarter } from "../features/bridge/process.js";
import { isBrowserPageCommand } from "./names.js";
import type { Fetcher } from "../features/runtime/client.js";
import { createCommandOutput, createError } from "../utils/output.js";
import { normalizeOpenRuntimeUrlForMatch, type CliOperationLogStore } from "../utils/operation-log.js";
import { createGetWindowScript, createInteractiveTextClickScript, type BrowserRunOptions, type BrowserRunResult, type BrowserRunner } from "../features/browser/runner.js";
import { createOptionalNumberProperty, hasOption, requireCommandArgument, writeJson } from "../utils/command.js";
import { withOpenRuntimeSession } from "../utils/url.js";
import { applyOpenContextDefaultsOrThrow } from "../open-context.js";
import { createBrowserCommandArgs, getOpenCommandSessionId, normalizeAgentBrowserTarget, shouldPreferInteractiveTextClick } from "../features/browser/command-args.js";
import { runBrowserAndPipe } from "../features/browser/io.js";
import { runConsoleCommand } from "../features/browser/console.js";
import { runNetworkCommand } from "../features/browser/network.js";
import { waitForBrowserEval } from "../features/browser/execution.js";
export async function runBrowserCliCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  stderr: { write(chunk: string): void },
  fetcher: Fetcher,
  browserRunner: BrowserRunner,
  bridgeStarter: BridgeStarter,
  bridgeStateStore: ReturnType<typeof createFileBridgeStateStore>,
  operationLogStore: CliOperationLogStore
): Promise<number> {
  const command = args.command[0];
  if (command === "open") {
    const url = requireCommandArgument(args, 1, "URL");
    const sessionId = getOpenCommandSessionId(args);
    const openedUrl = withOpenRuntimeSession(url, sessionId);
    const bridgeUrl = hasOption(args, "no-bridge") ? null : createBridgeUrl(args);
    await operationLogStore.remove();
    if (!hasOption(args, "no-bridge")) {
      await ensureBridge({
        fetcher,
        bridgeUrl: createBridgeUrl(args),
        starter: bridgeStarter,
        stateStore: bridgeStateStore,
        ...createOptionalNumberProperty("port", getNumberOption(args, "port"))
      });
    }
    const result = await openBrowserPage(browserRunner, args, openedUrl, { ui: hasOption(args, "ui") });
    if (result.exitCode !== 0) {
      throw createError({
        code: "PAGE_OPEN_FAILED",
        kind: "browser",
        message: result.stderr.trim() || result.stdout.trim() || "Could not open the page.",
        details: {
          url,
          openedUrl,
          ...(result.stdout.trim().length === 0 ? {} : { stdout: result.stdout.trim() }),
          ...(result.stderr.trim().length === 0 ? {} : { stderr: result.stderr.trim() })
        }
      });
    }

    const openedAt = Date.now();
    const normalizedUrl = normalizeOpenRuntimeUrlForMatch(openedUrl);
    await operationLogStore.write({
      command: "open",
      url,
      normalizedUrl,
      bridgeUrl,
      sessionId,
      openedAt,
      exitCode: result.exitCode
    });
    createCommandOutput(stdout, args.command.join(" ")).ok({
      url,
      openedUrl,
      normalizedUrl,
      bridgeUrl,
      sessionId,
      openedAt
    }, "Page opened.");
    return 0;
  }

  if (command === "close") {
    const exitCode = await runBrowserAndPipe(browserRunner, createBrowserCommandArgs(args), stdout, stderr);
    await operationLogStore.remove();
    return exitCode;
  }

  const commandArgs = isBrowserPageCommand(command)
    ? applyOpenContextDefaultsOrThrow(args, await operationLogStore.read(), "always")
    : args;

  if (command === "get-window") {
    const path = requireCommandArgument(commandArgs, 1, "window path");
    return await runBrowserAndPipe(browserRunner, ["eval", createGetWindowScript(path)], stdout, stderr);
  }

  if (command === "click") {
    return await runClickCommand(commandArgs, stdout, stderr, browserRunner);
  }

  if (command === "wait-eval") {
    const script = requireCommandArgument(commandArgs, 1, "eval script");
    const result = await waitForBrowserEval(browserRunner, script, getNumberOption(commandArgs, "timeout"));
    writeJson(stdout, result);
    return 0;
  }

  if (command === "network") {
    return await runNetworkCommand(commandArgs, stdout, stderr, browserRunner);
  }

  if (command === "console") {
    return await runConsoleCommand(commandArgs, stdout, stderr, browserRunner);
  }

  if (command === "eval") {
    const file = getOptionValue(commandArgs, "file");
    if (file !== undefined) {
      return await runBrowserAndPipe(browserRunner, ["eval", await readFile(file, "utf8")], stdout, stderr);
    }
  }

  return await runBrowserAndPipe(browserRunner, createBrowserCommandArgs(commandArgs), stdout, stderr);
}

async function runClickCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  stderr: { write(chunk: string): void },
  browserRunner: BrowserRunner
): Promise<number> {
  const target = requireCommandArgument(args, 1, "ref, selector, or text");
  if (!shouldPreferInteractiveTextClick(target)) {
    return await runBrowserAndPipe(browserRunner, ["click", normalizeAgentBrowserTarget(target)], stdout, stderr);
  }

  const result = await browserRunner.run(["eval", createInteractiveTextClickScript(target)]);
  if (result.exitCode === 0) {
    stdout.write("clicked\n");
    return 0;
  }

  if (result.stdout.length > 0) {
    stdout.write(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
  }
  if (result.stderr.length > 0) {
    stderr.write(result.stderr.endsWith("\n") ? result.stderr : `${result.stderr}\n`);
  }
  return result.exitCode;
}


async function openBrowserPage(
  browserRunner: BrowserRunner,
  args: ParsedCliArgs,
  openedUrl: string,
  options: BrowserRunOptions
): Promise<BrowserRunResult> {
  const cookies = getOptionValue(args, "cookies");
  if (cookies === undefined) {
    return await browserRunner.run(["open", openedUrl], options);
  }

  const launch = await browserRunner.run(["open"], options);
  if (launch.exitCode !== 0) return launch;
  const applyCookies = await browserRunner.run(["cookies", "set", "--curl", cookies]);
  if (applyCookies.exitCode !== 0) return applyCookies;
  return await browserRunner.run(["goto", openedUrl]);
}
