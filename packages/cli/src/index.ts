#!/usr/bin/env node
import { once } from "node:events";
import { createBridgeServer, type BridgeServer } from "@openruntime/bridge";
import { createPackageInfo, OPEN_RUNTIME_BRIDGE_DEFAULT_PORT, type RuntimeDataCondition } from "@openruntime/core";
import { getNumberOption, getOptionValue, getOptionValues, parseCliArgs, type ParsedCliArgs } from "./args.js";
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
  waitUntilClosed?: (server: BridgeServer) => Promise<void>;
}

export async function runCli(argv = process.argv.slice(2), options: CliRunOptions = {}): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const fetcher = options.fetcher ?? fetch;
  const args = parseCliArgs(argv);

  try {
    if (args.command.length === 0) {
      stdout.write(`${createHelpText()}\n`);
      return 0;
    }

    if (args.command[0] === "bridge") {
      return await runBridgeCommand(args, stdout, fetcher, options.waitUntilClosed);
    }

    if (args.command[0] === "runtimes") {
      const bridgeUrl = normalizeBridgeUrl(getOptionValue(args, "bridge"));
      const runtimes = await fetchRuntimes(fetcher, bridgeUrl);
      writeJson(stdout, {
        bridgeUrl,
        runtimes
      });
      return 0;
    }

    if (isRuntimeResourceCommand(args.command[0])) {
      const bridgeUrl = normalizeBridgeUrl(getOptionValue(args, "bridge"));
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
      const bridgeUrl = normalizeBridgeUrl(getOptionValue(args, "bridge"));
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
      const bridgeUrl = normalizeBridgeUrl(getOptionValue(args, "bridge"));
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
      const bridgeUrl = normalizeBridgeUrl(getOptionValue(args, "bridge"));
      const runtimes = await fetchRuntimes(fetcher, bridgeUrl);
      const runtime = selectRuntime(runtimes, createRuntimeSelector(args));
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
    "  open-runtime bridge start [--port <port>]",
    "  open-runtime bridge status [--bridge <url>]",
    "  open-runtime runtimes [--bridge <url>]",
    "  open-runtime targets|snapshot|events|actions [--bridge <url>] [--url <url> | --runtime <id>]",
    "  open-runtime input-options [--bridge <url>] [--url <url> | --runtime <id>] --action <name> --input <name> [--payload <json>] [--timeout <ms>]",
    "  open-runtime run-action [--bridge <url>] [--url <url> | --runtime <id>] <action-name> [--payload <json>]",
    "  open-runtime wait-for [--bridge <url>] [--url <url> | --runtime <id>] <target-id> <status> [--where <path=value>] [--timeout <ms>]"
  ].join("\n");
}

function isCliEntryPoint(): boolean {
  return isEntryPoint(process.argv[1], import.meta.url);
}

if (isCliEntryPoint()) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
