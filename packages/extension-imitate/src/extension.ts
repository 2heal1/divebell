import type { OpenRuntimeExtensionDefinition } from "@openruntime/cli";

const extension = {
  schemaVersion: 1,
  name: "record",
  commands: [{
    name: "record",
    commandReferences: [
      {
        category: "Extensions",
        usage: "openruntime record --url <url> --out <path> [--duration <ms>] [--interval <ms>] [--mic] [--headless] [--no-open]",
        description: "Open a page for a fixed duration and create an .orrec package with page snapshots, DOM, interactions, OpenRuntime state, and optional microphone audio."
      },
      {
        category: "Extensions",
        usage: "openruntime record start [--url <url>] [--out <path>] [--interval <ms>] [--mic] [--headless] [--no-open]",
        description: "Start a manual recording; open a blank page when URL is omitted and write under ./recordings when out is omitted."
      },
      {
        category: "Extensions",
        usage: "openruntime record stop --out <path> [--script-out <path>] [--no-close] [--no-script]",
        description: "Stop a manual recording, capture final interactions and state, then close the browser and draft a script by default."
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
  }]
} satisfies OpenRuntimeExtensionDefinition;

export default extension;
