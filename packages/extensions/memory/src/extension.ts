import type { DivebellExtensionDefinition } from "@divebell/cli";
import { fileURLToPath } from "node:url";

const memorySkillPath = fileURLToPath(
  new URL("../skills/analyze-memory-growth/SKILL.md", import.meta.url)
);

const extension = {
  schemaVersion: 1,
  name: "memory",
  commands: [{
    name: "memory",
    skill: {
      path: memorySkillPath
    },
    commandReferences: [
      {
        category: "Extensions",
        usage: "divebell memory <metrics|status|sampling start|sampling stop|snapshot|cancel> [path] [options]",
        description: "Capture memory metrics, allocation profiles, or snapshots from the current page."
      },
      {
        category: "Extensions",
        usage: "divebell memory check --scenario <path> [--warmup <n>] [--iterations <n>] [--artifact-dir <dir>]",
        description: "Run a memory scenario against the current page with warmup, repeated operations, metrics, allocation capture, and before-and-after snapshots."
      }
    ],
    run: async (options) => await (await import("./index.js")).runMemoryCliCommand(options)
  }]
} satisfies DivebellExtensionDefinition;

export default extension;
