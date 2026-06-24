#!/usr/bin/env node
import { once } from "node:events";
import { createBridgeServer, type BridgeRuntimeInfo, type BridgeServer } from "@openruntime/bridge";
import {
  createPackageInfo,
  OPEN_RUNTIME_BRIDGE_DEFAULT_PORT,
  OPEN_RUNTIME_SESSION_QUERY_PARAM,
  type RuntimeDataCondition
} from "@openruntime/core";
import { getNumberOption, getOptionValue, getOptionValues, parseCliArgs, type ParsedCliArgs } from "./args.js";
import {
  createConsoleLogScript,
  createGetWindowScript,
  createInteractiveTextClickScript,
  createNextBrowserRunner,
  createWaitEvalScript,
  parseBrowserJsonOutput,
  type BrowserRunOptions,
  type BrowserRunner
} from "./browser.js";
import {
  createFileBridgeStateStore,
  createDetachedBridgeStarter,
  ensureBridge,
  stopManagedBridge,
  waitForSelectedRuntime,
  type BridgeProcessController,
  type BridgeStarter
} from "./bridge-process.js";
import {
  fetchInputOptions,
  fetchRuntimeResource,
  fetchRuntimes,
  normalizeBridgeUrl,
  runRuntimeAction,
  selectRuntime,
  waitForRuntime,
  type Fetcher,
  type RuntimeResourceResult,
  type RuntimeSelector
} from "./client.js";
import { isEntryPoint } from "./entry.js";
import { runVmokCommand } from "./extensions/vmok/index.js";
import { createHelpText } from "./help.js";
import {
  exportAuthProfile,
  exportFullProfile,
  getProfileDirectory,
  importProfile,
  readProfileInput,
  readProfileInputFile
} from "./profile.js";

export const cliPackageInfo = createPackageInfo("@openruntime/cli", "agent command line");

export function getCliCommandName(): "open-runtime" {
  return "open-runtime";
}

export interface CliRunOptions {
  stdout?: {
    write(chunk: string): void;
  };
  stderr?: {
    write(chunk: string): void;
  };
  fetcher?: Fetcher;
  browserRunner?: BrowserRunner;
  bridgeStarter?: BridgeStarter;
  bridgeProcessController?: BridgeProcessController;
  bridgeStateDirectory?: string;
  waitUntilClosed?: (server: BridgeServer) => Promise<void>;
}

