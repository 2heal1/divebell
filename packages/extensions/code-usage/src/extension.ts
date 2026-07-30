import type { DivebellExtensionDefinition } from "@divebell/cli";
import { fileURLToPath } from "node:url";

const codeUsageSkillPath = fileURLToPath(
  new URL("../skills/analyze-code-usage/SKILL.md", import.meta.url)
);

const extension = {
  schemaVersion: 1,
  name: "code-usage",
  commands: [{
    name: "code-usage",
    skill: {
      path: codeUsageSkillPath
    },
    commandReferences: [
      {
        category: "Extensions",
        usage: "divebell code-usage analyze --chunk-map <path> --coverage <path> [--coverage <path>...] [--assets <dir>] [--output <report.json>]",
        description: "Analyze actual chunk, source file, and dependency usage from a Chunk Map, build assets, and page coverage."
      },
      {
        category: "Extensions",
        usage: "divebell code-usage report <report.json> [--output <report.html>] [--no-open]",
        description: "Generate and open an interactive code-usage report; use --no-open to create the file only."
      },
      {
        category: "Extensions",
        usage: "divebell code-usage serve <report.json> [--port <port>]",
        description: "Start a local streaming report server for page experience and code-usage data."
      }
    ],
    run: async (options) => await options.withLoading(async () =>
      await (await import("./index.js")).runCodeUsageCommand(options)
    )
  }]
} satisfies DivebellExtensionDefinition;

export default extension;
