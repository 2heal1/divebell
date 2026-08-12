import type { DivebellExtensionDefinition } from "@divebell/cli";
import { fileURLToPath } from "node:url";

const skillPath = fileURLToPath(
  new URL("../skills/observe-rstack-hmr/SKILL.md", import.meta.url)
);

const extension = {
  schemaVersion: 1,
  name: "rstack",
  displayName: "Rstack HMR",
  description: "Observe Rspack HMR and React Refresh in the compiled JavaScript loaded by the current Chromium page.",
  commands: [{
    name: "rstack",
    skill: { path: skillPath },
    commandReferences: [
      {
        category: "External Extensions",
        usage: "divebell rstack status",
        description: "Inspect Rspack detection and compact bundler runtime globals from the matched compiled entry script."
      },
      {
        category: "External Extensions",
        usage: "divebell rstack hmr inspect",
        description: "Discover supported Rspack HMR state machines, React Refresh adapters, preflight evidence, and candidate probe plans in the compiled JavaScript loaded by the current page."
      },
      {
        category: "External Extensions",
        usage: "divebell rstack hmr start [--expect applied] [--expect-refresh] [--expect-no-reload] [--state-check <file>] [--verbose]",
        description: "Prepare non-pausing compiled-JavaScript logpoints before changing source code."
      },
      {
        category: "External Extensions",
        usage: "divebell rstack hmr wait [observation-id] [--timeout <ms>] [--verbose]",
        description: "Wait for the ready HMR observation to apply, fail, invalidate, reload, or time out."
      },
      {
        category: "External Extensions",
        usage: "divebell rstack hmr status [observation-id] [--verbose]",
        description: "Read an HMR observation without blocking."
      },
      {
        category: "External Extensions",
        usage: "divebell rstack hmr stop [observation-id]",
        description: "Remove only the logpoints owned by one HMR observation."
      }
    ],
    run: async (options) => await (await import("./index.js")).runRstackCommand(options)
  }],
  hooks: {
    detectStack: async ({ divebell }) =>
      await (await import("./detect-stack.js")).detectRstackStack(
        divebell,
        "rstack"
      )
  }
} satisfies DivebellExtensionDefinition;

export default extension;
