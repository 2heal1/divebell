export interface CliCommandReference {
  category: "Bridge and Browser" | "Runtime" | "Extensions";
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
    usage: "open-runtime start [--port <port>]",
    description: "显式启动或复用 CLI 管理的 Bridge；多数命令会自动准备本地 Bridge，通常不需要手动运行。"
  },
  {
    category: "Bridge and Browser",
    usage: "open-runtime stop [--port <port>]",
    description: "先关闭浏览器会话，再停止 CLI 管理的 Bridge。"
  },
  {
    category: "Bridge and Browser",
    usage: "open-runtime export-profile [--source chrome|openruntime] [--domain <domain>] [--chrome-profile <name>] [--chrome-user-data-dir <path>] [--timeout <ms>] [--output <path>]",
    description: "导出账号状态；默认读取本机 Chrome 的最近使用 profile，--domain 会访问指定站点并导出该站点相关 Cookie、本地存储和 IndexedDB。"
  },
  {
    category: "Bridge and Browser",
    usage: "open-runtime import-profile <content-or-path> | --input <path>",
    description: "导入 OpenRuntime 浏览器账号状态，让后续打开页面默认使用这份账号。"
  },
  {
    category: "Bridge and Browser",
    usage: "open-runtime open <url> [--bridge <url>] [--port <port>] [--session <id>] [--no-bridge] [--ui]",
    description: "打开页面，默认会先准备 Bridge，并以静默浏览器模式运行；--ui 打开可见浏览器。"
  },
  {
    category: "Bridge and Browser",
    usage: "open-runtime goto <url> [--session <id>]",
    description: "让当前浏览器页面跳转到指定 URL。"
  },
  {
    category: "Bridge and Browser",
    usage: "open-runtime page-snapshot",
    description: "读取当前页面快照，包括可操作元素引用。"
  },
  {
    category: "Bridge and Browser",
    usage: "open-runtime click <ref|selector|text>",
    description: "按页面引用、选择器或可见文本点击元素。"
  },
  {
    category: "Bridge and Browser",
    usage: "open-runtime fill <ref|selector> <value>",
    description: "按页面引用或选择器填写输入框。"
  },
  {
    category: "Bridge and Browser",
    usage: "open-runtime eval <script>",
    description: "在页面内执行脚本，也支持 --file <path> 读取脚本文件。"
  },
  {
    category: "Bridge and Browser",
    usage: "open-runtime wait-eval <script> [--timeout <ms>]",
    description: "轮询页面表达式，直到结果为 true。"
  },
  {
    category: "Bridge and Browser",
    usage: "open-runtime get-window <path>",
    description: "读取 window/globalThis 上的点分路径，例如 gf_data_v1。"
  },
  {
    category: "Bridge and Browser",
    usage: "open-runtime screenshot [name] [--full-page]",
    description: "通过 OpenRuntime 浏览器层截图。"
  },
  {
    category: "Bridge and Browser",
    usage: "open-runtime network [--url <query>]",
    description: "查看当前页面的网络请求列表，并可按 URL 文本过滤。"
  },
  {
    category: "Bridge and Browser",
    usage: "open-runtime console [--level <level>] [--query <keyword>] [--limit <n>]",
    description: "兜底读取当前页面浏览器 console 日志；结构化验收和排错优先用 snapshot --query。"
  },
  {
    category: "Bridge and Browser",
    usage: "open-runtime close",
    description: "关闭浏览器会话。"
  },
  {
    category: "Runtime",
    usage: "open-runtime runtimes [--bridge <url>]",
    description: "列出连接到 Bridge 的 runtime；本地 Bridge 不存在时会自动启动。"
  },
  {
    category: "Runtime",
    usage: "open-runtime targets [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--id <id>] [--type <type>] [--source <source>] [--status <status>] [--query <keyword>]",
    description: "读取所选 runtime 注册的 target 定义。"
  },
  {
    category: "Runtime",
    usage: "open-runtime snapshot [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--id <id>] [--type <type>] [--source <source>] [--status <status>] [--query <keyword>]",
    description: "读取当前 runtime snapshot 状态。"
  },
  {
    category: "Runtime",
    usage: "open-runtime events [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--target-id <id>] [--type <type>] [--source <source>] [--status <status>] [--action <name>] [--since <event-id>] [--limit <n>] [--query <keyword>]",
    description: "读取 runtime event 历史。"
  },
  {
    category: "Runtime",
    usage: "open-runtime actions [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--name <name>] [--source <source>] [--risk <risk>] [--enabled <true|false>] [--query <keyword>]",
    description: "列出页面声明的 runtime action。"
  },
  {
    category: "Runtime",
    usage: "open-runtime input-options [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] --action <name> --input <name> [--payload <json>] [--timeout <ms>]",
    description: "读取 action 某个输入项的动态候选值。"
  },
  {
    category: "Runtime",
    usage: "open-runtime run-action [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] <action-name> [--payload <json>]",
    description: "执行页面声明的 runtime action。"
  },
  {
    category: "Runtime",
    usage: "open-runtime verify [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] <target-id> <status> [--where <path=value>] [--timeout <ms>] [--open] [--next]",
    description: "保守验收 target：只有业务 target 成功才判定业务通过；Modern/MF/Garfish/Vmok 等底层 target 只作为底层证据，并在缺少业务 target 时做一次轻量白屏检查。"
  },
  {
    category: "Runtime",
    usage: "open-runtime wait-for [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] <target-id> <status> [--where <path=value>] [--timeout <ms>] [--open] [--strict] [--next]",
    description: "等待 target 到达指定状态；--where 的 value 会按 JSON 字面量解析，可匹配 number、boolean、null。"
  }
];

