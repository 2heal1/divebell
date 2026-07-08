export interface CliCommandReference {
  category: "Bridge and Browser" | "Runtime" | "Subcommands" | "External Subcommands";
  usage: string;
  description: string;
}

export interface CliExampleReference {
  command: string;
  description: string;
}

export const cliCommandReferences: CliCommandReference[] = [
  {
    category: "Bridge and Browser",
    usage: "openruntime start [--port <port>]",
    description: "显式启动或复用 CLI 管理的 Bridge；多数命令会自动准备本地 Bridge，通常不需要手动运行。"
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime stop [--port <port>]",
    description: "先关闭浏览器会话，再停止 CLI 管理的 Bridge。"
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime export-profile [--source chrome|openruntime] [--domain <domain>] [--chrome-profile <name>] [--chrome-user-data-dir <path>] [--timeout <ms>] [--output <path>]",
    description: "导出账号状态；默认读取本机 Chrome 的最近使用 profile，--domain 会访问指定站点并导出该站点相关 Cookie、本地存储和 IndexedDB。"
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime import-profile <content-or-path> | --input <path>",
    description: "导入 OpenRuntime 浏览器账号状态，让后续打开页面默认使用这份账号。"
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime open <url> [--bridge <url>] [--port <port>] [--session <id>] [--no-bridge] [--ui]",
    description: "打开页面，默认会先准备 Bridge，并以静默浏览器模式运行；--ui 打开可见浏览器。"
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime page-snapshot",
    description: "读取当前页面快照，包括可操作元素引用。"
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime click <ref|selector|text>",
    description: "按页面引用、选择器或可见文本点击元素。"
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime fill <ref|selector> <value>",
    description: "按页面引用或选择器填写输入框。"
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime eval <script>",
    description: "在页面内执行脚本，也支持 --file <path> 读取脚本文件。"
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime wait-eval <script> [--timeout <ms>]",
    description: "轮询页面表达式，直到结果为 true。"
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime get-window <path>",
    description: "读取 window/globalThis 上的点分路径，例如 gf_data_v1。"
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime screenshot [name] [--full-page]",
    description: "通过 OpenRuntime 浏览器层截图。"
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime network [--url <query>]",
    description: "查看当前页面的网络请求列表，并可按 URL 文本过滤。"
  },
  {
    category: "Bridge and Browser",
    usage: "openruntime console [--level <level>] [--query <keyword>] [--limit <n>]",
    description: "兜底读取当前页面浏览器 console 日志；结构化验收和排错优先用 snapshot --query。"
  },
  {
    category: "Runtime",
    usage: "openruntime runtimes [--bridge <url>]",
    description: "列出连接到 Bridge 的 runtime；本地 Bridge 不存在时会自动启动。"
  },
  {
    category: "Runtime",
    usage: "openruntime targets [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--id <id>] [--type <type>] [--source <source>] [--status <status>] [--query <keyword>]",
    description: "读取所选 runtime 注册的 target 定义。"
  },
  {
    category: "Runtime",
    usage: "openruntime snapshot [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--id <id>] [--type <type>] [--source <source>] [--status <status>] [--query <keyword>]",
    description: "读取当前 runtime snapshot 状态。"
  },
  {
    category: "Runtime",
    usage: "openruntime events [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--target-id <id>] [--type <type>] [--source <source>] [--status <status>] [--action <name>] [--since <event-id>] [--limit <n>] [--query <keyword>]",
    description: "读取 runtime event 历史。"
  },
  {
    category: "Runtime",
    usage: "openruntime actions [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--name <name>] [--source <source>] [--risk <risk>] [--enabled <true|false>] [--query <keyword>]",
    description: "列出页面声明的 runtime action。"
  },
  {
    category: "Runtime",
    usage: "openruntime input-options [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] --action <name> --input <name> [--payload <json>] [--timeout <ms>]",
    description: "读取 action 某个输入项的动态候选值。"
  },
  {
    category: "Runtime",
    usage: "openruntime run-action [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] <action-name> [--payload <json>]",
    description: "执行页面声明的 runtime action。"
  },
  {
    category: "Runtime",
    usage: "openruntime verify [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] <target-id> <status> [--where <path=value>] [--timeout <ms>] [--next]",
    description: "业务级验收 target：只有业务 target 成功才判定业务通过；Modern/MF/Garfish/Vmok 等底层 target 只作为底层证据。"
  },
  {
    category: "Runtime",
    usage: "openruntime wait-for [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] <target-id> <status> [--where <path=value>] [--timeout <ms>] [--strict] [--next]",
    description: "等待 target 到达指定状态；--where 的 value 会按 JSON 字面量解析，可匹配 number、boolean、null。"
  },
  {
    category: "Subcommands",
    usage: "openruntime extensions list",
    description: "列出当前 CLI 已加载的内部子命令和外部子命令文件。"
  }
];

