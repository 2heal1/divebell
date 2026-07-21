import type { CliCommandReference } from "../types/commands.js";
export type { CliCommandReference } from "../types/commands.js";

export const cliCommandReferences: CliCommandReference[] = [
  {
    category: "Extensions",
    usage: "openruntime extensions add <npm-package> [--extensions-dir <path>]",
    description: "Download, validate, and install an OpenRuntime extension package with no runtime dependencies."
  },
  {
    category: "Extensions",
    usage: "openruntime extensions list [--extensions-dir <path>]",
    description: "List installed OpenRuntime extension packages, commands, and hooks."
  },
  {
    category: "Extensions",
    usage: "openruntime extensions update <package> [--extensions-dir <path>]",
    description: "Download and activate the latest extension package version; keep the current version if the update fails."
  },
  {
    category: "Extensions",
    usage: "openruntime extensions remove <package> [--extensions-dir <path>]",
    description: "Uninstall the specified extension package."
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime start [--port <port>]",
    description: "Explicitly start or reuse the CLI-managed Bridge. Most commands prepare it automatically."
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime stop [--port <port>]",
    description: "Close the browser session, then stop the CLI-managed Bridge."
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime auth export <url> [--output <path>] [--timeout <ms>] [--extension-dir <path>] [--extension-install-url <url>]",
    description: "Export login state for a site to a file through the Chrome Auth Connector; create a temporary file when --output is omitted."
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime auth import <path>",
    description: "Import browser login state from a file for later OpenRuntime pages."
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime auth list",
    description: "List sites imported into the current OpenRuntime browser profile."
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime auth clear [--url <url>]",
    description: "Clear the current OpenRuntime browser profile, or only the site matched by --url."
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime open <url> [--bridge <url>] [--port <port>] [--session <id>] [--no-bridge] [--ui]",
    description: "Open a page and connect its runtimes through the Bridge by default; use --ui for a visible browser or --no-bridge to skip connection."
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime stack [--refresh]",
    description: "Run stack detectors from installed extensions and summarize matches for the current page."
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime page-snapshot",
    description: "Read the current page snapshot, including actionable element references."
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime click <ref|selector|text>",
    description: "Click an element by page reference, selector, or visible text."
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime fill <ref|selector> <value>",
    description: "Fill an input by page reference or selector."
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime eval <script>",
    description: "Run a script in the page, or load one from --file <path>."
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime wait-eval <script> [--timeout <ms>]",
    description: "Poll a page expression until it returns true."
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime get-window <path>",
    description: "Read a dotted path from window/globalThis, such as gf_data_v1."
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime screenshot [name] [--full-page]",
    description: "Capture a screenshot through the OpenRuntime browser layer."
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime network [--url <query>]",
    description: "List network requests from the current page and optionally filter them by URL text."
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime console [--level <level>] [--query <keyword>] [--limit <n>]",
    description: "Read browser console logs as a fallback; prefer snapshot --query for structured verification and troubleshooting."
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime coverage <status|start|take|stop|cancel> [path] [--label <name>] [--max-size <bytes>]",
    description: "Capture code executed by the current page in stages to identify loaded but unused application and third-party code."
  },
  {
    category: "Runtime",
    usage: "openruntime runtimes [--bridge <url>]",
    description: "List runtimes connected to the Bridge, starting a local Bridge automatically when needed."
  },
  {
    category: "Runtime",
    usage: "openruntime targets [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--id <id>] [--type <type>] [--source <source>] [--status <status>] [--query <keyword>]",
    description: "Read target definitions registered by the selected runtime."
  },
  {
    category: "Runtime",
    usage: "openruntime snapshot [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--id <id>] [--type <type>] [--source <source>] [--status <status>] [--query <keyword>]",
    description: "Read the current snapshot state from the selected runtime."
  },
  {
    category: "Runtime",
    usage: "openruntime events [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--target-id <id>] [--type <type>] [--source <source>] [--status <status>] [--action <name>] [--since <event-id>] [--limit <n>] [--query <keyword>]",
    description: "Read runtime event history."
  },
  {
    category: "Runtime",
    usage: "openruntime actions [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--name <name>] [--source <source>] [--risk <risk>] [--enabled <true|false>] [--query <keyword>]",
    description: "List runtime actions declared by the page."
  },
  {
    category: "Runtime",
    usage: "openruntime input-options [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] --action <name> --input <name> [--payload <json>] [--timeout <ms>]",
    description: "Read dynamic choices for an action input."
  },
  {
    category: "Runtime",
    usage: "openruntime run-action [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] <action-name> [--payload <json>]",
    description: "Run a runtime action declared by the page."
  },
  {
    category: "Runtime",
    usage: "openruntime wait-for [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] <target-id> <status> [--where <path=value>] [--timeout <ms>] [--strict] [--next]",
    description: "Wait for a target to reach a status; --where values are parsed as JSON literals and can match numbers, booleans, or null."
  }
];

import type { CliReferenceCollection } from "../types/commands.js";
export type { CliCommandSkillReference, CliReferenceCollection } from "../types/commands.js";

export function createHelpText(references: CliReferenceCollection = {}): string {
  const commandReferences = references.commandReferences ?? cliCommandReferences;
  const commandSkillReferences = references.commandSkillReferences ?? [];
  const categories: CliCommandReference["category"][] = ["Bridge and Browser", "Runtime", "Extensions", "External Extensions"];
  const commandLines = categories.flatMap((category) => {
    const commands = commandReferences.filter((command) => command.category === category);
    if (commands.length === 0) return [];
    const skillCommands = commandSkillReferences
      .filter((reference) => reference.category === category)
      .map((reference) => reference.command);
    return [
      "",
      `${category}:`,
      ...commands.map((command) => `  ${command.usage} - ${command.description}`),
      ...(skillCommands.length === 0 ? [] : [
        "",
        `  Skill: available for ${skillCommands.join(", ")}.`,
        "  Skill usage: `openruntime <command> --skill`"
      ])
    ];
  });

  return [
    "Usage:",
    ...commandLines
  ].join("\n");
}

export function createCliReferenceMarkdown(references: CliReferenceCollection = {}): string {
  const commandReferences = references.commandReferences ?? cliCommandReferences;
  const categories: CliCommandReference["category"][] = ["Bridge and Browser", "Runtime", "Extensions", "External Extensions"];
  const categoryLabels: Record<CliCommandReference["category"], string> = {
    "Bridge and Browser": "Bridge and Browser",
    Runtime: "Runtime",
    Extensions: "Extensions",
    "External Extensions": "External Extensions"
  };
  const lines = [
    "# OpenRuntime CLI Reference",
    "",
    "<!-- This file is generated by scripts/sync-openruntime-cli-docs.mjs. Do not edit by hand. -->",
    "",
    "This document is generated from the current CLI command table in `packages/cli/src/commands/help.ts`.",
    "",
    "## Binaries",
    "",
    "- `openruntime`",
    "- `opr`",
    "",
    "## Commands"
  ];

  for (const category of categories) {
    const categoryCommands = commandReferences.filter((item) => item.category === category);
    if (categoryCommands.length === 0) continue;
    lines.push("", `### ${categoryLabels[category]}`, "");
    for (const command of categoryCommands) {
      lines.push(`- \`${command.usage}\` - ${command.description}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
