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
    description: "启动或复用 CLI 管理的 Bridge；命令返回后 Bridge 会作为 CLI 托管进程常驻。"
  },
  {
    category: "Bridge and Browser",
    usage: "open-runtime stop [--port <port>]",
    description: "先关闭浏览器会话，再停止 CLI 管理的 Bridge。"
  },
  {
    category: "Bridge and Browser",
    usage: "open-runtime open <url> [--bridge <url>] [--port <port>] [--session <id>] [--no-bridge]",
    description: "打开页面，默认会先准备 Bridge。"
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
    usage: "open-runtime close",
    description: "关闭浏览器会话。"
  },
  {
    category: "Runtime",
    usage: "open-runtime runtimes [--bridge <url>]",
    description: "列出连接到 Bridge 的 runtime。"
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
    usage: "open-runtime events [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--target-id <id>] [--type <type>] [--source <source>] [--status <status>] [--action <name>] [--since <event-id>] [--limit <n>]",
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
    usage: "open-runtime wait-for [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] <target-id> <status> [--where <path=value>] [--timeout <ms>] [--open] [--strict]",
    description: "等待 target 到达指定状态。"
  },
  {
    category: "Extensions",
    usage: "open-runtime vmok get-module-info [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--target <target-id>]",
    description: "从 OpenRuntime snapshot target 读取 VMOK module info。"
  },
  {
    category: "Extensions",
    usage: "open-runtime vmok get-instance <name>",
    description: "从页面读取某个 VMOK runtime instance。"
  }
];

export const cliExampleReferences: CliExampleReference[] = [
  {
    command: "open-runtime snapshot --url http://localhost:4412 --id modern:route",
    description: "从所选 runtime 读取一个 route target。"
  },
  {
    command: "open-runtime events --url http://localhost:4412 --target-id modern:route --limit 50",
    description: "查看某个 target 的最近事件。"
  },
  {
    command: "open-runtime wait-for modern:route ready --url http://localhost:4412 --where pathname=/orders --timeout 10000",
    description: "等待指定 pathname 的 route target ready。"
  },
  {
    command: "open-runtime vmok get-module-info --url http://localhost:4412",
    description: "从默认 target 读取 VMOK module info。"
  },
  {
    command: "open-runtime vmok get-instance shell",
    description: "按名称读取一个 VMOK 浏览器实例。"
  }
];

export function createHelpText(): string {
  return [
    "Usage:",
    ...cliCommandReferences.map((command) => `  ${command.usage}`),
    "",
    "Examples:",
    ...cliExampleReferences.map((example) => `  ${example.command}`)
  ].join("\n");
}

export function createCliReferenceMarkdown(): string {
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
    lines.push("", `### ${categoryLabels[category]}`, "");
    for (const command of cliCommandReferences.filter((item) => item.category === category)) {
      lines.push(`- \`${command.usage}\` - ${command.description}`);
    }
  }

  lines.push("", "## Examples", "");
  for (const example of cliExampleReferences) {
    lines.push(`- \`${example.command}\` - ${example.description}`);
  }

  return `${lines.join("\n")}\n`;
}

export function createCliSkillSectionMarkdown(): string {
  const categories: CliCommandReference["category"][] = ["Bridge and Browser", "Runtime", "Extensions"];
  const categoryLabels: Record<CliCommandReference["category"], string> = {
    "Bridge and Browser": "Bridge 和浏览器",
    Runtime: "Runtime 状态",
    Extensions: "扩展命令"
  };
  const lines = [
    "## CLI 命令",
    "",
    "<!-- This section is generated by scripts/sync-openruntime-cli-docs.mjs. Do not edit by hand. -->",
    "",
    "当前可用命令如下。更新 CLI 后运行 `pnpm run docs:cli` 同步本段。"
  ];

  for (const category of categories) {
    lines.push("", `### ${categoryLabels[category]}`, "");
    for (const command of cliCommandReferences.filter((item) => item.category === category)) {
      lines.push(`- \`${command.usage}\` - ${command.description}`);
    }
  }

  lines.push("", "### 示例", "");
  for (const example of cliExampleReferences) {
    lines.push(`- \`${example.command}\` - ${example.description}`);
  }

  return `${lines.join("\n")}\n`;
}
