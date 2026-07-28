import type { DivebellExtensionDefinition } from "@divebell/cli";

import { implementedMfCommandMetadata } from "./commands/metadata.js";

const extension = {
  schemaVersion: 1,
  name: "mf",
  displayName: "Module Federation",
  description: "Inspect safe Module Federation observability state from the current page.",
  commands: [{
    name: "mf",
    commandReferences: implementedMfCommandMetadata.map((command) => ({
      category: "External Extensions" as const,
      usage: command.usage,
      description: command.description
    })),
    run: async (options) => await (await import("./index.js")).runMfCommand(options)
  }],
  hooks: {
    open: async ({ args }) =>
      await (await import("./open.js")).openMfObservability(args)
  }
} satisfies DivebellExtensionDefinition;

export default extension;