export const cliExampleReferences: CliExampleReference[] = [
  {
    command: "openruntime snapshot --id modern:route",
    description: "从最新 connected runtime 读取一个 route target。"
  },
  {
    command: "openruntime events --target-id modern:route --limit 50",
    description: "查看某个 target 的最近事件。"
  },
  {
    command: "openruntime events --query react --limit 50",
    description: "按关键词查看相关事件。"
  },
  {
    command: "openruntime snapshot --query runtime-error",
    description: "查询页面主动写入 snapshot 的错误状态。"
  },
  {
    command: "openruntime wait-for modern:route ready --where pathname=/orders --timeout 10000",
    description: "等待指定 pathname 的 route target ready。"
  },
  {
    command: "openruntime verify business:orders:risk-panel ready --url http://localhost:4412 --timeout 10000",
    description: "用业务 target 做最终验收；通过后只写结果和清理，严禁重复取证。"
  },
  {
    command: "openruntime wait-for modern:route ready --next --where pathname=/orders --timeout 10000",
    description: "等待下一次新连接 runtime 的 route target ready。"
  }
];

export interface CliReferenceCollection {
  commandReferences?: readonly CliCommandReference[];
  exampleReferences?: readonly CliExampleReference[];
}

export interface CliSkillSectionOptions {
  heading?: string;
}

export function createHelpText(references: CliReferenceCollection = {}): string {
  const commandReferences = references.commandReferences ?? cliCommandReferences;
  const exampleReferences = references.exampleReferences ?? cliExampleReferences;
  const categories: CliCommandReference["category"][] = ["Bridge and Browser", "Runtime", "Subcommands", "External Subcommands"];
  const commandLines = categories.flatMap((category) => {
    const commands = commandReferences.filter((command) => command.category === category);
    if (commands.length === 0) return [];
    return [
      "",
      `${category}:`,
      ...commands.map((command) => `  ${command.usage}`)
    ];
  });

  return [
    "Usage:",
    ...commandLines,
    "",
    "Examples:",
    ...exampleReferences.map((example) => `  ${example.command}`)
  ].join("\n");
}

export function createCliReferenceMarkdown(references: CliReferenceCollection = {}): string {
  const commandReferences = references.commandReferences ?? cliCommandReferences;
  const exampleReferences = references.exampleReferences ?? cliExampleReferences;
  const categories: CliCommandReference["category"][] = ["Bridge and Browser", "Runtime", "Subcommands", "External Subcommands"];
  const categoryLabels: Record<CliCommandReference["category"], string> = {
    "Bridge and Browser": "Bridge 和浏览器",
    Runtime: "Runtime",
    Subcommands: "子命令",
    "External Subcommands": "外部子命令"
  };
  const lines = [
    "# OpenRuntime CLI Reference",
    "",
    "<!-- This file is generated by scripts/sync-openruntime-cli-docs.mjs. Do not edit by hand. -->",
    "",
    "本文档由 `packages/cli/src/help.ts` 中的当前 CLI 命令表生成。",
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

  lines.push("", "## Examples", "");
  for (const example of exampleReferences) {
    lines.push(`- \`${example.command}\` - ${example.description}`);
  }

  return `${lines.join("\n")}\n`;
}

export function createCliSkillSectionMarkdown(
  references: CliReferenceCollection = {},
  options: CliSkillSectionOptions = {}
): string {
  const commandReferences = references.commandReferences ?? cliCommandReferences;
  const heading = options.heading ?? "### 常用 CLI";
  const commonCommands = [
    "openruntime start",
    "openruntime open",
    "openruntime runtimes",
    "openruntime verify",
    "openruntime wait-for",
    "openruntime wait-eval",
    "openruntime eval",
    "openruntime targets",
    "openruntime snapshot",
    "openruntime events"
  ];
  const lines = [
    heading,
    "",
    "<!-- This section is generated by scripts/sync-openruntime-cli-docs.mjs. Do not edit by hand. -->",
    "",
    "完整 CLI 清单见 `docs/cli-reference.md`。这里仅保留 OpenRuntime skill 最常用入口。",
    "",
    "定位时先用一次不带 `--id` / `--query` 的全量 `snapshot` 快速探测；如果没有有效线索，立即改用 OpenRuntime 浏览器能力，例如 `console`、`page-snapshot`、`network`、`eval` 或 `wait-eval`。进入 PATCH 后必须补或复用最小 `business:*` target，并使用 `verify` 最终验收；通过后百分百相信 verify，只允许写结果和清理，严禁再调用 `snapshot`、`console`、`page-snapshot`、`network`、`eval`、`wait-eval`、截图或再次 `verify`。"
  ];

  for (const commandStart of commonCommands) {
    const command = commandReferences.find((item) => item.usage.startsWith(commandStart));
    if (command !== undefined) {
      lines.push(`- \`${command.usage}\` - ${command.description}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
