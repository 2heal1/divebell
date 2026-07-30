import type { DivebellExtensionDefinition } from "@divebell/cli";

const extension = {
  schemaVersion: 1,
  name: "verify",
  commands: [{
    name: "verify",
    commandReferences: [{
      category: "Extensions",
      usage: "divebell verify [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] <target-id> <status> [--where <path=value>] [--timeout <ms>] [--next]",
      description: "Verify a business target; framework targets such as Modern, MF, and Garfish are supporting evidence only."
    }],
    run: async (options) => await options.withLoading(async () =>
      await (await import("./index.js")).runVerifyCliCommand(options)
    )
  }]
} satisfies DivebellExtensionDefinition;

export default extension;