export async function runCli(argv = process.argv.slice(2), options: CliRunOptions = {}): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const fetcher = options.fetcher ?? fetch;
  const browserRunner = options.browserRunner ?? createNextBrowserRunner();
  const bridgeStarter = options.bridgeStarter ?? createDetachedBridgeStarter(import.meta.url);
  const args = parseCliArgs(argv);

  try {
    if (args.command.length === 0 || hasOption(args, "help")) {
      stdout.write(`${createHelpText()}\n`);
      return 0;
    }

    if (args.command[0] === "__bridge-server") {
      return await runBridgeServerCommand(args, stdout, options.waitUntilClosed);
    }

    if (args.command[0] === "start") {
      return await runStartCommand(args, stdout, fetcher, bridgeStarter, createBridgeStateStore(args, options.bridgeStateDirectory));
    }

    if (args.command[0] === "stop") {
      return await runStopCommand(args, stdout, browserRunner, createBridgeStateStore(args, options.bridgeStateDirectory), options.bridgeProcessController);
    }

    if (args.command[0] === "export-profile" || args.command[0] === "export-file") {
      return await runExportProfileCommand(args, stdout, browserRunner);
    }

    if (args.command[0] === "import-profile" || args.command[0] === "import-file") {
      return await runImportProfileCommand(args, stdout, browserRunner);
    }

    if (isBrowserCommand(args.command[0])) {
      return await runBrowserCliCommand(args, stdout, stderr, fetcher, browserRunner, bridgeStarter, createBridgeStateStore(args, options.bridgeStateDirectory));
    }

    if (args.command[0] === "runtimes") {
      const bridgeUrl = createBridgeUrl(args);
      const runtimes = await fetchRuntimes(fetcher, bridgeUrl);
      writeJson(stdout, {
        bridgeUrl,
        runtimes
      });
      return 0;
    }

    if (isRuntimeResourceCommand(args.command[0])) {
      const bridgeUrl = createBridgeUrl(args);
      const runtimes = await fetchRuntimes(fetcher, bridgeUrl);
      const runtime = selectRuntime(runtimes, createRuntimeSelector(args));
      const result = await fetchRuntimeResource(fetcher, bridgeUrl, runtime, args.command[0], createQuery(args, args.command[0]));
      writeJson(stdout, result);
      return 0;
    }

    if (args.command[0] === "input-options") {
      const actionName = requireOption(args, "action");
      const inputName = requireOption(args, "input");
      const payload = parsePayloadOption(args);
      const bridgeUrl = createBridgeUrl(args);
      const runtimes = await fetchRuntimes(fetcher, bridgeUrl);
      const runtime = selectRuntime(runtimes, createRuntimeSelector(args));
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
      const bridgeUrl = createBridgeUrl(args);
      const runtimes = await fetchRuntimes(fetcher, bridgeUrl);
      const runtime = selectRuntime(runtimes, createRuntimeSelector(args));
      const result = await runRuntimeAction(
        fetcher,
        bridgeUrl,
        runtime,
        actionName,
        payload
      );
      writeJson(stdout, result);
      return 0;
    }

    if (args.command[0] === "wait-for") {
      const targetId = requireCommandArgument(args, 1, "target id");
      const status = requireCommandArgument(args, 2, "status");
      const bridgeUrl = createBridgeUrl(args);
      const where = parseWhereOptions(args);
      try {
        const result = await waitForRuntimeCommand(
          args,
          fetcher,
          bridgeUrl,
          browserRunner,
          bridgeStarter,
          createBridgeStateStore(args, options.bridgeStateDirectory),
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

    if (args.command[0] === "vmok") {
      return await runVmokCommand({
        args,
        stdout,
        browserRunner,
        fetcher,
        bridgeUrl: createBridgeUrl(args),
        runtimeSelector: createRuntimeSelector(args)
      });
    }

    throw new Error(createUnknownCommandError(args.command[0]));
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function createUnknownCommandError(command: string | undefined): string {
  if (command === undefined || command.length === 0) {
    return "Unknown command.";
  }

  return `Unknown command "${command}".`;
}

function createRuntimeSelector(args: ParsedCliArgs, options: { ignoreRuntimeId?: boolean } = {}): RuntimeSelector {
  const selector: RuntimeSelector = {};
  const runtimeId = getOptionValue(args, "runtime");
  const sessionId = getOptionValue(args, "session");
  const url = getOptionValue(args, "url");
  if (runtimeId !== undefined && options.ignoreRuntimeId !== true) selector.runtimeId = runtimeId;
  if (sessionId !== undefined) selector.sessionId = sessionId;
  if (url !== undefined) selector.url = withOpenRuntimeSession(url, sessionId);
  return selector;
}

function requireOption(args: ParsedCliArgs, name: string): string {
  const value = getOptionValue(args, name);
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required option "--${name}".`);
  }
  return value;
}

function requireCommandArgument(args: ParsedCliArgs, index: number, label: string): string {
  const value = args.command[index];
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required ${label}.`);
  }
  return value;
}

function parsePayloadOption(args: ParsedCliArgs): Record<string, unknown> | undefined {
  const payload = getOptionValue(args, "payload");
  if (payload === undefined) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error("--payload must be valid JSON.");
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--payload must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

function parseWhereOptions(args: ParsedCliArgs): RuntimeDataCondition[] | undefined {
  const values = getOptionValues(args, "where");
  if (values.length === 0) return undefined;

  return values.map((value) => {
    const equalsIndex = value.indexOf("=");
    if (equalsIndex <= 0) {
      throw new Error("--where must use the form path=value.");
    }

    const path = value.slice(0, equalsIndex).trim();
    if (path.length === 0) {
      throw new Error("--where path must not be empty.");
    }

    return {
      path,
      equals: parseWhereValue(value.slice(equalsIndex + 1))
    };
  });
}

function parseWhereValue(rawValue: string): unknown {
  const value = rawValue.trim();
  if (value.length === 0) return "";

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function createWaitForFailure(
  targetId: string,
  status: string,
  where: RuntimeDataCondition[] | undefined,
  reason: string
): {
  result: {
    success: false;
    condition: {
      id: string;
      status: string;
      where?: RuntimeDataCondition[];
    };
    reason: string;
  };
} {
  const condition: { id: string; status: string; where?: RuntimeDataCondition[] } = {
    id: targetId,
    status
  };
  if (where !== undefined) {
    condition.where = where;
  }

  return {
    result: {
      success: false,
      condition,
      reason
    }
  };
}

async function runBrowserCliCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  stderr: { write(chunk: string): void },
  fetcher: Fetcher,
  browserRunner: BrowserRunner,
  bridgeStarter: BridgeStarter,
  bridgeStateStore: ReturnType<typeof createFileBridgeStateStore>
): Promise<number> {
  const command = args.command[0];
  if (command === "open") {
    const url = requireCommandArgument(args, 1, "URL");
    if (!hasOption(args, "no-bridge")) {
      await ensureBridge({
        fetcher,
        bridgeUrl: createBridgeUrl(args),
        starter: bridgeStarter,
        stateStore: bridgeStateStore,
        ...createOptionalNumberProperty("port", getNumberOption(args, "port"))
      });
    }
    return await runBrowserAndPipe(
      browserRunner,
      createOpenBrowserArgs(args, url),
      stdout,
      stderr,
      { ui: hasOption(args, "ui") }
    );
  }

  if (command === "get-window") {
    const path = requireCommandArgument(args, 1, "window path");
    return await runBrowserAndPipe(browserRunner, ["eval", createGetWindowScript(path)], stdout, stderr);
  }

  if (command === "click") {
    return await runClickCommand(args, stdout, stderr, browserRunner);
  }

  if (command === "wait-eval") {
    const script = requireCommandArgument(args, 1, "eval script");
    const result = await waitForBrowserEval(browserRunner, script, getNumberOption(args, "timeout"));
    writeJson(stdout, result);
    return 0;
  }

  if (command === "network") {
    return await runNetworkCommand(args, stdout, stderr, browserRunner);
  }

  if (command === "console") {
    return await runConsoleCommand(args, stdout, stderr, browserRunner);
  }

  return await runBrowserAndPipe(browserRunner, createBrowserCommandArgs(args), stdout, stderr);
}

async function runClickCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  stderr: { write(chunk: string): void },
  browserRunner: BrowserRunner
): Promise<number> {
  const target = requireCommandArgument(args, 1, "ref, selector, or text");
  if (!shouldPreferInteractiveTextClick(target)) {
    return await runBrowserAndPipe(browserRunner, ["click", target], stdout, stderr);
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

async function waitForRuntimeCommand(
  args: ParsedCliArgs,
  fetcher: Fetcher,
  bridgeUrl: string,
  browserRunner: BrowserRunner,
  bridgeStarter: BridgeStarter,
  bridgeStateStore: ReturnType<typeof createFileBridgeStateStore>,
  targetId: string,
  status: string,
  where: RuntimeDataCondition[] | undefined
): Promise<RuntimeResourceResult<unknown>> {
  if (hasOption(args, "next") && hasOption(args, "strict")) {
    throw new Error("--next cannot be used with --strict.");
  }

  if (hasOption(args, "strict")) {
    const runtime = await selectRuntimeForWait(args, fetcher, bridgeUrl, browserRunner, bridgeStarter, bridgeStateStore);
    return await waitForRuntime(
      fetcher,
      bridgeUrl,
      runtime,
      targetId,
      status,
      getNumberOption(args, "timeout"),
      where
    );
  }

  return await waitForLatestRuntime(args, fetcher, bridgeUrl, browserRunner, bridgeStarter, bridgeStateStore, targetId, status, where);
}

async function selectRuntimeForWait(
  args: ParsedCliArgs,
  fetcher: Fetcher,
  bridgeUrl: string,
  browserRunner: BrowserRunner,
  bridgeStarter: BridgeStarter,
  bridgeStateStore: ReturnType<typeof createFileBridgeStateStore>
) {
  const selector = createRuntimeSelector(args);
  try {
    const runtimes = await fetchRuntimes(fetcher, bridgeUrl);
    return selectRuntime(runtimes, selector);
  } catch (error) {
    if (!hasOption(args, "open")) {
      throw addOpenHint(error, selector);
    }

    const url = requireOption(args, "url");
    await ensureBridge({
      fetcher,
      bridgeUrl,
      starter: bridgeStarter,
      stateStore: bridgeStateStore,
      ...createOptionalNumberProperty("port", getNumberOption(args, "port"))
    });
    await runBrowserOrThrow(browserRunner, ["open", withOpenRuntimeSession(url, selector.sessionId)]);
    return await waitForSelectedRuntime({
      fetcher,
      bridgeUrl,
      selector,
      ...createOptionalNumberProperty("timeout", getNumberOption(args, "timeout"))
    });
  }
}

async function waitForLatestRuntime(
  args: ParsedCliArgs,
  fetcher: Fetcher,
  bridgeUrl: string,
  browserRunner: BrowserRunner,
  bridgeStarter: BridgeStarter,
  bridgeStateStore: ReturnType<typeof createFileBridgeStateStore>,
  targetId: string,
  status: string,
  where: RuntimeDataCondition[] | undefined
): Promise<RuntimeResourceResult<unknown>> {
  const selector = createRuntimeSelector(args, { ignoreRuntimeId: true });
  const timeout = getNumberOption(args, "timeout") ?? 5000;
  const deadline = Date.now() + timeout;
  const ignoredRuntimeIds = hasOption(args, "next")
    ? await collectConnectedRuntimeIds(fetcher, bridgeUrl, selector)
    : new Set<string>();
  let lastError: unknown;
  let lastResult: RuntimeResourceResult<unknown> | undefined;
  let didOpen = false;

  while (Date.now() <= deadline) {
    const remainingTimeout = Math.max(1, deadline - Date.now());
    try {
      const runtimes = await fetchRuntimes(fetcher, bridgeUrl);
      const runtime = selectRuntime(
        ignoredRuntimeIds.size === 0
          ? runtimes
          : runtimes.filter((item) => !ignoredRuntimeIds.has(item.runtimeId)),
        selector
      );
      const result = await waitForRuntime(
        fetcher,
        bridgeUrl,
        runtime,
        targetId,
        status,
        remainingTimeout,
        where
      );
      if (!isRetryableWaitResult(result.result)) {
        return result;
      }
      lastResult = result;
    } catch (error) {
      lastError = error;
      if (!isRetryableWaitError(error)) {
        throw error;
      }

      if (hasOption(args, "open") && !didOpen) {
        didOpen = true;
        const url = requireOption(args, "url");
        await ensureBridge({
          fetcher,
          bridgeUrl,
          starter: bridgeStarter,
          stateStore: bridgeStateStore,
          ...createOptionalNumberProperty("port", getNumberOption(args, "port"))
        });
        await runBrowserOrThrow(browserRunner, ["open", withOpenRuntimeSession(url, selector.sessionId)]);
      }
    }

    await sleep(100);
  }

  if (lastResult !== undefined) {
    return lastResult;
  }

  if (hasOption(args, "next")) {
    throw addOpenHint(new Error("No new connected runtime was found before timeout."), selector);
  }

  throw addOpenHint(lastError ?? new Error("No connected runtime was found before timeout."), selector);
}

async function collectConnectedRuntimeIds(
  fetcher: Fetcher,
  bridgeUrl: string,
  selector: RuntimeSelector
): Promise<Set<string>> {
  const runtimes = await fetchRuntimes(fetcher, bridgeUrl);
  const matchingConnectedRuntimes = filterConnectedRuntimes(runtimes, selector);
  return new Set(matchingConnectedRuntimes.map((runtime) => runtime.runtimeId));
}

function filterConnectedRuntimes(runtimes: BridgeRuntimeInfo[], selector: RuntimeSelector): BridgeRuntimeInfo[] {
  if (selector.runtimeId !== undefined) {
    return runtimes.filter((runtime) => runtime.runtimeId === selector.runtimeId && runtime.status === "connected");
  }

  const sessionId = selector.sessionId ?? (
    selector.url === undefined ? undefined : getOpenRuntimeSessionId(selector.url)
  );
  const normalizedUrl = selector.url === undefined ? undefined : normalizeUrlWithoutOpenRuntimeSession(selector.url);

  return runtimes.filter((runtime) =>
    runtime.status === "connected" &&
    (sessionId === undefined || runtime.sessionId === sessionId || getOpenRuntimeSessionId(runtime.url) === sessionId) &&
    (normalizedUrl === undefined || normalizeUrlWithoutOpenRuntimeSession(runtime.url) === normalizedUrl)
  );
}

function normalizeUrlWithoutOpenRuntimeSession(input: string): string {
  try {
    const url = new URL(input);
    url.searchParams.delete(OPEN_RUNTIME_SESSION_QUERY_PARAM);
    return url.toString();
  } catch {
    return input.endsWith("/") ? input.slice(0, -1) : input;
  }
}

function getOpenRuntimeSessionId(input: string): string | undefined {
  try {
    const sessionId = new URL(input).searchParams.get(OPEN_RUNTIME_SESSION_QUERY_PARAM);
    return sessionId === null || sessionId.length === 0 ? undefined : sessionId;
  } catch {
    return undefined;
  }
}

async function runStartCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  fetcher: Fetcher,
  bridgeStarter: BridgeStarter,
  bridgeStateStore: ReturnType<typeof createFileBridgeStateStore>
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

async function runStopCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  browserRunner: BrowserRunner,
  bridgeStateStore: ReturnType<typeof createFileBridgeStateStore>,
  bridgeProcessController: BridgeProcessController | undefined
): Promise<number> {
  const closeResult = await browserRunner.run(["close"]);
  const bridgeResult = await stopManagedBridge({
    bridgeUrl: createBridgeUrl(args),
    stateStore: bridgeStateStore,
    ...createOptionalObjectProperty("processController", bridgeProcessController)
  });
  writeJson(stdout, {
    browser: {
      command: "close",
      exitCode: closeResult.exitCode
    },
    bridge: bridgeResult
  });
  return 0;
}

async function runExportProfileCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  browserRunner: BrowserRunner
): Promise<number> {
  await closeBrowserForProfileCommand(browserRunner);
  const profileDirectory = getProfileDirectory();
  const outputPath = getOptionValue(args, "output");
  const result = hasOption(args, "full")
    ? await exportFullProfile({
        profileDirectory,
        ...(outputPath === undefined ? {} : { outputPath })
      })
    : await exportAuthProfile({
        profileDirectory,
        ...(outputPath === undefined ? {} : { outputPath })
      });

  stdout.write(`${result.path ?? result.content}\n`);
  return 0;
}

async function runImportProfileCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  browserRunner: BrowserRunner
): Promise<number> {
  await closeBrowserForProfileCommand(browserRunner);
  const inputPath = getOptionValue(args, "input");
  const input = inputPath === undefined
    ? await readProfileInput(args.command[1])
    : await readProfileInputFile(inputPath);
  const result = await importProfile({
    input,
    profileDirectory: getProfileDirectory()
  });
  writeJson(stdout, result);
  return 0;
}

async function closeBrowserForProfileCommand(browserRunner: BrowserRunner): Promise<void> {
  const result = await browserRunner.run(["close"]);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || "Could not close OpenRuntime browser.");
  }
}

