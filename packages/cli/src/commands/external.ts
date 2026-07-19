import { existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  type CliCommandReference,
} from "./help.js";
import type { OpenRuntimeCliExtension } from "../types/commands.js";
import { validateCommand } from "./definition.js";
import type { ExtensionLoadRecord } from "../types/commands.js";
import { getInstalledCommandEntryPaths } from "./installed.js";

export type { ExtensionLoadRecord } from "../types/commands.js";

const DEFAULT_EXTERNAL_COMMAND_DIR = join(homedir(), ".openruntime", "commands");
const EXTERNAL_COMMAND_DIR_ENV = "OPENRUNTIME_COMMANDS_DIR";
const DISABLE_EXTERNAL_COMMANDS_ENV = "OPENRUNTIME_DISABLE_COMMANDS";

import type { ExternalExtensionLoadResult, ExternalExtensionModule, ExternalExtensionCandidate } from "../types/commands.js";
export type { ExternalExtensionLoadResult } from "../types/commands.js";

export async function loadExternalCliExtensions(options: {
  reservedNames: readonly string[];
  env?: NodeJS.ProcessEnv;
}): Promise<ExternalExtensionLoadResult> {
  const env = options.env ?? process.env;
  if (isExternalCommandLoadingDisabled(env)) {
    return {
      extensions: [],
      records: []
    };
  }

  const directory = resolveExternalCommandDirectory(env);
  if (!existsSync(directory)) {
    return {
      extensions: [],
      records: []
    };
  }

  let candidates: ExternalExtensionCandidate[];
  try {
    const [looseCandidates, installedPaths] = await Promise.all([
      findExternalExtensionCandidates(directory),
      getInstalledCommandEntryPaths(directory)
    ]);
    candidates = [
      ...installedPaths.map((path) => ({ path })),
      ...looseCandidates
    ];
  } catch (error) {
    return {
      extensions: [],
      records: [
        {
          name: "commands-path",
          source: "external",
          status: "failed",
          path: directory,
          reason: error instanceof Error ? error.message : String(error)
        }
      ]
    };
  }

  const reservedNames = new Set(options.reservedNames);
  const extensions: OpenRuntimeCliExtension[] = [];
  const records: ExtensionLoadRecord[] = [];
  for (const candidate of candidates) {
    const loaded = await loadExternalCommand(candidate, reservedNames);
    records.push(loaded.record);
    if (loaded.extension !== undefined) {
      extensions.push(loaded.extension);
      reservedNames.add(loaded.extension.name);
    }
  }

  return {
    extensions,
    records
  };
}

export function createInternalExtensionRecords(extensions: readonly OpenRuntimeCliExtension[]): ExtensionLoadRecord[] {
  return extensions.map((extension) => ({
    name: extension.name,
    source: "internal",
    status: "loaded"
  }));
}

export function markExternalCommandReferences(
  references: readonly CliCommandReference[]
): readonly CliCommandReference[] {
  return references.map((reference) => ({
    ...reference,
    category: "External Commands"
  }));
}

async function findExternalExtensionCandidates(directory: string): Promise<ExternalExtensionCandidate[]> {
  const stats = statSync(directory);
  if (stats.isFile()) {
    if (!directory.endsWith(".mjs")) {
      throw new Error(`Command file must be an .mjs file: ${directory}`);
    }
    return [{ path: directory }];
  }
  if (!stats.isDirectory()) {
    throw new Error(`Command path must be a file or directory: ${directory}`);
  }

  const entries = await readdir(directory, { withFileTypes: true });
  const candidates: ExternalExtensionCandidate[] = [];
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isFile() && entry.name.endsWith(".mjs")) {
      candidates.push({ path: entryPath });
      continue;
    }
    if (entry.isDirectory()) {
      const indexPath = join(entryPath, "index.mjs");
      if (existsSync(indexPath) && statSync(indexPath).isFile()) {
        candidates.push({ path: indexPath });
      }
    }
  }
  return candidates.sort((left, right) => left.path.localeCompare(right.path));
}

async function loadExternalCommand(
  candidate: ExternalExtensionCandidate,
  reservedNames: ReadonlySet<string>
): Promise<{
  extension?: OpenRuntimeCliExtension;
  record: ExtensionLoadRecord;
}> {
  try {
    const module = await importExternalModule(candidate.path);
    const definition = validateCommand(module.default, { path: candidate.path });
    if (reservedNames.has(definition.name)) {
      return {
        record: {
          name: definition.name,
          source: "external",
          status: "skipped",
          path: candidate.path,
          reason: `Command "${definition.name}" conflicts with an existing command.`
        }
      };
    }

    return {
      extension: {
        name: definition.name,
        ...(definition.skill === undefined ? {} : { skill: definition.skill }),
        ...(definition.commandReferences === undefined ? {} : {
          commandReferences: markExternalCommandReferences(definition.commandReferences)
        }),
        run: definition.run
      },
      record: {
        name: definition.name,
        source: "external",
        status: "loaded",
        path: candidate.path
      }
    };
  } catch (error) {
    return {
      record: {
        name: inferExtensionName(candidate.path),
        source: "external",
        status: "failed",
        path: candidate.path,
        reason: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

async function importExternalModule(modulePath: string): Promise<ExternalExtensionModule> {
  const moduleUrl = pathToFileURL(modulePath);
  moduleUrl.searchParams.set("mtime", String(statSync(modulePath).mtimeMs));
  return await import(moduleUrl.href) as ExternalExtensionModule;
}

function inferExtensionName(modulePath: string): string {
  const normalized = modulePath.replaceAll("\\", "/");
  const segments = normalized.split("/");
  const filename = segments.at(-1) ?? "unknown";
  if (filename === "index.mjs") {
    return segments.at(-2) ?? "unknown";
  }
  return filename.replace(/\.mjs$/, "");
}

function isExternalCommandLoadingDisabled(env: NodeJS.ProcessEnv): boolean {
  return env[DISABLE_EXTERNAL_COMMANDS_ENV] === "1";
}

function resolveExternalCommandDirectory(env: NodeJS.ProcessEnv): string {
  if (env[EXTERNAL_COMMAND_DIR_ENV] !== undefined) {
    return resolve(env[EXTERNAL_COMMAND_DIR_ENV]);
  }
  return DEFAULT_EXTERNAL_COMMAND_DIR;
}
