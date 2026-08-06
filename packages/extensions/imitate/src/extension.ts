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
        usage: "divebell record stop --out <path>",
        description: "Stop a manual recording, capture final evidence, and create a reviewable workflow draft."
      },
      {
        category: "Extensions",
        usage: "divebell record review --input <path>",
        description: "Show authentication setup, concrete commands, element evidence, and confirmation state for a workflow draft."
      },
      {
        category: "Extensions",
        usage: "divebell record confirm --input <path> (--step <id> | --through <id> | --all) [--no-script]",
        description: "Confirm reviewed setup or steps and generate the replay only after the complete workflow is confirmed."
      },
      {
        category: "Extensions",
        usage: "divebell record remove-step --input <path> --step <id>",
        description: "Remove an unwanted step from the workflow draft and invalidate any earlier generated replay."
      },
      {
        category: "Extensions",
        usage: "divebell record amend <start|replay|stop|cancel> --input <path> [--after <step-id>]",
        description: "Replay a confirmed prefix, capture only missing actions, and insert them as element-confirmation proposals."
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
    run: async (options) => await (await import("./index.js")).runRecordCliCommand(options)
  }],
  hooks: {
    open: async (options) => await (await import("./open.js")).runRecordingOpenHook(options)
  }
} satisfies DivebellExtensionDefinition;

export default extension;
