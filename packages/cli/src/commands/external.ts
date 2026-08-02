import { existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  CliCommandReference,
  ExtensionLoadRecord,
  ExternalExtensionCandidate,
  ExternalExtensionLoadResult,
  ExternalExtensionModule,
  DivebellExtensionDefinition
} from "../types/commands.js";
import { resolveDivebellHomeDirectory } from "../utils/home.js";
import { validateExtension } from "./definition.js";
import { getInstalledExtensionEntryPaths } from "./installed.js";

export type { ExtensionLoadRecord, ExternalExtensionLoadResult } from "../types/commands.js";

const EXTERNAL_EXTENSION_DIR_ENV = "DIVEBELL_EXTENSIONS_DIR";
const DISABLE_EXTERNAL_EXTENSIONS_ENV = "DIVEBELL_DISABLE_EXTENSIONS";

export async function loadExternalCliExtensions(options: {
  reservedExtensionNames: readonly string[];
  reservedCommandNames: readonly string[];
  env?: NodeJS.ProcessEnv;
}): Promise<ExternalExtensionLoadResult> {
  const env = options.env ?? process.env;
  if (env[DISABLE_EXTERNAL_EXTENSIONS_ENV] === "1") {
    return { extensions: [], records: [] };
  }

  const directory = resolve(
    env[EXTERNAL_EXTENSION_DIR_ENV]
      ?? join(resolveDivebellHomeDirectory(env), "extensions")
  );
  if (!existsSync(directory)) {
    return { extensions: [], records: [] };
  }

  let candidates: ExternalExtensionCandidate[];
  try {
    const [looseCandidates, installedPaths] = await Promise.all([
      findExternalExtensionCandidates(directory),
      getInstalledExtensionEntryPaths(directory)
    ]);
    candidates = [
      ...installedPaths.map((path) => ({ path })),
      ...looseCandidates
    ];
  } catch (error) {
    return {
      extensions: [],
      records: [{
        name: "extensions-path",
        source: "external",
        status: "failed",
        path: directory,
        reason: error instanceof Error ? error.message : String(error)
      }]
    };
  }

  const reservedExtensionNames = new Set(options.reservedExtensionNames);
  const reservedCommandNames = new Set(options.reservedCommandNames);
  const extensions: DivebellExtensionDefinition[] = [];
  const records: ExtensionLoadRecord[] = [];
  for (const candidate of candidates) {
    const loaded = await loadExternalExtension(candidate, reservedExtensionNames, reservedCommandNames);
    records.push(loaded.record);
    if (loaded.extension === undefined) continue;
    extensions.push(loaded.extension);
    reservedExtensionNames.add(loaded.extension.name);
    for (const command of loaded.extension.commands ?? []) reservedCommandNames.add(command.name);
  }
  return { extensions, records };
}

export function createInternalExtensionRecords(
  extensions: readonly DivebellExtensionDefinition[]
): ExtensionLoadRecord[] {
  return extensions.map((extension) => ({
    name: extension.name,
    source: "internal",
    status: "loaded"
  }));
}

async function findExternalExtensionCandidates(directory: string): Promise<ExternalExtensionCandidate[]> {
  const stats = statSync(directory);
  if (stats.isFile()) {
    if (!directory.endsWith(".mjs")) {
      throw new Error(`Extension file must be an .mjs file: ${directory}`);
    }
    return [{ path: directory }];
  }
  if (!stats.isDirectory()) {
    throw new Error(`Extension path must be a file or directory: ${directory}`);
  }

  const entries = await readdir(directory, { withFileTypes: true });
  const candidates: ExternalExtensionCandidate[] = [];
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isFile() && entry.name.endsWith(".mjs")) {
      candidates.push({ path: entryPath });
    } else if (entry.isDirectory()) {
      const indexPath = join(entryPath, "index.mjs");
      if (existsSync(indexPath) && statSync(indexPath).isFile()) candidates.push({ path: indexPath });
    }
  }
  return candidates.sort((left, right) => left.path.localeCompare(right.path));
}

async function loadExternalExtension(
  candidate: ExternalExtensionCandidate,
  reservedExtensionNames: ReadonlySet<string>,
  reservedCommandNames: ReadonlySet<string>
): Promise<{ extension?: DivebellExtensionDefinition; record: ExtensionLoadRecord }> {
  try {
    const module = await importExternalModule(candidate.path);
    const definition = validateExtension(module.default, { path: candidate.path });
    if (reservedExtensionNames.has(definition.name)) {
      return skipped(definition.name, candidate.path, `Extension "${definition.name}" conflicts with an existing extension.`);
    }
    const conflictingCommand = (definition.commands ?? []).find((command) => reservedCommandNames.has(command.name));
    if (conflictingCommand !== undefined) {
      return skipped(definition.name, candidate.path, `Command "${conflictingCommand.name}" conflicts with an existing command.`);
    }
    const extension: DivebellExtensionDefinition = {
      ...definition,
      ...(definition.commands === undefined ? {} : {
        commands: definition.commands.map((command) => ({
          ...command,
          ...(command.commandReferences === undefined ? {} : {
            commandReferences: markExternalReferences(command.commandReferences)
          })
        }))
      })
    };
    return {
      extension,
      record: { name: definition.name, source: "external", status: "loaded", path: candidate.path }
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

function skipped(name: string, path: string, reason: string): { record: ExtensionLoadRecord } {
  return { record: { name, source: "external", status: "skipped", path, reason } };
}

function markExternalReferences(references: readonly CliCommandReference[]): readonly CliCommandReference[] {
  return references.map((reference) => ({ ...reference, category: "External Extensions" }));
}

async function importExternalModule(modulePath: string): Promise<ExternalExtensionModule> {
  const moduleUrl = pathToFileURL(modulePath);
  moduleUrl.searchParams.set("mtime", String(statSync(modulePath).mtimeMs));
  return await import(moduleUrl.href) as ExternalExtensionModule;
}

function inferExtensionName(modulePath: string): string {
  const segments = modulePath.replaceAll("\\", "/").split("/");
  const filename = segments.at(-1) ?? "unknown";
  return filename === "index.mjs" ? segments.at(-2) ?? "unknown" : filename.replace(/\.mjs$/, "");
}
