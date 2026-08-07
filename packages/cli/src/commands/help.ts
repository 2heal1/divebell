import type { CliCommandReference } from "../types/commands.js";
import { browserCommandReferences } from "./browser-help.js";
export type { CliCommandReference } from "../types/commands.js";

export const cliCommandReferences: CliCommandReference[] = [
  {
    category: "Bridge and Browser",
    usage: "divebell setup",
    description: "Prepare Divebell on this machine by checking the environment and repairing browser startup only when needed."
  },
  {
    category: "Extensions",
    usage: "divebell extensions add <package-or-path> [--extensions-dir <path>]",
    description: "Validate and install a Divebell extension with no runtime dependencies from an npm package or local path."
  },
  {
    category: "Extensions",
    usage: "divebell extensions list [--extensions-dir <path>]",
    description: "List installed Divebell extension packages, commands, and hooks."
  },
  {
    category: "Extensions",
    usage: "divebell extensions update <package> [--extensions-dir <path>]",
    description: "Download and activate the latest extension package version; keep the current version if the update fails."
  },
  {
    category: "Extensions",
    usage: "divebell extensions remove <package> [--extensions-dir <path>]",
    description: "Uninstall the specified extension package."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell start [--port <port>]",
    description: "Explicitly start or reuse the CLI-managed Bridge. Most commands prepare it automatically."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell stop [--port <port>]",
    description: "Close the browser session, then stop the CLI-managed Bridge."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell ps",
    description: "List running divebell daemon processes with PID, port, uptime, and associated working directories."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell kill <index|pid|port> [--force]",
    description: "Stop a divebell daemon by ps index, PID, or port number; --force sends SIGKILL instead of SIGTERM."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell kill-all [--force]",
    description: "Stop all running divebell daemon processes tracked by this user."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell profiles",
    description: "List Chrome profiles available to agent-browser."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell state save <path> [--url <url>] [--include-url <url>...]",
    description: "Save agent-browser state; with --url, keep state for that URL plus any repeatable related sign-in URLs."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell state load <path>",
    description: "Load an agent-browser state file into the current browser session."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell state <list|show|rename|clear|clean> [args]",
    description: "Inspect and manage agent-browser saved states."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell auth save <name> --url <url> --username <user> --password-stdin",
    description: "Save encrypted login credentials in the agent-browser auth vault."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell auth login <name>",
    description: "Open the saved login page and let agent-browser fill and submit the matching login form."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell auth <list|show|delete> [name]",
    description: "Inspect or delete agent-browser auth vault entries; passwords are never shown."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell open <url> [--headers <json>] [--profile <name|path>] [--state <path>] [--bridge <url>] [--port <port>] [--session <id>] [--no-bridge] [--ui] [--enable <feature>] [--init-script <path>] [--proxy <url>] [--allowed-domains <list>] [--engine <name>]",
    description: "Open a directory-scoped page with Divebell lifecycle management and supported agent-browser launch options."
  },
  ...browserCommandReferences,
  {
    category: "Bridge and Browser",
    usage: "divebell stack [--refresh]",
    description: "Run stack detectors from installed extensions and summarize matches for the current page."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell page-snapshot [--interactive] [--compact] [--depth <depth>] [--selector <selector>]",
    description: "Read the current page snapshot, including actionable element references."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell click <ref|selector|text>",
    description: "Click an element by page reference, selector, or visible text."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell fill <ref|selector> <value>",
    description: "Fill an input by page reference or selector."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell focus <ref|selector>",
    description: "Focus an element by page reference or selector."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell press <key>",
    description: "Press a keyboard key or shortcut in the currently focused element."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell select <ref|selector> <value...>",
    description: "Select one or more native dropdown options by value or label."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell eval [<script> | --file <path> | --base64 <encoded> | --stdin]",
    description: "Run a script in the page, load one from a file or standard input, or pass base64-encoded JavaScript."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell wait-eval <script> [--timeout <ms>]",
    description: "Poll a page expression until it returns true."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell get-window <path>",
    description: "Read a dotted path from window/globalThis, such as gf_data_v1."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell screenshot [name] [--full-page] [--annotate]",
    description: "Capture a screenshot through the Divebell browser layer."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell network [--url <query>]",
    description: "List network requests from the current page and optionally filter them by URL text."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell console [--level <level>] [--query <keyword>] [--limit <n>]",
    description: "Read browser console logs as a fallback; prefer snapshot --query for structured verification and troubleshooting."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell coverage <status|start|take|stop|cancel> [path] [--label <name>] [--max-size <bytes>]",
    description: "Capture code executed by the current page in stages to identify loaded but unused application and third-party code."
  },
  {
    category: "Runtime",
    usage: "divebell runtimes [--bridge <url>]",
    description: "List runtimes from the current directory's opened page, or from an explicitly selected Bridge."
  },
  {
    category: "Runtime",
    usage: "divebell targets [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--id <id>] [--type <type>] [--source <source>] [--status <status>] [--query <keyword>]",
    description: "Read target definitions registered by the selected runtime."
  },
  {
    category: "Runtime",
    usage: "divebell snapshot [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--id <id>] [--type <type>] [--source <source>] [--status <status>] [--query <keyword>]",
    description: "Read the current snapshot state from the selected runtime."
  },
  {
    category: "Runtime",
    usage: "divebell events [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--target-id <id>] [--type <type>] [--source <source>] [--status <status>] [--action <name>] [--since <event-id>] [--limit <n>] [--query <keyword>]",
    description: "Read runtime event history."
  },
  {
    category: "Runtime",
    usage: "divebell actions [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--name <name>] [--source <source>] [--risk <risk>] [--enabled <true|false>] [--query <keyword>]",
    description: "List runtime actions declared by the page."
  },
  {
    category: "Runtime",
    usage: "divebell run-action [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] <action-name> [--payload <json>]",
    description: "Run a runtime action declared by the page."
  },
  {
    category: "Runtime",
    usage: "divebell wait-for [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] <target-id> <status> [--where <path=value>] [--timeout <ms>] [--strict] [--next]",
    description: "Wait for a target to reach a status; --where values are parsed as JSON literals and can match numbers, booleans, or null."
  }
];

