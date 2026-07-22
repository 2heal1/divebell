import type { OpenRuntimeExtensionDefinition } from "@openruntime/cli";

const extension = {
  schemaVersion: 1,
  name: "mf",
  displayName: "Module Federation",
  description: "Inspect safe Module Federation observability state from the current page.",
  commands: [{
    name: "mf",
    commandReferences: [
      {
        category: "External Extensions",
        usage: "openruntime mf status [name] [--role <consumer|producer>] [--instance <ref>] [--json]",
        description: "List or select Module Federation instances from the current page."
      },
      {
        category: "External Extensions",
        usage: "openruntime mf module-info [remote] [--mf <name>] [--instance <ref>] [--json]",
        description: "Inspect a declared or loaded remote in an unambiguous consumer context."
      }
    ],
    run: async (options) => await (await import("./index.js")).runMfCommand(options)
  }],
  hooks: {
    open: async () => await (await import("./open.js")).openMfObservability()
  }
} satisfies OpenRuntimeExtensionDefinition;

export default extension;
