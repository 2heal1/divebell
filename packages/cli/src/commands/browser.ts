import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getNumberOption, getOptionValue, type ParsedCliArgs } from "../utils/args.js";
import { createBridgeStateStore, createBridgeUrl } from "../features/bridge/config.js";
import { createBridgeInitScript } from "../features/bridge/inject.js";
import {
  createFileBridgeStateStore,
  ensureBridge,
  getBridgePort,
  startDedicatedBridge,
  stopManagedBridge,
  type BridgeStarter
} from "../features/bridge/process.js";
import { isBrowserPageCommand } from "./names.js";
import type { Fetcher } from "../features/runtime/client.js";
import { createCommandOutput, createError } from "../utils/output.js";
import { normalizeOpenRuntimeUrlForMatch, type CliOperationLogStore } from "../utils/operation-log.js";
import { createGetWindowScript, createInteractiveTextClickScript, type BrowserRunOptions, type BrowserRunResult, type BrowserRunner } from "../features/browser/runner.js";
import {
  createOptionalNumberProperty,
  hasOption,
  parseHeadersOption,
  requireCommandArgument,
  writeJson
} from "../utils/command.js";
import { withOpenRuntimeSession } from "../utils/url.js";
import { applyOpenContextDefaultsOrThrow } from "../open-context.js";
import { createExtensionPageContext } from "../open-context.js";
import { createBrowserCommandArgs, getOpenCommandSessionId, normalizeAgentBrowserTarget, shouldPreferInteractiveTextClick } from "../features/browser/command-args.js";
import { runBrowserAndPipe } from "../features/browser/io.js";
import { runConsoleCommand } from "../features/browser/console.js";
import { runNetworkCommand } from "../features/browser/network.js";
import { waitForBrowserEval } from "../features/browser/execution.js";
import { createOpenRuntimeExtensionApi } from "../features/extension/api.js";
import {
  runCloseHooks,
  runOpenHooks,
  type ExtensionHookFailure,
  type ExtensionOpenHookScript
} from "../features/extension/hooks.js";
import type { ExtensionHookPlan } from "../features/extension/plan.js";
import type { OpenRuntimeExtensionDefinition } from "../types/commands.js";
export async function runBrowserCliCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  stderr: { write(chunk: string): void },
  fetcher: Fetcher,
  browserRunner: BrowserRunner,
  bridgeStarter: BridgeStarter,
  bridgeStateDirectory: string | undefined,
  operationLogStore: CliOperationLogStore,
  extensions: readonly OpenRuntimeExtensionDefinition[],
  openHookPlan: ExtensionHookPlan
): Promise<number> {
  const command = args.command[0];
  if (command === "open") {
    const url = requireCommandArgument(args, 1, "URL");
    const sessionId = getOpenCommandSessionId(args);
    const openedUrl = withOpenRuntimeSession(url, sessionId);
    const headers = parseHeadersOption(args);
    const previousOpenContext = await operationLogStore.read();
    const bridge = await prepareOpenBridge(args, fetcher, bridgeStarter, bridgeStateDirectory);
    const bridgeUrl = bridge?.bridgeUrl ?? null;
    const bridgePort = bridge?.port ?? null;
    if (previousOpenContext !== undefined) {
      await runExtensionCloseHooks({
        args: {
          command: ["stop"],
          options: new Map()
        },
        stderr,
        fetcher,
        browserRunner,
        bridgeStarter,
        bridgeStateDirectory,
        operationLogStore,
        extensions,
        openHookPlan
      });
    }
    const hookResult = await runOpenHooks(extensions, {
      args,
      url,
      openedUrl,
      ...(headers === undefined ? {} : { headers })
    }, openHookPlan);
    writeHookFailures(stderr, hookResult.failures);
    let result: BrowserRunResult;
    try {
      result = await openBrowserPage(
        browserRunner,
        args,
        openedUrl,
        bridgeUrl,
        hookResult.scripts,
        {
          ui: hasOption(args, "ui"),
          reuseInitialBlankPage: true,
          ...(hasOption(args, "profile") || hasOption(args, "state")
            ? { disableRestore: true }
            : {})
        }
      );
    } catch (error) {
      await stopOpenContextBridge(bridgeUrl, bridgeStateDirectory);
      throw error;
    }
    if (result.exitCode !== 0) {
      await stopOpenContextBridge(bridgeUrl, bridgeStateDirectory);
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
      bridgePort,
      sessionId,
      openedAt,
      exitCode: result.exitCode,
      activeExtensions: hookResult.activeExtensions,
      ...(headers === undefined ? {} : { headers })
    });
    createCommandOutput(stdout, args.command.join(" ")).ok({
      url,
      openedUrl,
      normalizedUrl,
      bridgeUrl,
      bridgePort,
      sessionId,
      openedAt
    }, "Page opened.");
    if (previousOpenContext?.bridgeUrl !== bridgeUrl) {
      await stopOpenContextBridge(previousOpenContext?.bridgeUrl ?? null, bridgeStateDirectory);
    }
    return 0;
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

export async function runExtensionCloseHooks(options: {
  args: ParsedCliArgs;
  stderr: { write(chunk: string): void };
  fetcher: Fetcher;
  browserRunner: BrowserRunner;
  bridgeStarter: BridgeStarter;
  bridgeStateDirectory: string | undefined;
  operationLogStore: CliOperationLogStore;
  extensions: readonly OpenRuntimeExtensionDefinition[];
  openHookPlan: ExtensionHookPlan;
}): Promise<void> {
  const openContext = await options.operationLogStore.read();
  if (openContext === undefined) return;
  const closeArgs = applyOpenContextDefaultsOrThrow(options.args, openContext, "always");
  const failures = await runCloseHooks(options.extensions, openContext.activeExtensions, {
    args: closeArgs,
    page: createExtensionPageContext(openContext),
    openruntime: createOpenRuntimeExtensionApi({
      args: closeArgs,
      fetcher: options.fetcher,
      browserRunner: options.browserRunner,
      bridgeStarter: options.bridgeStarter,
      bridgeStateStore: createBridgeStateStore(closeArgs, options.bridgeStateDirectory),
      openContext
    })
  }, options.openHookPlan);
  writeHookFailures(options.stderr, failures);
}

async function prepareOpenBridge(
  args: ParsedCliArgs,
  fetcher: Fetcher,
  bridgeStarter: BridgeStarter,
  bridgeStateDirectory: string | undefined
): Promise<{ bridgeUrl: string; port: number | null } | null> {
  if (hasOption(args, "no-bridge")) return null;

  if (hasOption(args, "bridge")) {
    const bridgeUrl = createBridgeUrl(args);
    await ensureBridge({
      fetcher,
      bridgeUrl,
      starter: bridgeStarter,
      stateStore: createFileBridgeStateStore(bridgeUrl, bridgeStateDirectory)
    });
    return {
      bridgeUrl,
      port: getExplicitBridgePort(bridgeUrl)
    };
  }

  const result = await startDedicatedBridge({
    fetcher,
    starter: bridgeStarter,
    ...(bridgeStateDirectory === undefined ? {} : { stateDirectory: bridgeStateDirectory }),
    ...createOptionalNumberProperty("port", getNumberOption(args, "port"))
  });
  return {
    bridgeUrl: result.bridgeUrl,
    port: result.port
  };
}

async function stopOpenContextBridge(
  bridgeUrl: string | null,
  bridgeStateDirectory: string | undefined
): Promise<void> {
  if (bridgeUrl === null) return;
  await stopManagedBridge({
    bridgeUrl,
    stateStore: createFileBridgeStateStore(bridgeUrl, bridgeStateDirectory)
  });
}

function getExplicitBridgePort(bridgeUrl: string): number | null {
  try {
    const url = new URL(bridgeUrl);
    if (url.port.length > 0) return Number(url.port);
    return url.protocol === "https:" ? 443 : url.protocol === "http:" ? 80 : null;
  } catch {
    return getBridgePort(bridgeUrl) ?? null;
  }
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
  bridgeUrl: string | null,
  hookScripts: readonly ExtensionOpenHookScript[],
  options: BrowserRunOptions
): Promise<BrowserRunResult> {
  const cookies = getOptionValue(args, "cookies");
  if (cookies === undefined && bridgeUrl === null && hookScripts.length === 0) {
    return await browserRunner.run(
      createBrowserLaunchArgs(args, createBrowserNavigationArgs(args, "open", openedUrl)),
      options
    );
  }

  if (bridgeUrl !== null || hookScripts.length > 0) {
    const scriptPath = await ensureBrowserInitScript(bridgeUrl, hookScripts);
    if (cookies === undefined) {
      return await browserRunner.run(
        createBrowserLaunchArgs(args, createBrowserNavigationArgs(args, "open", openedUrl, ["--init-script", scriptPath])),
        options
      );
    }

    const launch = await browserRunner.run(createBrowserLaunchArgs(args, ["open", "--init-script", scriptPath]), options);
    if (launch.exitCode !== 0) return launch;
    const applyCookies = await browserRunner.run(["cookies", "set", "--curl", cookies]);
    if (applyCookies.exitCode !== 0) return applyCookies;
    return await browserRunner.run(createBrowserNavigationArgs(args, "goto", openedUrl));
  }

  if (cookies === undefined) {
    return await browserRunner.run(["open", openedUrl], options);
  }
  const launch = await browserRunner.run(createBrowserLaunchArgs(args, ["open"]), options);
  if (launch.exitCode !== 0) return launch;
  const applyCookies = await browserRunner.run(["cookies", "set", "--curl", cookies]);
  if (applyCookies.exitCode !== 0) return applyCookies;
  return await browserRunner.run(createBrowserNavigationArgs(args, "goto", openedUrl));
}

function createBrowserLaunchArgs(args: ParsedCliArgs, command: string[]): string[] {
  const launchArgs: string[] = [];
  appendBrowserOption(launchArgs, args, "profile");
  appendBrowserOption(launchArgs, args, "state");
  return [...launchArgs, ...command];
}

function createBrowserNavigationArgs(
  args: ParsedCliArgs,
  command: "open" | "goto",
  url: string,
  additionalArgs: readonly string[] = []
): string[] {
  const navigationArgs = [command, url, ...additionalArgs];
  appendBrowserOption(navigationArgs, args, "headers");
  return navigationArgs;
}

function appendBrowserOption(browserArgs: string[], args: ParsedCliArgs, name: string): void {
  const value = getOptionValue(args, name);
  if (value !== undefined && value !== "true") {
    browserArgs.push(`--${name}`, value);
  }
}

async function ensureBrowserInitScript(
  bridgeUrl: string | null,
  hookScripts: readonly ExtensionOpenHookScript[]
): Promise<string> {
  const directory = join(tmpdir(), "openruntime-bridge-init");
  const script = [
    ...hookScripts.map(createIsolatedHookScript),
    ...(bridgeUrl === null ? [] : [createBridgeInitScript(bridgeUrl)])
  ].join("\n;\n");
  const key = createHash("sha256").update(script).digest("hex").slice(0, 16);
  const scriptPath = join(directory, `bridge-${key}.js`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(scriptPath, script, { encoding: "utf8", mode: 0o600 });
  return scriptPath;
}

function createIsolatedHookScript(hookScript: ExtensionOpenHookScript): string {
  const message = `OpenRuntime Extension "${hookScript.extension}" open hook script failed.`;
  return `try {
${hookScript.script}
} catch (error) {
  globalThis.console?.error?.(${JSON.stringify(message)}, error);
}`;
}

function writeHookFailures(
  stderr: { write(chunk: string): void },
  failures: readonly ExtensionHookFailure[]
): void {
  for (const failure of failures) {
    stderr.write(`OpenRuntime extension ${failure.extension} ${failure.hook} hook failed: ${failure.message}\n`);
  }
}
