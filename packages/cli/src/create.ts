import { createPackageInfo } from "@divebell/core";
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
import { parseCliArgs } from "./utils/args.js";
import { runCliWithConfig } from "./runner.js";
import { createExtensionHookPlans } from "./features/extension/plan.js";
import { defaultDivebellCliUpdater } from "./features/update/default.js";
import { validateCliUpdater } from "./features/update/manager.js";
import type { DivebellCliUpdater } from "./features/update/types.js";
import { CLI_VERSION, isCliVersionRequest } from "./version.js";
import type {
  CliRunOptions,
  CreateDivebellCliOptions,
  DivebellCli,
  DivebellExtensionCommand,
  DivebellExtensionDefinition,
  DivebellCliWithExternalExtensions
} from "./types/cli.js";

export const cliPackageInfo = createPackageInfo("@divebell/cli", "agent command line");

export function getCliCommandName(): "divebell" {
  return "divebell";
}

export function createDivebellCli(options: CreateDivebellCliOptions = {}): DivebellCli {
  const updater = resolveCliUpdater(options);
  const extensions = (options.extensions ?? []).map((extension) => validateExtension(extension));
  const extensionRegistry = createExtensionRegistry(extensions);
  const commandRegistry = createCommandRegistry(extensions);
  const hookPlans = createExtensionHookPlans(extensions);
  const commandReferences = [
    ...cliCommandReferences.filter((reference) =>
      updater !== undefined || !reference.usage.startsWith("divebell update")
    ),
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
    extensionLoadRecords: options.extensionLoadRecords ?? createInternalExtensionRecords(extensions),
    ...(updater === undefined ? {} : { updater })
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

function resolveCliUpdater(options: CreateDivebellCliOptions): DivebellCliUpdater | undefined {
  if (options.updater === false) return undefined;
  if (options.updater !== undefined) return validateCliUpdater(options.updater);
  return options.packageInfo === undefined
    ? defaultDivebellCliUpdater
    : undefined;
}

function createExtensionRegistry(
  extensions: readonly DivebellExtensionDefinition[]
): Map<string, DivebellExtensionDefinition> {
  const registry = new Map<string, DivebellExtensionDefinition>();
  for (const extension of extensions) {
    if (registry.has(extension.name)) {
      throw new Error(`Extension "${extension.name}" is registered more than once.`);
    }
    registry.set(extension.name, extension);
  }
  for (const extension of registry.values()) {
    const missing = extension.requires?.find((name) => !registry.has(name));
    if (missing !== undefined) {
      throw new Error(
        `Extension "${extension.name}" requires Extension "${missing}", but it is not installed or loaded.`
      );
    }
  }
  return registry;
}

export const defaultDivebellCli = createDivebellCli();

export async function runCli(argv = process.argv.slice(2), options: CliRunOptions = {}): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  if (isCliVersionRequest(parseCliArgs(argv))) {
    stdout.write(`${CLI_VERSION}\n`);
    return 0;
  }

  const stderr = options.stderr ?? process.stderr;
  const loaded = await createDivebellCliWithExternalExtensions();
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

export async function createDivebellCliWithExternalExtensions(
  options: CreateDivebellCliOptions = {},
  env: NodeJS.ProcessEnv = process.env
): Promise<DivebellCliWithExternalExtensions> {
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
  const resolvedExternal = resolveExternalExtensionDependencies(
    internalExtensions,
    external.extensions,
    external.records
  );
  const extensionLoadRecords = [
    ...createInternalExtensionRecords(internalExtensions),
    ...resolvedExternal.records
  ];
  return {
    cli: createDivebellCli({
      ...options,
      extensions: [
        ...internalExtensions,
        ...resolvedExternal.extensions
      ],
      extensionLoadRecords
    }),
    extensionLoadRecords
  };
}

function resolveExternalExtensionDependencies(
  internalExtensions: readonly DivebellExtensionDefinition[],
  externalExtensions: readonly DivebellExtensionDefinition[],
  records: readonly ExtensionLoadRecord[]
): {
  extensions: DivebellExtensionDefinition[];
  records: ExtensionLoadRecord[];
} {
  const available = new Map(
    [...internalExtensions, ...externalExtensions].map((extension) => [
      extension.name,
      extension
    ])
  );
  const unavailable = new Map<string, string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const extension of externalExtensions) {
      if (!available.has(extension.name)) continue;
      const missing = extension.requires?.find((name) => !available.has(name));
      if (missing === undefined) continue;
      available.delete(extension.name);
      unavailable.set(
        extension.name,
        `Extension "${extension.name}" requires Extension "${missing}", but it is not installed or loaded.`
      );
      changed = true;
    }
  }
  return {
    extensions: externalExtensions.filter((extension) => available.has(extension.name)),
    records: records.map((record) => {
      const reason = unavailable.get(record.name);
      return reason === undefined || record.status !== "loaded"
        ? record
        : {
            ...record,
            status: "skipped",
            reason
          };
    })
  };
}

function createCommandRegistry(extensions: readonly DivebellExtensionDefinition[]): Map<string, {
  extension: DivebellExtensionDefinition;
  command: DivebellExtensionCommand;
}> {
  const registry = new Map<string, {
    extension: DivebellExtensionDefinition;
    command: DivebellExtensionCommand;
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

function createCommandSkillReferences(command: DivebellExtensionCommand): CliCommandSkillReference[] {
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
  return `Skipped external Divebell extension ${location}: ${reason}\n`;
}
