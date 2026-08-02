import type { DivebellExtensionDefinition } from "@divebell/cli";
import { fileURLToPath } from "node:url";

import { createMfCommandMetadata } from "./commands/metadata.js";

const mfSkillPath = fileURLToPath(
  new URL("../skills/inspect-module-federation/SKILL.md", import.meta.url)
);

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
      skill: {
        path: mfSkillPath
      },
      commandReferences: createMfCommandMetadata(commandName).map((command) => ({
        category: "External Extensions" as const,
        usage: command.usage,
        description: command.description
      })),
      run: async (runOptions) =>
        await (await import("./index.js")).runMfCommand(runOptions)
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
