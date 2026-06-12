#!/usr/bin/env node
import { once } from "node:events";
import { createBridgeServer, type BridgeServer } from "@openruntime/bridge";
import { createPackageInfo, OPEN_RUNTIME_BRIDGE_DEFAULT_PORT, type RuntimeDataCondition } from "@openruntime/core";
import { getNumberOption, getOptionValue, getOptionValues, parseCliArgs, type ParsedCliArgs } from "./args.js";
import {
  createGetWindowScript,
  createNextBrowserRunner,
  createWaitEvalScript,
  parseBrowserJsonOutput,
  type BrowserRunner
} from "./browser.js";
import {
  createDetachedBridgeStarter,
  ensureBridge,
  waitForSelectedRuntime,
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
  type Fetcher
} from "./client.js";
import { isEntryPoint } from "./entry.js";

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
    if (args.command.length === 0) {
      stdout.write(`${createHelpText()}\n`);
      return 0;
    }

    if (args.command[0] === "bridge") {
      return await runBridgeCommand(args, stdout, fetcher, options.waitUntilClosed);
    }

    if (isBrowserCommand(args.command[0])) {
      return await runBrowserCliCommand(args, stdout, stderr, fetcher, browserRunner, bridgeStarter);
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
      const runtime = await selectRuntimeForWait(args, fetcher, bridgeUrl, browserRunner, bridgeStarter);
      const result = await waitForRuntime(
        fetcher,
        bridgeUrl,
        runtime,
        targetId,
        status,
        getNumberOption(args, "timeout"),
        parseWhereOptions(args)
      );
      writeJson(stdout, result);
      return 0;
    }

    throw new Error(`Unknown command "${args.command.join(" ")}".`);
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function createRuntimeSelector(args: ParsedCliArgs): {
  runtimeId?: string;
  url?: string;
} {
  const selector: {
    runtimeId?: string;
    url?: string;
  } = {};
  const runtimeId = getOptionValue(args, "runtime");
  const url = getOptionValue(args, "url");
  if (runtimeId !== undefined) selector.runtimeId = runtimeId;
  if (url !== undefined) selector.url = url;
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
      equals: value.slice(equalsIndex + 1)
    };
  });
}

async function runBrowserCliCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  stderr: { write(chunk: string): void },
  fetcher: Fetcher,
  browserRunner: BrowserRunner,
  bridgeStarter: BridgeStarter
): Promise<number> {
  const command = args.command[0];
  if (command === "open") {
    const url = requireCommandArgument(args, 1, "URL");
    if (!hasOption(args, "no-bridge")) {
      await ensureBridge({
        fetcher,
        bridgeUrl: createBridgeUrl(args),
        starter: bridgeStarter,
        ...createOptionalNumberProperty("port", getNumberOption(args, "port"))
      });
    }
    return await runBrowserAndPipe(browserRunner, createOpenBrowserArgs(args, url), stdout, stderr);
  }

  if (command === "get-window") {
    const path = requireCommandArgument(args, 1, "window path");
    return await runBrowserAndPipe(browserRunner, ["eval", createGetWindowScript(path)], stdout, stderr);
  }

  if (command === "wait-eval") {
    const script = requireCommandArgument(args, 1, "eval script");
    const result = await waitForBrowserEval(browserRunner, script, getNumberOption(args, "timeout"));
    writeJson(stdout, result);
    return 0;
  }

  return await runBrowserAndPipe(browserRunner, createBrowserCommandArgs(args), stdout, stderr);
}

async function selectRuntimeForWait(
  args: ParsedCliArgs,
  fetcher: Fetcher,
  bridgeUrl: string,
  browserRunner: BrowserRunner,
  bridgeStarter: BridgeStarter
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
      ...createOptionalNumberProperty("port", getNumberOption(args, "port"))
    });
    await runBrowserOrThrow(browserRunner, ["open", url]);
    return await waitForSelectedRuntime({
      fetcher,
      bridgeUrl,
      selector,
      ...createOptionalNumberProperty("timeout", getNumberOption(args, "timeout"))
    });
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

