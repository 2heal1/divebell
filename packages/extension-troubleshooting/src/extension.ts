import type { OpenRuntimeExtensionDefinition } from "@openruntime/cli";

const extension = {
  schemaVersion: 1,
  name: "verify",
  commands: [{
    name: "verify",
    commandReferences: [{
      category: "Extensions",
      usage: "openruntime verify [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] <target-id> <status> [--where <path=value>] [--timeout <ms>] [--next]",
      description: "Verify a business target; framework targets such as Modern, MF, and Garfish are supporting evidence only."
    }],
    run: async (options) => await (await import("./index.js")).runVerifyCliCommand(options)
  }]
} satisfies OpenRuntimeExtensionDefinition;

export default extension;
