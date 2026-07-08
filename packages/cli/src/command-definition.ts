import type { CliCommandReference, CliExampleReference } from "./help.js";
import type { CliExtensionRunOptions } from "./index.js";

export const OPENRUNTIME_COMMAND_SCHEMA_VERSION = 1;

export interface OpenRuntimeCommandDefinition {
  schemaVersion: typeof OPENRUNTIME_COMMAND_SCHEMA_VERSION;
  name: string;
  displayName?: string;
  description?: string;
  commandReferences?: readonly CliCommandReference[];
  exampleReferences?: readonly CliExampleReference[];
  run(options: CliExtensionRunOptions): Promise<number>;
}

export interface ValidateCommandOptions {
  path?: string;
}

export function defineCommand(command: OpenRuntimeCommandDefinition): OpenRuntimeCommandDefinition {
  return validateCommand(command);
}

export function validateCommand(value: unknown, options: ValidateCommandOptions = {}): OpenRuntimeCommandDefinition {
  if (typeof value !== "object" || value === null) {
    throw new Error(createValidationMessage("Command must default-export an object.", options));
  }

  const candidate = value as Partial<OpenRuntimeCommandDefinition>;
  if (candidate.schemaVersion !== OPENRUNTIME_COMMAND_SCHEMA_VERSION) {
    throw new Error(`Command schemaVersion must be ${OPENRUNTIME_COMMAND_SCHEMA_VERSION}.`);
  }
  if (typeof candidate.name !== "string" || candidate.name.length === 0) {
    throw new Error("Command name must be a non-empty string.");
  }
  if (!/^[a-z][a-z0-9-]*$/.test(candidate.name)) {
    throw new Error(`Command name "${candidate.name}" must match /^[a-z][a-z0-9-]*$/.`);
  }
  if (typeof candidate.run !== "function") {
    throw new Error(`Command "${candidate.name}" must export a run(options) function.`);
  }
  if (candidate.commandReferences !== undefined && !Array.isArray(candidate.commandReferences)) {
    throw new Error(`Command "${candidate.name}" commandReferences must be an array.`);
  }
  if (candidate.exampleReferences !== undefined && !Array.isArray(candidate.exampleReferences)) {
    throw new Error(`Command "${candidate.name}" exampleReferences must be an array.`);
  }

  return {
    schemaVersion: candidate.schemaVersion,
    name: candidate.name,
    ...(candidate.displayName === undefined ? {} : { displayName: candidate.displayName }),
    ...(candidate.description === undefined ? {} : { description: candidate.description }),
    ...(candidate.commandReferences === undefined ? {} : { commandReferences: candidate.commandReferences }),
    ...(candidate.exampleReferences === undefined ? {} : { exampleReferences: candidate.exampleReferences }),
    run: async (runOptions) => await candidate.run!(runOptions)
  };
}

function createValidationMessage(message: string, options: ValidateCommandOptions): string {
  return options.path === undefined ? message : `${message} ${options.path}`;
}
