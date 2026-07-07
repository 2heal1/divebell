import { existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  type CliCommandReference,
  type CliExampleReference,
  type CliExtensionRunOptions,
  type OpenRuntimeCliExtension
} from "./index.js";

const EXTERNAL_EXTENSION_SCHEMA_VERSION = 1;
const DEFAULT_EXTERNAL_EXTENSION_DIR = join(homedir(), ".openruntime", "extensions");
const EXTERNAL_EXTENSION_DIR_ENV = "OPENRUNTIME_EXTENSIONS_DIR";
const DISABLE_EXTERNAL_EXTENSIONS_ENV = "OPENRUNTIME_DISABLE_EXTERNAL_EXTENSIONS";

export interface ExtensionLoadRecord {
  name: string;
  source: "internal" | "external";
  status: "loaded" | "skipped" | "failed";
  path?: string;
  reason?: string;
}

export interface ExternalExtensionLoadResult {
  extensions: OpenRuntimeCliExtension[];
  records: ExtensionLoadRecord[];
}

interface ExternalExtensionModule {
  default?: unknown;
}

interface ExternalExtensionCandidate {
  path: string;
}

interface ExternalExtensionDefinition {
  schemaVersion: number;
  name: string;
  displayName?: string;
  description?: string;
  commandReferences?: readonly CliCommandReference[];
  exampleReferences?: readonly CliExampleReference[];
  run(options: CliExtensionRunOptions): Promise<number>;
}

export async function loadExternalCliExtensions(options: {
  reservedNames: readonly string[];
  env?: NodeJS.ProcessEnv;
}): Promise<ExternalExtensionLoadResult> {
  const env = options.env ?? process.env;
  if (env[DISABLE_EXTERNAL_EXTENSIONS_ENV] === "1") {
    return {
      extensions: [],
      records: []
    };
  }

  const directory = resolve(env[EXTERNAL_EXTENSION_DIR_ENV] ?? DEFAULT_EXTERNAL_EXTENSION_DIR);
  if (!existsSync(directory)) {
    return {
      extensions: [],
      records: []
    };
  }

  let candidates: ExternalExtensionCandidate[];
  try {
    candidates = await findExternalExtensionCandidates(directory);
  } catch (error) {
    return {
      extensions: [],
      records: [
        {
          name: "extensions-dir",
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
    const loaded = await loadExternalExtension(candidate, reservedNames);
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
  references: readonly CliCommandReference[],
  extensionName: string
): readonly CliCommandReference[] {
  return references.map((reference) => ({
    ...reference,
    category: "External Extensions",
    usage: `${reference.usage} [external: ${extensionName}]`,
    description: `${reference.description} [external: ${extensionName}]`
  }));
}

async function findExternalExtensionCandidates(directory: string): Promise<ExternalExtensionCandidate[]> {
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

async function loadExternalExtension(
  candidate: ExternalExtensionCandidate,
  reservedNames: ReadonlySet<string>
): Promise<{
  extension?: OpenRuntimeCliExtension;
  record: ExtensionLoadRecord;
}> {
  try {
    const module = await importExternalModule(candidate.path);
    const definition = validateExternalExtensionDefinition(module.default, candidate.path);
    if (reservedNames.has(definition.name)) {
      return {
        record: {
          name: definition.name,
          source: "external",
          status: "skipped",
          path: candidate.path,
          reason: `Extension command "${definition.name}" conflicts with an existing command.`
        }
      };
    }

    return {
      extension: {
        name: definition.name,
        ...(definition.commandReferences === undefined ? {} : {
          commandReferences: markExternalCommandReferences(definition.commandReferences, definition.name)
        }),
        ...(definition.exampleReferences === undefined ? {} : {
          exampleReferences: definition.exampleReferences
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

function validateExternalExtensionDefinition(value: unknown, modulePath: string): ExternalExtensionDefinition {
  if (typeof value !== "object" || value === null) {
    throw new Error(`External extension must default-export an object: ${modulePath}`);
  }

  const candidate = value as Partial<ExternalExtensionDefinition>;
  if (candidate.schemaVersion !== EXTERNAL_EXTENSION_SCHEMA_VERSION) {
    throw new Error(`External extension schemaVersion must be ${EXTERNAL_EXTENSION_SCHEMA_VERSION}.`);
  }
  if (typeof candidate.name !== "string" || candidate.name.length === 0) {
    throw new Error("External extension name must be a non-empty string.");
  }
  if (!/^[a-z][a-z0-9-]*$/.test(candidate.name)) {
    throw new Error(`External extension name "${candidate.name}" must match /^[a-z][a-z0-9-]*$/.`);
  }
  if (typeof candidate.run !== "function") {
    throw new Error(`External extension "${candidate.name}" must export a run(options) function.`);
  }
  if (candidate.commandReferences !== undefined && !Array.isArray(candidate.commandReferences)) {
    throw new Error(`External extension "${candidate.name}" commandReferences must be an array.`);
  }
  if (candidate.exampleReferences !== undefined && !Array.isArray(candidate.exampleReferences)) {
    throw new Error(`External extension "${candidate.name}" exampleReferences must be an array.`);
  }

  return {
    schemaVersion: candidate.schemaVersion,
    name: candidate.name,
    ...(candidate.displayName === undefined ? {} : { displayName: candidate.displayName }),
    ...(candidate.description === undefined ? {} : { description: candidate.description }),
    ...(candidate.commandReferences === undefined ? {} : { commandReferences: candidate.commandReferences }),
    ...(candidate.exampleReferences === undefined ? {} : { exampleReferences: candidate.exampleReferences }),
    run: async (options) => await candidate.run!(options)
  };
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
