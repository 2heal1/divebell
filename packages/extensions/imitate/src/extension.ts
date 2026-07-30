import type { DivebellExtensionDefinition } from "@divebell/cli";
import { fileURLToPath } from "node:url";

const recordingSkillPath = fileURLToPath(
  new URL("../skills/record-divebell-workflow/SKILL.md", import.meta.url)
);

const extension = {
  schemaVersion: 1,
  name: "record",
  commands: [{
    name: "record",
    skill: {
      path: recordingSkillPath
    },
    commandReferences: [
      {
        category: "Extensions",
        usage: "divebell record --out <path> [--duration <ms>] [--interval <ms>]",
        description: "Record the current Divebell page for a fixed duration and create an .orrec package."
      },
      {
        category: "Extensions",
        usage: "divebell record start [--out <path>] [--interval <ms>]",
        description: "Prepare browser and optional voice capture before the next divebell open; missing or denied audio is ignored."
      },
      {
        category: "Extensions",
        usage: "divebell record stop --out <path> [--script-out <path>] [--no-script]",
        description: "Stop a manual recording, capture final evidence, and generate an executable replay and workflow by default."
      },
      {
        category: "Extensions",
        usage: "divebell record generate-script --input <path> [--out <path>]",
        description: "Regenerate an executable JavaScript replay and Agent-readable workflow from an existing .orrec recording."
      },
      {
        category: "Extensions",
        usage: "divebell record transcribe --input <path> [--audio <path>] [--model <model>] [--api-key <key>]",
        description: "Transcribe microphone audio from an .orrec recording into timestamped text."
      }
    ],
    run: async (options) => await options.withLoading(async () =>
      await (await import("./index.js")).runRecordCliCommand(options)
    )
  }],
  hooks: {
    open: async (options) => await (await import("./open.js")).runRecordingOpenHook(options)
  }
} satisfies DivebellExtensionDefinition;

export default extension;
