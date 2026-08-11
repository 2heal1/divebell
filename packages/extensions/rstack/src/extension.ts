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
  requires: ["mf"],
  commands: [{
    name: "rstack",
    skill: { path: skillPath },
    commandReferences: [
      {
        category: "External Extensions",
        usage: "divebell rstack hmr inspect",
        description: "Discover supported Rspack HMR and React Refresh runtimes in the compiled JavaScript loaded by the current page."
      },
      {
        category: "External Extensions",
        usage: "divebell rstack hmr start [--expect applied] [--expect-refresh] [--expect-no-reload] [--state-check <file>]",
        description: "Arm non-pausing compiled-JavaScript logpoints before changing source code."
      },
      {
        category: "External Extensions",
        usage: "divebell rstack hmr wait [observation-id] [--timeout <ms>] [--verbose]",
        description: "Wait for the armed HMR observation to apply, fail, invalidate, reload, or time out."
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
  }]
} satisfies DivebellExtensionDefinition;

export default extension;