function createBridgeUrl(args: ParsedCliArgs): string {
  const bridge = getOptionValue(args, "bridge");
  if (bridge !== undefined) {
    return normalizeBridgeUrl(bridge);
  }

  const port = getNumberOption(args, "port");
  if (port !== undefined) {
    return `http://localhost:${port}`;
  }

  return normalizeBridgeUrl(undefined);
}

function createBridgeStateStore(args: ParsedCliArgs, stateDirectory: string | undefined): ReturnType<typeof createFileBridgeStateStore> {
  return createFileBridgeStateStore(createBridgeUrl(args), stateDirectory);
}

function createOpenBrowserArgs(args: ParsedCliArgs, url: string): string[] {
  const browserArgs = ["open", withOpenRuntimeSession(url, getOptionValue(args, "session"))];
  const cookies = getOptionValue(args, "cookies");
  if (cookies !== undefined) {
    browserArgs.push("--cookies", cookies);
  }
  return browserArgs;
}

function createBrowserCommandArgs(args: ParsedCliArgs): string[] {
  const command = args.command[0];
  if (command === "goto") {
    return ["goto", withOpenRuntimeSession(requireCommandArgument(args, 1, "URL"), getOptionValue(args, "session"))];
  }
  if (command === "page-snapshot") {
    return ["snapshot"];
  }
  if (command === "click") {
    return ["click", requireCommandArgument(args, 1, "ref, selector, or text")];
  }
  if (command === "fill") {
    return [
      "fill",
      requireCommandArgument(args, 1, "ref or selector"),
      requireCommandArgument(args, 2, "value")
    ];
  }
  if (command === "eval") {
    const file = getOptionValue(args, "file");
    if (file !== undefined) {
      return ["eval", "--file", file];
    }
    return ["eval", requireCommandArgument(args, 1, "eval script")];
  }
  if (command === "screenshot") {
    const browserArgs = ["screenshot", ...args.command.slice(1)];
    if (hasOption(args, "full-page")) {
      browserArgs.push("--full-page");
    }
    return browserArgs;
  }
  return ["close"];
}

