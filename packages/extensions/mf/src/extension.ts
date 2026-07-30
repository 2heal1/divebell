import type { DivebellExtensionDefinition } from "@divebell/cli";

import { createMfCommandMetadata } from "./commands/metadata.js";

export interface CreateMfExtensionOptions {
  name?: string;
  commandName?: string;
  displayName?: string;
  description?: string;
}

export function createMfExtension(
  options: CreateMfExtensionOptions = {}
): DivebellExtensionDefinition {
  const commandName = options.commandName ?? "mf";
  return {
    schemaVersion: 1,
    name: options.name ?? commandName,
    displayName: options.displayName ?? "Module Federation",
    description: options.description ??
      "Inspect Module Federation state. MF commands require the page to be opened with `divebell open <url> --mf`.",
    commands: [{
      name: commandName,
      commandReferences: createMfCommandMetadata(commandName).map((command) => ({
        category: "External Extensions" as const,
        usage: command.usage,
        description: command.description
      })),
      run: async (runOptions) => await runOptions.withLoading(async () =>
        await (await import("./index.js")).runMfCommand(runOptions)
      )
    }],
    hooks: {
      open: async ({ args }) =>
        await (await import("./open.js")).openMfObservability(args),
      detectStack: async ({ divebell }) =>
        await (await import("./detect-stack.js")).detectMfStack(
          divebell,
          commandName
        )
    }
  };
}

const extension = createMfExtension();

export default extension;
