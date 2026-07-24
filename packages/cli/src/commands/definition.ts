import { validateCommandSkill } from "./skill.js";
import type {
  OpenRuntimeExtensionCommand,
  OpenRuntimeExtensionContext,
  OpenRuntimeExtensionContextValue,
  OpenRuntimeExtensionDefinition,
  OpenRuntimeExtensionHooks,
  ValidateExtensionOptions
} from "../types/commands.js";

export type {
  OpenRuntimeExtensionCommand,
  OpenRuntimeExtensionContext,
  OpenRuntimeExtensionContextValue,
  OpenRuntimeExtensionDefinition,
  OpenRuntimeExtensionHooks,
  ValidateExtensionOptions
} from "../types/commands.js";

export const OPENRUNTIME_EXTENSION_SCHEMA_VERSION = 1;

export function defineExtension(extension: OpenRuntimeExtensionDefinition): OpenRuntimeExtensionDefinition {
  return validateExtension(extension);
}

export function validateExtension(
  value: unknown,
  options: ValidateExtensionOptions = {}
): OpenRuntimeExtensionDefinition {
  if (!isRecord(value)) {
    throw new Error(createValidationMessage("Extension must default-export an object.", options));
  }
  if (value.schemaVersion !== OPENRUNTIME_EXTENSION_SCHEMA_VERSION) {
    throw new Error(`Extension schemaVersion must be ${OPENRUNTIME_EXTENSION_SCHEMA_VERSION}.`);
  }
  const name = validateName(value.name, "Extension");
  const commands = validateCommands(value.commands, name);
  const hooks = validateHooks(value.hooks, name);
  if (commands.length === 0 && hooks === undefined) {
    throw new Error(`Extension "${name}" must provide at least one command or hook.`);
  }

  return {
    schemaVersion: 1,
    name,
    ...(typeof value.displayName === "string" ? { displayName: value.displayName } : {}),
    ...(typeof value.description === "string" ? { description: value.description } : {}),
    ...(commands.length === 0 ? {} : { commands }),
    ...(hooks === undefined ? {} : { hooks })
  };
}

function validateCommands(value: unknown, extensionName: string): OpenRuntimeExtensionCommand[] {
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
    return {
      name,
      ...(skill === undefined ? {} : { skill }),
      ...(commandReferences === undefined ? {} : {
        commandReferences: commandReferences as NonNullable<OpenRuntimeExtensionCommand["commandReferences"]>
      }),
      run: async (runOptions) => await run(runOptions)
    };
  });
}

function validateHooks(value: unknown, extensionName: string): OpenRuntimeExtensionHooks | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error(`Extension "${extensionName}" hooks must be an object.`);
  }
  const supported = new Set(["open", "detectStack", "close"]);
  for (const name of Object.keys(value)) {
    if (!supported.has(name)) {
      throw new Error(`Extension "${extensionName}" declares unsupported hook "${name}".`);
    }
    if (typeof value[name] !== "function") {
      throw new Error(`Extension "${extensionName}" hook "${name}" must be a function.`);
    }
  }
  if (Object.keys(value).length === 0) {
    throw new Error(`Extension "${extensionName}" hooks must not be empty.`);
  }
  return value as unknown as OpenRuntimeExtensionHooks;
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
