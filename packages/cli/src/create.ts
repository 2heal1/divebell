import { createPackageInfo } from "@openruntime/core";
import { validateCommandSkill } from "./commands/skill.js";
import { validateExtension } from "./commands/definition.js";
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
import { createExtensionHookPlans } from "./features/extension/plan.js";
import type {
  CliRunOptions,
  CreateOpenRuntimeCliOptions,
  OpenRuntimeCli,
  OpenRuntimeExtensionCommand,
  OpenRuntimeExtensionDefinition,
  OpenRuntimeCliWithExternalExtensions
} from "./types/cli.js";

export const cliPackageInfo = createPackageInfo("@openruntime/cli", "agent command line");

export function getCliCommandName(): "openruntime" {
  return "openruntime";
}

export function createOpenRuntimeCli(options: CreateOpenRuntimeCliOptions = {}): OpenRuntimeCli {
  const extensions = (options.extensions ?? []).map((extension) => validateExtension(extension));
  const extensionRegistry = createExtensionRegistry(extensions);
  const commandRegistry = createCommandRegistry(extensions);
  const hookPlans = createExtensionHookPlans(extensions);
  const commandReferences = [
    ...cliCommandReferences,
    ...extensions.flatMap((extension) =>
      (extension.commands ?? []).flatMap((command) => command.commandReferences ?? [])
    )
  ];
  const commandSkillReferences = extensions.flatMap((extension) =>
    (extension.commands ?? []).flatMap(createCommandSkillReferences)
  );
  const config = {
    commandReferences,
    commandSkillReferences,
    extensions,
    hookPlans,
    extensionRegistry,
    commandRegistry,
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

function createExtensionRegistry(
  extensions: readonly OpenRuntimeExtensionDefinition[]
): Map<string, OpenRuntimeExtensionDefinition> {
  const registry = new Map<string, OpenRuntimeExtensionDefinition>();
  for (const extension of extensions) {
    if (registry.has(extension.name)) {
      throw new Error(`Extension "${extension.name}" is registered more than once.`);
    }
    registry.set(extension.name, extension);
  }
  return registry;
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
  const external = await loadExternalCliExtensions({
    reservedExtensionNames: internalExtensions.map((extension) => extension.name),
    reservedCommandNames: [
      ...createBuiltInCommandNameSet(),
      ...internalExtensions.flatMap((extension) =>
        (extension.commands ?? []).map((command) => command.name)
      )
    ],
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

function createCommandRegistry(extensions: readonly OpenRuntimeExtensionDefinition[]): Map<string, {
  extension: OpenRuntimeExtensionDefinition;
  command: OpenRuntimeExtensionCommand;
}> {
  const registry = new Map<string, {
    extension: OpenRuntimeExtensionDefinition;
    command: OpenRuntimeExtensionCommand;
  }>();
  const builtInCommandNames = createBuiltInCommandNameSet();

  for (const extension of extensions) {
    if (extension.name.length === 0) {
      throw new Error("Extension name must not be empty.");
    }
    for (const command of extension.commands ?? []) {
      if (builtInCommandNames.has(command.name)) {
        throw new Error(`Command "${command.name}" conflicts with a built-in command.`);
      }
      if (registry.has(command.name)) {
        throw new Error(`Command "${command.name}" is registered more than once.`);
      }
      if (command.skill !== undefined) validateCommandSkill(command.skill, command.name);
      registry.set(command.name, { extension, command });
    }
  }

  return registry;
}

function createCommandSkillReferences(command: OpenRuntimeExtensionCommand): CliCommandSkillReference[] {
  if (command.skill === undefined) return [];
  let category: CliCommandSkillReference["category"] | undefined;
  for (const reference of command.commandReferences ?? []) {
    if (reference.category === "Extensions" || reference.category === "External Extensions") {
      category = reference.category;
      break;
    }
  }
  if (category === undefined) return [];
  return [{
    category,
    command: command.name
  }];
}

function formatExternalExtensionWarning(record: ExtensionLoadRecord): string {
  const location = record.path === undefined ? record.name : record.path;
  const reason = record.reason ?? "unknown reason";
  return `Skipped external OpenRuntime extension ${location}: ${reason}\n`;
}
