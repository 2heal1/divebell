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
        usage: "divebell code-usage analyze --chunk-map <path> --coverage <path> [--coverage <path>...] [--experience <path>...] [--assets <dir>] [--output <report.json>]",
        description: "Analyze actual chunk, source file, and dependency usage from a Chunk Map, build assets, and page coverage."
      },
      {
        category: "Extensions",
        usage: "divebell code-usage experience --output <path> --label <name> [--ready-target <name>] [--settle-ms <ms>]",
        description: "Save page readiness and JavaScript memory measurements from a page opened with --code-usage-experience."
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
    run: async (options) => await (await import("./index.js")).runCodeUsageCommand(options)
  }],
  hooks: {
    open: async ({ args }) =>
      (await import("./experience.js")).openCodeUsageExperience(args)
  }
} satisfies DivebellExtensionDefinition;

export default extension;