function createOpenBrowserArgs(args: ParsedCliArgs, url: string): string[] {
  const browserArgs = ["open", url];
  const cookies = getOptionValue(args, "cookies");
  if (cookies !== undefined) {
    browserArgs.push("--cookies", cookies);
  }
  return browserArgs;
}

function createBrowserCommandArgs(args: ParsedCliArgs): string[] {
  const command = args.command[0];
  if (command === "goto") {
    return ["goto", requireCommandArgument(args, 1, "URL")];
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

async function runBrowserAndPipe(
  browserRunner: BrowserRunner,
  browserArgs: string[],
  stdout: { write(chunk: string): void },
  stderr: { write(chunk: string): void }
): Promise<number> {
  const result = await browserRunner.run(browserArgs);
  if (result.stdout.length > 0) {
    stdout.write(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
  }
  if (result.stderr.length > 0) {
    stderr.write(result.stderr.endsWith("\n") ? result.stderr : `${result.stderr}\n`);
  }
  return result.exitCode;
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

function addOpenHint(error: unknown, selector: { url?: string }): Error {
  if (error instanceof Error && selector.url !== undefined && error.message.startsWith("No connected runtime matched URL")) {
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

function isBrowserCommand(command: string | undefined): command is "open" | "goto" | "page-snapshot" | "click" | "fill" | "eval" | "wait-eval" | "get-window" | "screenshot" | "close" {
  return command === "open" ||
    command === "goto" ||
    command === "page-snapshot" ||
    command === "click" ||
    command === "fill" ||
    command === "eval" ||
    command === "wait-eval" ||
    command === "get-window" ||
    command === "screenshot" ||
    command === "close";
}

async function runBridgeCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  fetcher: Fetcher,
  waitUntilClosed: ((server: BridgeServer) => Promise<void>) | undefined
): Promise<number> {
  const subcommand = args.command[1];

  if (subcommand === "start") {
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

  if (subcommand === "status") {
    const bridgeUrl = normalizeBridgeUrl(getOptionValue(args, "bridge"));
    const runtimes = await fetchRuntimes(fetcher, bridgeUrl);
    writeJson(stdout, {
      bridgeUrl,
      runtimes
    });
    return 0;
  }

  throw new Error(`Unknown bridge command "${subcommand ?? ""}".`);
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
    return ["since", "target-id", "action", "type", "source", "status", "limit"];
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

function createHelpText(): string {
  return [
    "Usage:",
    "  open-runtime open <url> [--bridge <url>] [--port <port>] [--no-bridge]",
    "  open-runtime goto <url>",
    "  open-runtime page-snapshot",
    "  open-runtime click <ref|selector|text>",
    "  open-runtime fill <ref|selector> <value>",
    "  open-runtime eval <script>",
    "  open-runtime wait-eval <script> [--timeout <ms>]",
    "  open-runtime get-window <path>",
    "  open-runtime screenshot [name] [--full-page]",
    "  open-runtime close",
    "  open-runtime bridge start [--port <port>]",
    "  open-runtime bridge status [--bridge <url>]",
    "  open-runtime runtimes [--bridge <url>]",
    "  open-runtime targets|snapshot|events|actions [--bridge <url>] [--url <url> | --runtime <id>]",
    "  open-runtime input-options [--bridge <url>] [--url <url> | --runtime <id>] --action <name> --input <name> [--payload <json>] [--timeout <ms>]",
    "  open-runtime run-action [--bridge <url>] [--url <url> | --runtime <id>] <action-name> [--payload <json>]",
    "  open-runtime wait-for [--bridge <url>] [--url <url> | --runtime <id>] <target-id> <status> [--where <path=value>] [--timeout <ms>] [--open]"
  ].join("\n");
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
