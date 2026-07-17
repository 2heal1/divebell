import { createPackageInfo } from "@openruntime/core";
import { validateCommandSkill } from "./commands/skill.js";
import { createBuiltInCommandNameSet } from "./commands/names.js";
import {
  createInternalExtensionRecords,
  loadExternalCliExtensions,
  type ExtensionLoadRecord
} from "./commands/external.js";
import {
  cliCommandReferences,
  createHelpText,
  type CliCommandSkillReference
} from "./commands/help.js";
import { runCliWithConfig } from "./runner.js";
import type {
  CliRunOptions,
  CreateOpenRuntimeCliOptions,
  OpenRuntimeCli,
  OpenRuntimeCliExtension,
  OpenRuntimeCliWithExternalExtensions
} from "./types/cli.js";

export const cliPackageInfo = createPackageInfo("@openruntime/cli", "agent command line");

export function getCliCommandName(): "openruntime" {
  return "openruntime";
}

export function createOpenRuntimeCli(options: CreateOpenRuntimeCliOptions = {}): OpenRuntimeCli {
  const extensions = options.extensions ?? [];
  const extensionRegistry = createExtensionRegistry(extensions);
  const commandReferences = [
    ...cliCommandReferences,
    ...extensions.flatMap((extension) => extension.commandReferences ?? [])
  ];
  const commandSkillReferences = extensions.flatMap(createCommandSkillReferences);
  const config = {
    commandReferences,
    commandSkillReferences,
    extensionRegistry,
    extensionLoadRecords: options.extensionLoadRecords ?? createInternalExtensionRecords(extensions)
  };
  const packageInfo = options.packageInfo ?? cliPackageInfo;

  return {
    packageInfo,
    extensions: [...extensions],
    run: async (argv = process.argv.slice(2), runOptions: CliRunOptions = {}) =>
      await runCliWithConfig(config, argv, runOptions),
    createHelpText: () => createHelpText({
      commandReferences,
      commandSkillReferences
    }),
    getCommandReferences: () => [...commandReferences]
  };
}

export const defaultOpenRuntimeCli = createOpenRuntimeCli();

export async function runCli(argv = process.argv.slice(2), options: CliRunOptions = {}): Promise<number> {
  const stderr = options.stderr ?? process.stderr;
  const loaded = await createOpenRuntimeCliWithExternalExtensions();
  for (const record of loaded.extensionLoadRecords) {
    if (record.source === "external" && record.status !== "loaded") {
      stderr.write(formatExternalExtensionWarning(record));
    }
  }
  return await loaded.cli.run(argv, {
    ...options,
    stderr
  });
}

export async function createOpenRuntimeCliWithExternalExtensions(
  options: CreateOpenRuntimeCliOptions = {},
  env: NodeJS.ProcessEnv = process.env
): Promise<OpenRuntimeCliWithExternalExtensions> {
  const internalExtensions = options.extensions ?? [];
  const reservedNames = [
    ...createBuiltInCommandNameSet(),
    ...internalExtensions.map((extension) => extension.name)
  ];
  const external = await loadExternalCliExtensions({
    reservedNames,
    env
  });
  const extensionLoadRecords = [
    ...createInternalExtensionRecords(internalExtensions),
    ...external.records
  ];
  return {
    cli: createOpenRuntimeCli({
      ...options,
      extensions: [
        ...internalExtensions,
        ...external.extensions
      ],
      extensionLoadRecords
    }),
    extensionLoadRecords
  };
}

function createExtensionRegistry(extensions: readonly OpenRuntimeCliExtension[]): Map<string, OpenRuntimeCliExtension> {
  const registry = new Map<string, OpenRuntimeCliExtension>();
  const builtInCommandNames = createBuiltInCommandNameSet();

  for (const extension of extensions) {
    if (extension.name.length === 0) {
      throw new Error("CLI command name must not be empty.");
    }
    if (builtInCommandNames.has(extension.name)) {
      throw new Error(`CLI command "${extension.name}" conflicts with a built-in command.`);
    }
    if (registry.has(extension.name)) {
      throw new Error(`CLI command "${extension.name}" is registered more than once.`);
    }
    if (extension.skill !== undefined) {
      validateCommandSkill(extension.skill, extension.name);
    }
    registry.set(extension.name, extension);
  }

  return registry;
}

function createCommandSkillReferences(extension: OpenRuntimeCliExtension): CliCommandSkillReference[] {
  if (extension.skill === undefined) return [];
  let category: CliCommandSkillReference["category"] | undefined;
  for (const reference of extension.commandReferences ?? []) {
    if (reference.category === "Commands" || reference.category === "External Commands") {
      category = reference.category;
      break;
    }
  }
  if (category === undefined) return [];
  return [{
    category,
    command: extension.name
  }];
}

function formatExternalExtensionWarning(record: ExtensionLoadRecord): string {
  const location = record.path === undefined ? record.name : record.path;
  const reason = record.reason ?? "unknown reason";
  return `Skipped external OpenRuntime command ${location}: ${reason}\n`;
}