import type { CliReferenceCollection } from "../types/commands.js";
export type { CliCommandSkillReference, CliReferenceCollection } from "../types/commands.js";

const HELP_CATEGORIES: CliCommandReference["category"][] = [
  "Bridge and Browser",
  "Runtime",
  "Extensions",
  "External Extensions"
];

const CATEGORY_LABELS: Record<CliCommandReference["category"], string> = {
  "Bridge and Browser": "Browser",
  Runtime: "Runtime",
  Extensions: "Extensions",
  "External Extensions": "External Extensions",
  "Daemon and Browser": "Browser",
  Internal: "Internal"
};

const TOP_LEVEL_DESCRIPTIONS: Readonly<Record<string, string>> = {
  console: "Read browser console logs.",
  eval: "Run a script in the current page.",
  extensions: "Install, list, update, or remove Divebell extensions.",
  "wait-for": "Wait for a target to reach a status.",
  ps: "List running divebell daemon processes.",
  kill: "Stop a divebell daemon by ps index, PID, or port.",
  "kill-all": "Stop all running divebell daemon processes."
};

export function createHelpText(references: CliReferenceCollection = {}): string {
  const commandReferences = references.commandReferences ?? cliCommandReferences;
  const commandSkillReferences = references.commandSkillReferences ?? [];
  const commandLines = HELP_CATEGORIES.flatMap((category) => {
    const commands = commandReferences.filter((command) => command.category === category);
    if (commands.length === 0) return [];
    const topLevelCommands = collectTopLevelCommands(commands);
    const skillCommands = commandSkillReferences
      .filter((reference) => reference.category === category)
      .map((reference) => reference.command);
    return [
      "",
      `${CATEGORY_LABELS[category]}:`,
      ...topLevelCommands.map((command) =>
        `  divebell ${command.name} - ${command.description}`
      ),
      ...(skillCommands.length === 0 ? [] : [
        "",
        `  Skill: available for ${skillCommands.join(", ")}.`,
        "  Skill usage: `divebell <command> --skill`"
      ])
    ];
  });

  return [
    "Usage: divebell <command> [options]",
    ...commandLines,
    "",
    "Run `divebell <command> --help` (or `-h`) for detailed usage.",
    "Run `divebell --version` (or `-v`) to print the installed version."
  ].join("\n");
}