function shouldPreferInteractiveTextClick(target: string): boolean {
  const trimmed = target.trim();
  if (trimmed.length === 0) return false;
  if (/^e\d+$/.test(trimmed)) return false;
  return !/^(css=|text=|role=|#|\[|\.|\w+\s*>)/.test(trimmed);
}

function withOpenRuntimeSession(input: string, sessionId: string | undefined): string {
  if (sessionId === undefined || sessionId.length === 0) return input;

  try {
    const url = new URL(input);
    url.searchParams.set(OPEN_RUNTIME_SESSION_QUERY_PARAM, sessionId);
    return url.toString();
  } catch {
    return input;
  }
}

async function runBrowserAndPipe(
  browserRunner: BrowserRunner,
  browserArgs: string[],
  stdout: { write(chunk: string): void },
  stderr: { write(chunk: string): void },
  options?: BrowserRunOptions
): Promise<number> {
  const result = await browserRunner.run(browserArgs, options);
  if (result.stdout.length > 0) {
    stdout.write(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
  }
  if (result.stderr.length > 0) {
    stderr.write(result.stderr.endsWith("\n") ? result.stderr : `${result.stderr}\n`);
  }
  return result.exitCode;
}

async function runNetworkCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  stderr: { write(chunk: string): void },
  browserRunner: BrowserRunner
): Promise<number> {
  const result = await browserRunner.run(["network"]);
  const urlQuery = getOptionValue(args, "url");
  const output = result.exitCode === 0 && urlQuery !== undefined
    ? filterNetworkOutputByUrl(result.stdout, urlQuery)
    : normalizeNetworkOutput(result.stdout);
  if (output.length > 0) {
    stdout.write(output.endsWith("\n") ? output : `${output}\n`);
  }
  if (result.stderr.length > 0) {
    stderr.write(result.stderr.endsWith("\n") ? result.stderr : `${result.stderr}\n`);
  }
  return result.exitCode;
}

type BrowserConsoleLevel = "log" | "info" | "warn" | "error";

interface BrowserConsoleEntry {
  level: BrowserConsoleLevel;
  args: string;
  timestamp?: number;
}

async function runConsoleCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  stderr: { write(chunk: string): void },
  browserRunner: BrowserRunner
): Promise<number> {
  const result = await browserRunner.run(["eval", createConsoleLogScript()]);
  if (result.exitCode !== 0) {
    if (result.stdout.length > 0) {
      stdout.write(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
    }
    if (result.stderr.length > 0) {
      stderr.write(result.stderr.endsWith("\n") ? result.stderr : `${result.stderr}\n`);
    }
    return result.exitCode;
  }

  const entries = filterConsoleEntries(
    parseConsoleEntries(parseBrowserJsonOutput(result.stdout)),
    {
      ...createOptionalObjectProperty("levels", parseConsoleLevels(args)),
      ...createOptionalStringProperty("query", getOptionValue(args, "query")),
      ...createOptionalNumberProperty("limit", getNumberOption(args, "limit"))
    }
  );
  writeJson(stdout, {
    entries,
    summary: summarizeConsoleEntries(entries)
  });
  return 0;
}

function parseConsoleEntries(value: unknown): BrowserConsoleEntry[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): BrowserConsoleEntry[] => {
    if (entry === null || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const level = normalizeConsoleLevel(item.level);
    if (level === undefined) return [];
    return [{
      level,
      args: typeof item.args === "string" ? item.args : String(item.args ?? ""),
      ...createOptionalNumberProperty("timestamp", typeof item.timestamp === "number" ? item.timestamp : undefined)
    }];
  });
}