export const cliExampleReferences: CliExampleReference[] = [
  {
    command: "open-runtime snapshot --id modern:route",
    description: "从最新 connected runtime 读取一个 route target。"
  },
  {
    command: "open-runtime events --target-id modern:route --limit 50",
    description: "查看某个 target 的最近事件。"
  },
  {
    command: "open-runtime events --query react --limit 50",
    description: "按关键词查看相关事件。"
  },
  {
    command: "open-runtime snapshot --query runtime-error",
    description: "查询页面主动写入 snapshot 的错误状态。"
  },
  {
    command: "open-runtime wait-for modern:route ready --where pathname=/orders --timeout 10000",
    description: "等待指定 pathname 的 route target ready。"
  },
  {
    command: "open-runtime verify business:orders:risk-panel ready --url http://localhost:4412 --timeout 10000",
    description: "用业务 target 做保守验收；缺少业务 target 时不会把 route/MF ready 当作业务成功。"
  },
  {
    command: "open-runtime wait-for modern:route ready --next --where pathname=/orders --timeout 10000",
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

  return [
    "Usage:",
    ...commandReferences.map((command) => `  ${command.usage}`),
    "",
    "Examples:",
    ...exampleReferences.map((example) => `  ${example.command}`)
  ].join("\n");
}

export function createCliReferenceMarkdown(references: CliReferenceCollection = {}): string {
  const commandReferences = references.commandReferences ?? cliCommandReferences;
  const exampleReferences = references.exampleReferences ?? cliExampleReferences;
  const categories: CliCommandReference["category"][] = ["Bridge and Browser", "Runtime", "Extensions"];
  const categoryLabels: Record<CliCommandReference["category"], string> = {
    "Bridge and Browser": "Bridge 和浏览器",
    Runtime: "Runtime",
    Extensions: "扩展"
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
    "- `open-runtime`",
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
    "open-runtime start",
    "open-runtime open",
    "open-runtime runtimes",
    "open-runtime verify",
    "open-runtime wait-for",
    "open-runtime wait-eval",
    "open-runtime eval",
    "open-runtime targets",
    "open-runtime snapshot",
    "open-runtime events"
  ];
  const lines = [
    heading,
    "",
    "<!-- This section is generated by scripts/sync-openruntime-cli-docs.mjs. Do not edit by hand. -->",
    "",
    "完整 CLI 清单见 `docs/cli-reference.md`。这里仅保留 OpenRuntime skill 最常用入口。",
    "",
    "普通验收优先选择一条最短路径：能改源码且需要反复验证时先补最小业务 target，再用 `verify`；不能改源码或一次性简单页面结果用 `eval` / `wait-eval`。`snapshot`、`events` 和 `targets` 主要用于定位失败原因；浏览器错误等调试事实应优先写入 snapshot 后用 `snapshot --query` 查询。"
  ];

  for (const commandStart of commonCommands) {
    const command = commandReferences.find((item) => item.usage.startsWith(commandStart));
    if (command !== undefined) {
      lines.push(`- \`${command.usage}\` - ${command.description}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