export function createCommandHelpText(
  commandPath: readonly string[],
  references: CliReferenceCollection = {}
): string | undefined {
  if (commandPath.length === 0) return createHelpText(references);

  const commandReferences = references.commandReferences ?? cliCommandReferences;
  const matchingReferences = commandReferences.filter((reference) =>
    matchesCommandPath(reference.usage, commandPath)
  );
  if (matchingReferences.length === 0) return undefined;

  const commandSkillReferences = references.commandSkillReferences ?? [];
  const commandName = commandPath[0];
  const hasSkill = commandName !== undefined && commandSkillReferences.some(
    (reference) => reference.command === commandName
  );

  return [
    "Usage:",
    ...matchingReferences.map((reference) =>
      `  ${reference.usage} - ${reference.description}`
    ),
    ...(hasSkill ? [
      "",
      `Skill: available via \`divebell ${commandName} --skill\`.`
    ] : [])
  ].join("\n");
}

export function createCliReferenceMarkdown(references: CliReferenceCollection = {}): string {
  const commandReferences = references.commandReferences ?? cliCommandReferences;
  const lines = [
    "# Divebell CLI Reference",
    "",
    "<!-- This file is generated by scripts/sync-divebell-cli-docs.mjs. Do not edit by hand. -->",
    "",
    "This document is generated from the current CLI command table in `packages/cli/src/commands/help.ts`.",
    "",
    "## Binaries",
    "",
    "- `divebell`",
    "- `divebell --version` (or `divebell -v`) - Print the installed CLI version.",
    "",
    "## Commands"
  ];

  for (const category of HELP_CATEGORIES) {
    const categoryCommands = commandReferences.filter((item) => item.category === category);
    if (categoryCommands.length === 0) continue;
    lines.push("", `### ${CATEGORY_LABELS[category]}`, "");
    for (const command of categoryCommands) {
      lines.push(`- \`${command.usage}\` - ${command.description}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function collectTopLevelCommands(
  references: readonly CliCommandReference[]
): Array<{ name: string; description: string }> {
  const grouped = new Map<string, CliCommandReference[]>();
  for (const reference of references) {
    const commandName = getUsageTokens(reference.usage)[0];
    if (commandName === undefined || isUsagePlaceholder(commandName)) continue;
    const existing = grouped.get(commandName);
    if (existing === undefined) {
      grouped.set(commandName, [reference]);
    } else {
      existing.push(reference);
    }
  }

  return [...grouped].map(([name, commandReferences]) => ({
    name,
    description: TOP_LEVEL_DESCRIPTIONS[name] ??
      selectTopLevelDescription(commandReferences)
  }));
}

function selectTopLevelDescription(
  references: readonly CliCommandReference[]
): string {
  return [...references]
    .sort((left, right) =>
      countLiteralCommandTokens(left.usage) - countLiteralCommandTokens(right.usage)
    )[0]?.description ?? "Show command help."
}

function countLiteralCommandTokens(usage: string): number {
  let count = 0;
  for (const token of getUsageTokens(usage)) {
    if (isUsagePlaceholder(token)) break;
    count += 1;
  }
  return count;
}

function matchesCommandPath(usage: string, commandPath: readonly string[]): boolean {
  const usageTokens = getUsageTokens(usage);
  if (commandPath.length > usageTokens.length) return false;

  return commandPath.every((commandToken, index) => {
    const usageToken = usageTokens[index];
    if (usageToken === undefined || usageToken.startsWith("--")) return false;
    if (!isUsagePlaceholder(usageToken)) return usageToken === commandToken;

    const alternatives = getPlaceholderAlternatives(usageToken);
    return alternatives === undefined || alternatives.includes(commandToken);
  });
}

function getUsageTokens(usage: string): string[] {
  const tokens = usage.trim().split(/\s+/);
  if (tokens[0] !== "divebell") return [];
  return tokens.slice(1);
}

function isUsagePlaceholder(token: string): boolean {
  return token.startsWith("<") || token.startsWith("[") || token.startsWith("--");
}

function getPlaceholderAlternatives(token: string): string[] | undefined {
  if (!token.startsWith("<") || !token.includes("|")) return undefined;
  const endIndex = token.indexOf(">");
  if (endIndex < 0) return undefined;
  return token.slice(1, endIndex).split("|");
}