function parseConsoleLevels(args: ParsedCliArgs): Set<BrowserConsoleLevel> | undefined {
  const values = getOptionValues(args, "level");
  if (values.length === 0) return undefined;

  const levels = new Set<BrowserConsoleLevel>();
  for (const value of values) {
    for (const rawLevel of value.split(",")) {
      const level = normalizeConsoleLevel(rawLevel.trim());
      if (level === undefined) {
        throw new Error(`Unsupported console level "${rawLevel}". Use log, info, warn, or error.`);
      }
      levels.add(level);
    }
  }
  return levels;
}

function normalizeConsoleLevel(value: unknown): BrowserConsoleLevel | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.toLowerCase();
  if (normalized === "warning") return "warn";
  if (normalized === "log" || normalized === "info" || normalized === "warn" || normalized === "error") {
    return normalized;
  }
  return undefined;
}

function filterConsoleEntries(
  entries: BrowserConsoleEntry[],
  options: {
    levels?: Set<BrowserConsoleLevel>;
    query?: string;
    limit?: number;
  }
): BrowserConsoleEntry[] {
  const normalizedQuery = options.query?.toLowerCase();
  const filtered = entries.filter((entry) =>
    (options.levels === undefined || options.levels.has(entry.level)) &&
    (normalizedQuery === undefined ||
      entry.level.includes(normalizedQuery) ||
      entry.args.toLowerCase().includes(normalizedQuery))
  );

  if (options.limit === undefined || options.limit < 0) return filtered;
  return filtered.slice(-options.limit);
}

