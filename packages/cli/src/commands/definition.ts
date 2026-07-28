import { validateCommandSkill } from "./skill.js";
import type {
  DivebellExtensionCommand,
  DivebellExtensionDefinition,
  DivebellExtensionHooks,
  ValidateExtensionOptions
} from "../types/commands.js";

export type {
  CliExtensionRunFunction,
  CliExtensionRunOptionScalar,
  CliExtensionRunOptionValue,
  CliExtensionRunOptions,
  CliExtensionRunRequest,
  DivebellExtensionCommand,
  DivebellCloseHook,
  DivebellDetectStackHook,
  DivebellExtensionDefinition,
  DivebellExtensionHooks,
  DivebellOpenHook,
  DivebellOrderedHook,
  ValidateExtensionOptions
} from "../types/commands.js";

export const DIVEBELL_EXTENSION_SCHEMA_VERSION = 1;

export function defineExtension(extension: DivebellExtensionDefinition): DivebellExtensionDefinition {
  return validateExtension(extension);
}

export function validateExtension(
  value: unknown,
  options: ValidateExtensionOptions = {}
): DivebellExtensionDefinition {
  if (!isRecord(value)) {
    throw new Error(createValidationMessage("Extension must default-export an object.", options));
  }
  if (value.schemaVersion !== DIVEBELL_EXTENSION_SCHEMA_VERSION) {
    throw new Error(`Extension schemaVersion must be ${DIVEBELL_EXTENSION_SCHEMA_VERSION}.`);
  }
  const name = validateName(value.name, "Extension");
  const requires = validateExtensionReferences(
    value.requires,
    name,
    `Extension "${name}" requires`
  );
  const commands = validateCommands(value.commands, name);
  const hooks = validateHooks(value.hooks, name);
  if (hooks?.open === undefined) {
    const command = commands.find((candidate) => candidate.requiresOpenHook === true);
    if (command !== undefined) {
      throw new Error(
        `Command "${command.name}" requires its Extension open hook, but Extension "${name}" does not declare one.`
      );
    }
  }
  if (commands.length === 0 && hooks === undefined) {
    throw new Error(`Extension "${name}" must provide at least one command or hook.`);
  }

  return {
    schemaVersion: 1,
    name,
    ...(requires.length === 0 ? {} : { requires }),
    ...(typeof value.displayName === "string" ? { displayName: value.displayName } : {}),
    ...(typeof value.description === "string" ? { description: value.description } : {}),
    ...(commands.length === 0 ? {} : { commands }),
    ...(hooks === undefined ? {} : { hooks })
  };
}

function validateCommands(value: unknown, extensionName: string): DivebellExtensionCommand[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`Extension "${extensionName}" commands must be an array.`);
  }
  const names = new Set<string>();
  return value.map((candidate) => {
    if (!isRecord(candidate)) {
      throw new Error(`Extension "${extensionName}" command must be an object.`);
    }
    const name = validateName(candidate.name, "Command");
    if (names.has(name)) {
      throw new Error(`Extension "${extensionName}" declares command "${name}" more than once.`);
    }
    names.add(name);
    const run = candidate.run;
    if (typeof run !== "function") {
      throw new Error(`Command "${name}" must provide a run(options) function.`);
    }
    const commandReferences = candidate.commandReferences;
    if (commandReferences !== undefined && !Array.isArray(commandReferences)) {
      throw new Error(`Command "${name}" commandReferences must be an array.`);
    }
    const skill = candidate.skill === undefined
      ? undefined
      : validateCommandSkill(candidate.skill, name);
    if (candidate.requiresOpenHook !== undefined && typeof candidate.requiresOpenHook !== "boolean") {
      throw new Error(`Command "${name}" requiresOpenHook must be a boolean.`);
    }
    return {
      name,
      ...(candidate.requiresOpenHook === true ? { requiresOpenHook: true } : {}),
      ...(skill === undefined ? {} : { skill }),
      ...(commandReferences === undefined ? {} : {
        commandReferences: commandReferences as NonNullable<DivebellExtensionCommand["commandReferences"]>
      }),
      run: async (runOptions) => await run(runOptions)
    };
  });
}

function validateHooks(value: unknown, extensionName: string): DivebellExtensionHooks | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error(`Extension "${extensionName}" hooks must be an object.`);
  }
  const supported = new Set(["open", "detectStack", "close"]);
  for (const name of Object.keys(value)) {
    if (!supported.has(name)) {
      throw new Error(`Extension "${extensionName}" declares unsupported hook "${name}".`);
    }
  }
  if (Object.keys(value).length === 0) {
    throw new Error(`Extension "${extensionName}" hooks must not be empty.`);
  }
  const open = validateOrderedHook(value.open, extensionName, "open");
  const detectStack = validateOrderedHook(value.detectStack, extensionName, "detectStack");
  const close = value.close;
  if (close !== undefined && typeof close !== "function") {
    throw new Error(`Extension "${extensionName}" hook "close" must be a function.`);
  }
  return {
    ...(open === undefined ? {} : { open: open as NonNullable<DivebellExtensionHooks["open"]> }),
    ...(detectStack === undefined
      ? {}
      : { detectStack: detectStack as NonNullable<DivebellExtensionHooks["detectStack"]> }),
    ...(close === undefined ? {} : { close: close as NonNullable<DivebellExtensionHooks["close"]> })
  };
}

function validateOrderedHook(
  value: unknown,
  extensionName: string,
  hookName: "open" | "detectStack"
): unknown {
  if (value === undefined || typeof value === "function") return value;
  if (!isRecord(value)) {
    throw new Error(
      `Extension "${extensionName}" hook "${hookName}" must be a function or an ordered hook object.`
    );
  }
  const supported = new Set(["run", "before", "after"]);
  for (const name of Object.keys(value)) {
    if (!supported.has(name)) {
      throw new Error(
        `Extension "${extensionName}" hook "${hookName}" declares unsupported field "${name}".`
      );
    }
  }
  if (typeof value.run !== "function") {
    throw new Error(`Extension "${extensionName}" hook "${hookName}" must provide a run(options) function.`);
  }
  const before = validateExtensionReferences(
    value.before,
    extensionName,
    `Extension "${extensionName}" hook "${hookName}" before`
  );
  const after = validateExtensionReferences(
    value.after,
    extensionName,
    `Extension "${extensionName}" hook "${hookName}" after`
  );
  const beforeSet = new Set(before);
  for (const dependency of after) {
    if (beforeSet.has(dependency)) {
      throw new Error(
        `Extension "${extensionName}" hook "${hookName}" cannot run both before and after "${dependency}".`
      );
    }
  }
  return {
    run: value.run,
    ...(before.length === 0 ? {} : { before }),
    ...(after.length === 0 ? {} : { after })
  };
}

function validateExtensionReferences(
  value: unknown,
  extensionName: string,
  label: string
): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  const references: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    const reference = validateName(candidate, "Extension");
    if (reference === extensionName) {
      throw new Error(`${label} must not reference its own Extension "${extensionName}".`);
    }
    if (seen.has(reference)) {
      throw new Error(`${label} declares Extension "${reference}" more than once.`);
    }
    seen.add(reference);
    references.push(reference);
  }
  return references;
}

function validateName(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} name must be a non-empty string.`);
  }
  if (!/^[a-z][a-z0-9-]*$/.test(value)) {
    throw new Error(`${label} name "${value}" must match /^[a-z][a-z0-9-]*$/`);
  }
  return value;
}

function createValidationMessage(message: string, options: ValidateExtensionOptions): string {
  return options.path === undefined ? message : `${message} ${options.path}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
