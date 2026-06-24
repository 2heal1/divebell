import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeSnapshot, RuntimeSnapshotTarget } from "@openruntime/core";
import { getOptionValue } from "../../args.js";
import { parseBrowserJsonOutput } from "../../browser.js";
import { fetchRuntimeResource, fetchRuntimes, selectRuntime } from "../../client.js";
import type { CliExtensionRunOptions } from "../types.js";

const DEFAULT_MODULE_INFO_TARGET_ID = "vmok:module-info";

interface VmokModuleInfoResult {
  targetId: string;
  status: string;
  updatedAt: number;
  moduleInfo: unknown;
  target: RuntimeSnapshotTarget;
}

export async function runVmokCommand(options: CliExtensionRunOptions): Promise<number> {
  const subcommand = options.args.command[1];
  if (subcommand === "get-module-info") {
    return await runGetModuleInfo(options);
  }
  if (subcommand === "get-instance") {
    return await runGetInstance(options);
  }

  throw new Error(`Unknown vmok command "${options.args.command.slice(1).join(" ")}".`);
}

async function runGetModuleInfo({
  args,
  stdout,
  fetcher,
  bridgeUrl,
  runtimeSelector
}: CliExtensionRunOptions): Promise<number> {
  const targetId = getOptionValue(args, "target") ?? DEFAULT_MODULE_INFO_TARGET_ID;
  const runtimes = await fetchRuntimes(fetcher, bridgeUrl);
  const runtime = selectRuntime(runtimes, runtimeSelector);
  const query = new URLSearchParams();
  query.set("id", targetId);

  const snapshot = await fetchRuntimeResource<RuntimeSnapshot>(
    fetcher,
    bridgeUrl,
    runtime,
    "snapshot",
    query
  );
  const target = snapshot.result.targets[targetId];
  if (target === undefined) {
    throw new Error(`VMOK module info target "${targetId}" was not found.`);
  }

  writeJson(stdout, {
    runtime: snapshot.runtime,
    result: createModuleInfoResult(targetId, target)
  });
  return 0;
}

async function runGetInstance({
  args,
  stdout,
  browserRunner
}: CliExtensionRunOptions): Promise<number> {
  const name = args.command[2] ?? getOptionValue(args, "name");
  if (name === undefined || name.length === 0) {
    throw new Error("Missing required VMOK instance name.");
  }

  const scriptFile = await createGetInstanceScriptFile(name);
  try {
    const result = await browserRunner.run(["eval", "--file", scriptFile.path]);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || result.stdout.trim() || "VMOK get-instance browser eval failed.");
    }

    writeJson(stdout, {
      result: {
        name,
        value: parseBrowserJsonOutput(result.stdout) ?? null
      }
    });
    return 0;
  } finally {
    await scriptFile.cleanup();
  }
}

function createModuleInfoResult(targetId: string, target: RuntimeSnapshotTarget): VmokModuleInfoResult {
  return {
    targetId,
    status: target.status,
    updatedAt: target.updatedAt,
    moduleInfo: target.data ?? null,
    target
  };
}

async function createGetInstanceScriptFile(name: string): Promise<{
  path: string;
  cleanup(): Promise<void>;
}> {
  const directory = await mkdtemp(join(tmpdir(), "openruntime-vmok-"));
  const path = join(directory, "get-instance.js");
  await writeFile(path, createGetInstanceScript(name), "utf8");
  return {
    path,
    cleanup: async () => {
      await rm(directory, {
        force: true,
        recursive: true
      });
    }
  };
}

function createGetInstanceScript(name: string): string {
  const escapedName = escapeSingleQuotedString(name);
  return [
    "(() => {",
    `  return window.__VMOK__.instances.find(i=>i.name==='${escapedName}');`,
    "})()"
  ].join("\n");
}

function escapeSingleQuotedString(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function writeJson(stdout: { write(chunk: string): void }, value: unknown): void {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