function summarizeConsoleEntries(entries: BrowserConsoleEntry[]): {
  total: number;
  log: number;
  info: number;
  warn: number;
  error: number;
} {
  const summary = {
    total: entries.length,
    log: 0,
    info: 0,
    warn: 0,
    error: 0
  };
  for (const entry of entries) {
    summary[entry.level] += 1;
  }
  return summary;
}

function filterNetworkOutputByUrl(output: string, query: string): string {
  const normalized = normalizeNetworkOutput(output);
  if (normalized.trim() === "(no requests)") return normalized;

  const lines = normalized.split(/\r?\n/);
  const filtered = lines.filter((line) => {
    if (line.length === 0 || line.startsWith("#")) return true;
    return getNetworkLineUrl(line)?.includes(query) ?? false;
  });
  return filtered.join("\n");
}

function normalizeNetworkOutput(output: string): string {
  return output.split(/\r?\n/).filter((line) => !line.includes("network <idx>")).join("\n");
}

function getNetworkLineUrl(line: string): string | undefined {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 6) return undefined;
  return parts[5];
}

async function runBrowserOrThrow(browserRunner: BrowserRunner, browserArgs: string[]): Promise<void> {
  const result = await browserRunner.run(browserArgs);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `next-browser ${browserArgs[0]} failed.`);
  }
}

