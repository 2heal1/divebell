import type { OpenRuntimeExtensionDefinition } from "@openruntime/cli";

const extension = {
  schemaVersion: 1,
  name: "record",
  commands: [{
    name: "record",
    commandReferences: [
      {
        category: "Extensions",
        usage: "openruntime record --out <path> [--duration <ms>] [--interval <ms>]",
        description: "Record the current OpenRuntime page for a fixed duration and create an .orrec package."
      },
      {
        category: "Extensions",
        usage: "openruntime record start [--out <path>] [--interval <ms>] [--mic]",
        description: "Prepare a manual recording before the next openruntime open; write under ./recordings when out is omitted."
      },
      {
        category: "Extensions",
        usage: "openruntime record stop --out <path> [--script-out <path>] [--no-script]",
        description: "Stop a manual recording on the current page, capture final evidence, and draft a script by default."
      },
      {
        category: "Extensions",
        usage: "openruntime record generate-script --input <path> [--out <path>]",
        description: "Regenerate a JavaScript script draft from an existing .orrec recording."
      },
      {
        category: "Extensions",
        usage: "openruntime record transcribe --input <path> [--audio <path>] [--model <model>] [--api-key <key>]",
        description: "Transcribe microphone audio from an .orrec recording into timestamped text."
      }
    ],
    run: async (options) => await (await import("./index.js")).runRecordCliCommand(options)
  }],
  hooks: {
    open: async (options) => await (await import("./open.js")).runRecordingOpenHook(options)
  }
} satisfies OpenRuntimeExtensionDefinition;

export default extension;
