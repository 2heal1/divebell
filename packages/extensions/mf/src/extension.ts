import type {
  DivebellExtensionDefinition,
  ParsedCliArgs
} from "@divebell/cli";
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
      presentation: {
        kind: "text",
        when: usesModulePerformanceTimelineView,
        render: async (result, presentationOptions) =>
          (await import("./module-performance/format.js"))
            .formatModulePerformanceReportTimeline(result, {
              ...(presentationOptions.columns === undefined
                ? {}
                : { columns: presentationOptions.columns })
            })
      },
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

function usesModulePerformanceTimelineView(args: ParsedCliArgs): boolean {
  const segments = args.command.slice(1);
  const modulePerformance = segments[0] === "module-perf" || (
    segments[0] === "module" && segments[1] === "perf"
  );
  return modulePerformance && args.options.get("view")?.at(-1) === "timeline";
}

const extension = createMfExtension();

export default extension;
