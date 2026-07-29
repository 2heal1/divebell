import type { DivebellExtensionDefinition } from "@divebell/cli";

const extension = {
  schemaVersion: 1,
  name: "memory",
  commands: [{
    name: "memory",
    commandReferences: [
      {
        category: "Extensions",
        usage: "divebell memory <metrics|status|sampling start|sampling stop|snapshot|cancel> [path] [options]",
        description: "Capture memory metrics, allocation profiles, or snapshots from the current page."
      },
      {
        category: "Extensions",
        usage: "divebell memory check --url <url> --scenario <path> [--warmup <n>] [--iterations <n>] [--artifact-dir <dir>] [--ui]",
        description: "Run a memory scenario with warmup, repeated operations, metrics, allocation capture, and before-and-after snapshots."
      }
    ],
    run: async (options) => await (await import("./index.js")).runMemoryCliCommand(options)
  }]
} satisfies DivebellExtensionDefinition;

export default extension;