async function waitForBrowserEval(
  browserRunner: BrowserRunner,
  script: string,
  timeout: number | undefined
): Promise<{
  success: boolean;
  condition: { script: string };
  value?: unknown;
  reason?: string;
}> {
  const deadline = Date.now() + (timeout ?? 5000);
  let lastValue: unknown;
  let lastError: string | undefined;

  while (Date.now() <= deadline) {
    const result = await browserRunner.run(["eval", createWaitEvalScript(script)]);
    if (result.exitCode === 0) {
      try {
        lastValue = parseBrowserJsonOutput(result.stdout);
        if (lastValue === true) {
          return {
            success: true,
            condition: { script },
            value: lastValue
          };
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    } else {
      lastError = result.stderr.trim() || result.stdout.trim();
    }
    await sleep(100);
  }

  const failure: {
    success: boolean;
    condition: { script: string };
    value?: unknown;
    reason?: string;
  } = {
    success: false,
    condition: { script }
  };
  if (lastValue !== undefined) {
    failure.value = lastValue;
  }
  failure.reason = lastError === undefined
    ? "Condition did not become true before timeout."
    : `Condition did not become true before timeout. Last error: ${lastError}`;
  return failure;
}

function hasOption(args: ParsedCliArgs, name: string): boolean {
  return args.options.has(name);
}

function isRetryableWaitResult(result: unknown): boolean {
  if (result === null || typeof result !== "object") return false;
  const value = result as {
    success?: unknown;
    reason?: unknown;
  };
  return value.success === false && value.reason === "Target is not registered.";
}

function isFailedWaitResult(result: unknown): boolean {
  if (result === null || typeof result !== "object") return false;
  return (result as { success?: unknown }).success === false;
}

function isRetryableWaitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.startsWith("No connected runtime") ||
    /^Runtime ".*" was not found\.$/.test(message) ||
    /^Runtime ".*" is disconnected\.$/.test(message) ||
    message === "Runtime is disconnected.";
}

function addOpenHint(error: unknown, selector: { sessionId?: string; url?: string }): Error {
  if (error instanceof Error && selector.url !== undefined && error.message.startsWith("No connected runtime matched")) {
    return new Error(`${error.message}\nUse --open to open the page before waiting.`);
  }
  return error instanceof Error ? error : new Error(String(error));
}

function createOptionalNumberProperty<Name extends string>(
  name: Name,
  value: number | undefined
): Record<Name, number> | Record<string, never> {
  return value === undefined ? {} : { [name]: value } as Record<Name, number>;
}

function createOptionalStringProperty<Name extends string>(
  name: Name,
  value: string | undefined
): Record<Name, string> | Record<string, never> {
  return value === undefined ? {} : { [name]: value } as Record<Name, string>;
}

function createOptionalObjectProperty<Name extends string, Value extends object>(
  name: Name,
  value: Value | undefined
): Record<Name, Value> | Record<string, never> {
  return value === undefined ? {} : { [name]: value } as Record<Name, Value>;
}

function isBrowserCommand(command: string | undefined): command is "open" | "goto" | "page-snapshot" | "click" | "fill" | "eval" | "wait-eval" | "get-window" | "screenshot" | "network" | "console" | "close" {
  return command === "open" ||
    command === "goto" ||
    command === "page-snapshot" ||
    command === "click" ||
    command === "fill" ||
    command === "eval" ||
    command === "wait-eval" ||
    command === "get-window" ||
    command === "screenshot" ||
    command === "network" ||
    command === "console" ||
    command === "close";
}

async function runBridgeServerCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  waitUntilClosed: ((server: BridgeServer) => Promise<void>) | undefined
): Promise<number> {
  const server = createBridgeServer();
  const address = await server.listen({
    port: getNumberOption(args, "port") ?? OPEN_RUNTIME_BRIDGE_DEFAULT_PORT
  });
  stdout.write(`OpenRuntime Bridge listening on ${address.url}\n`);
  if (waitUntilClosed !== undefined) {
    await waitUntilClosed(server);
  } else {
    await waitForProcessExit(server);
  }
  return 0;
}

