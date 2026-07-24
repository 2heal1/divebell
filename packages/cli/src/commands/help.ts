import type { CliCommandReference } from "../types/commands.js";
export type { CliCommandReference } from "../types/commands.js";

export const cliCommandReferences: CliCommandReference[] = [
  {
    category: "Extensions",
    usage: "openruntime extensions add <package-or-path> [--extensions-dir <path>]",
    description: "Validate and install an OpenRuntime extension with no runtime dependencies from an npm package or local path."
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
    usage: "openruntime profiles",
    description: "List Chrome profiles available to agent-browser."
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime state save <path> [--url <url>]",
    description: "Save agent-browser state; with --url, keep only cookies and web storage that apply to that URL."
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime state load <path>",
    description: "Load an agent-browser state file into the current browser session."
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime state <list|show|rename|clear|clean> [args]",
    description: "Inspect and manage agent-browser saved states."
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime auth save <name> --url <url> --username <user> --password-stdin",
    description: "Save encrypted login credentials in the agent-browser auth vault."
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime auth login <name>",
    description: "Open the saved login page and let agent-browser fill and submit the matching login form."
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime auth <list|show|delete> [name]",
    description: "Inspect or delete agent-browser auth vault entries; passwords are never shown."
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime open <url> [--headers <json>] [--profile <name|path>] [--state <path>] [--bridge <url>] [--port <port>] [--session <id>] [--no-bridge] [--ui]",
    description: "Open a directory-scoped page with its own automatically assigned Bridge port, optionally using origin-scoped HTTP headers, a Chrome profile, state file, or explicit Bridge."
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
    description: "List runtimes from the current directory's opened page, or from an explicitly selected Bridge."
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

const HELP_CATEGORIES: CliCommandReference["category"][] = [
  "Bridge and Browser",
  "Runtime",
  "Extensions",
  "External Extensions"
];

const TOP_LEVEL_DESCRIPTIONS: Readonly<Record<string, string>> = {
  console: "Read browser console logs.",
  eval: "Run a script in the current page.",
  extensions: "Install, list, update, or remove OpenRuntime extensions.",
  "wait-for": "Wait for a target to reach a status."
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
      `${category}:`,
      ...topLevelCommands.map((command) =>
        `  openruntime ${command.name} - ${command.description}`
      ),
      ...(skillCommands.length === 0 ? [] : [
        "",
        `  Skill: available for ${skillCommands.join(", ")}.`,
        "  Skill usage: `openruntime <command> --skill`"
      ])
    ];
  });

  return [
    "Usage: openruntime <command> [options]",
    ...commandLines,
    "",
    "Run `openruntime <command> --help` for detailed usage."
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
      `Skill: available via \`openruntime ${commandName} --skill\`.`
    ] : [])
  ].join("\n");
}

export function createCliReferenceMarkdown(references: CliReferenceCollection = {}): string {
  const commandReferences = references.commandReferences ?? cliCommandReferences;
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

  for (const category of HELP_CATEGORIES) {
    const categoryCommands = commandReferences.filter((item) => item.category === category);
    if (categoryCommands.length === 0) continue;
    lines.push("", `### ${categoryLabels[category]}`, "");
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
  if (tokens[0] !== "openruntime") return [];
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