function createQuery(args: ParsedCliArgs, command: string): URLSearchParams {
  const params = new URLSearchParams();
  const names = getQueryOptionNames(command);
  for (const name of names) {
    for (const value of getOptionValues(args, name)) {
      params.append(name, value);
    }
  }
  return params;
}

function getQueryOptionNames(command: string): string[] {
  if (command === "targets" || command === "snapshot") {
    return ["id", "type", "source", "status", "query"];
  }
  if (command === "events") {
    return ["since", "target-id", "action", "type", "source", "status", "limit", "query"];
  }
  return ["name", "source", "risk", "enabled", "query"];
}

function isRuntimeResourceCommand(command: string | undefined): command is "targets" | "snapshot" | "events" | "actions" {
  return command === "targets" || command === "snapshot" || command === "events" || command === "actions";
}

async function waitForProcessExit(server: BridgeServer): Promise<void> {
  const close = async () => {
    await server.close();
  };
  process.once("SIGINT", () => {
    void close();
  });
  process.once("SIGTERM", () => {
    void close();
  });
  await once(process, "beforeExit");
}

function writeJson(stdout: { write(chunk: string): void }, value: unknown): void {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function isCliEntryPoint(): boolean {
  return isEntryPoint(process.argv[1], import.meta.url);
}

if (isCliEntryPoint()) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
