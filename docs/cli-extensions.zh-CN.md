# OpenRuntime CLI Extension 开发指南

English version: [OpenRuntime CLI Extension Development](cli-extensions.md)

本文面向 Extension 开发者，按创建、注册能力、本地调试、发布和验证的顺序说明如何完成一个 Extension。Extension 是团队将领域知识接入 OpenRuntime 的主要机制，可以复用当前页面、登录状态和浏览器诊断，也可以连接已有的 SDK、OpenAPI、CLI 和内部平台。

安装和管理已有 Extension 见 [Extension 使用指南](extensions.zh-CN.md)；查询完整字段和类型见 [Extension API 参考](extension-api.zh-CN.md)。

## Extension 开发模型

Extension 用于把团队会反复使用的账号与环境准备、技术栈识别、领域资源查询、专项诊断和验证流程，封装成 Agent 可以通过 OpenRuntime CLI 发现和调用的能力。例如，它可以从当前页面识别应用、环境或部署 ID，再将这些信息交给团队已有的服务能力。

一个 Extension 由以下部分组成：

- 一个自包含的 npm 包或本地开发目录。
- 一个轻量的 Extension 入口，用于声明 Commands、Hooks 和 Skills。
- 按需加载的实现代码和必要资源。
- 对当前页面、浏览器诊断以及可选 Runtime 信息的访问。

Extension 不要求团队重写已经存在的服务能力。它可以只负责从当前现场补齐调用所需的上下文，再把参数交给原有工具，并将结果带回同一个开发调试流程。

Extension 适合页面外部可以完成、并且值得团队复用的流程。如果需求必须由应用主动暴露内部状态、事件或允许动作，应使用 [Runtime Core API](runtime-core-api.zh-CN.md)。一次性的页面操作直接使用现有 CLI，不需要包装成 Extension。

页面类 Command 操作当前工作目录最近一次通过 `openruntime open <url>` 打开的页面。如果一个流程需要自己管理页面打开、等待、操作和关闭的完整生命周期，应编写[自动化脚本](cli-automation-scripts.zh-CN.md)。

## 创建 Extension

### 创建目录

最小目录如下：

```text
my-extension/
├── package.json
├── tsconfig.json
├── src/
│   ├── extension.mts
│   ├── commands/
│   │   └── foo.mts
│   └── hooks/
│       ├── open.mts
│       ├── detect-stack.mts
│       └── close.mts
└── dist/                  # 构建生成
```

下面的主流程使用 TypeScript：`.mts` 源文件会生成可直接加载的 `.mjs` 文件。只做本地原型时也可以跳过构建，直接编写 `.mjs`；仓库 demo 展示了这种方式。

### 定义扩展包

`package.json` 使用 `openruntime.extensions` 声明一个或多个入口：

```json
{
  "name": "@scope/my-extension",
  "version": "1.0.0",
  "description": "OpenRuntime CLI Extension",
  "type": "module",
  "main": "./dist/extension.mjs",
  "types": "./dist/extension.d.mts",
  "exports": {
    ".": {
      "types": "./dist/extension.d.mts",
      "import": "./dist/extension.mjs"
    }
  },
  "files": [
    "dist/**/*"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json --pretty false"
  },
  "engines": {
    "node": ">=24.0.0 <25"
  },
  "devDependencies": {
    "@openruntime/cli": "^0.1.3",
    "@types/node": "^24.0.0",
    "typescript": "^5.9.0"
  },
  "openruntime": {
    "schemaVersion": 1,
    "extensions": ["./dist/extension.mjs"]
  },
  "publishConfig": {
    "access": "public"
  }
}
```

这份模板同时声明两类入口：

- `main`、`types` 和 `exports` 是标准 npm 包入口，让其他代码可以通过 `import "@scope/my-extension"` 使用这个包。
- `openruntime.extensions` 是 OpenRuntime 的加载清单，明确列出需要作为 Extension 加载的文件。一个包可以声明多个 Extension，因此这里使用数组。
- `files` 限制发布内容，确保构建产物进入 npm 包，同时排除源码和无关文件。
- `publishConfig.access` 让 scoped package 默认按公开包发布；私有包应按团队策略调整或删除这一项。

单 Extension 包可以让标准 npm 入口和 OpenRuntime 入口指向同一个文件。包含多个 Extension 时，标准入口通常指向统一的 `index.mjs`，`openruntime.extensions` 再分别列出各个 Extension 文件。

`tsconfig.json` 可以从下面的最小配置开始：

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src/**/*.mts"]
}
```

发布包不能声明 `dependencies`、`optionalDependencies` 或 `peerDependencies`。开发期类型和构建工具放在 `devDependencies`；其他依赖的代码和资源必须在发布前打包进最终产物。将模板中的包名、描述和版本替换成项目的真实内容后再发布。

### 编写 Extension 入口

入口只声明这个 Extension 提供什么。真正的 Command 和 Hook 实现通过动态导入按需加载：

```ts
import type { OpenRuntimeExtensionDefinition } from "@openruntime/cli";

const extension: OpenRuntimeExtensionDefinition = {
  schemaVersion: 1,
  name: "my-extension",
  displayName: "My Extension",
  description: "团队页面检查能力",
  commands: [{
    name: "foo",
    commandReferences: [{
      category: "Extensions",
      usage: "openruntime foo inspect [--name <name>]",
      description: "执行团队页面检查。"
    }],
    run: async options =>
      await (await import("./commands/foo.mjs")).runFoo(options)
  }],
  hooks: {
    open: async options =>
      await (await import("./hooks/open.mjs")).open(options),
    detectStack: async options =>
      await (await import("./hooks/detect-stack.mjs")).detectStack(options),
    close: async options =>
      await (await import("./hooks/close.mjs")).close(options)
  }
};

export default extension;
```

入口文件不要直接引用实际实现，也不要在顶层执行初始化、文件读取、网络请求或 `await`。相对动态导入必须带 `.js` 或 `.mjs` 后缀。

测试和 CI 可以调用 `validateExtension(...)` 检查默认导出。完整定义字段见 [Extension API 参考](extension-api.zh-CN.md#extension-定义)。

## 注册能力

### Commands

Command 是 Agent 调用 Extension 的主要入口。它接收已经解析的命令参数、最近页面上下文、请求入口和 Extension API。

```ts
import type { CliExtensionRunOptions } from "@openruntime/cli";

export async function runFoo(
  options: CliExtensionRunOptions
): Promise<unknown> {
  const action = options.args.command[1] ?? "inspect";
  const name = options.args.options.get("name")?.at(-1) ?? "default";

  return { action, name };
}
```

成功时直接返回结果，OpenRuntime 会自动包裹并格式化为统一输出；失败时直接抛出错误，OpenRuntime 会统一格式化错误并返回非零退出码。如果当前页面通过 `open --headers` 打开，Command 可以通过 `options.headers` 读取同一个对象。完整类型见 [`CliExtensionRunOptions`](extension-api.zh-CN.md#cliextensionrunoptions)。

Command 可以先在 `requires` 中声明另一个 Extension，再通过 `runExtension` 复用它的 Command：

```ts
{
  name: "verify-order",
  requires: ["account-tools"],
  run: async ({ runExtension }) => {
    const account = await runExtension("account-tools", {
      command: "resolve-account",
      args: ["checkout"],
      options: { role: "buyer" }
    });
    return { account };
  }
}
```

被调用的 Command 会复用当前页面和会话，直接返回原始结果，不会额外输出一份 CLI 结果，也不会触发 Hook。依赖缺失只影响声明它的 Command。如果 Command 必须依赖自己 Extension 的 `open` 准备工作，可以加 `requiresOpenHook: true`。

### Hooks

Hooks 在 OpenRuntime 页面打开、技术栈识别和关闭阶段执行。Hook 应只完成当前阶段必要的工作，不要把完整诊断流程塞进入口或 Hook。

#### `open`

`open` 在浏览器真正打开 URL 前运行，可以返回页面初始化脚本：

```ts
import type { OpenRuntimeExtensionHooks } from "@openruntime/cli";

export const open: NonNullable<OpenRuntimeExtensionHooks["open"]> = async () => {
  return {
    scripts: ["globalThis.__TEAM_MARKER__ = true;"]
  };
};
```

Hook 可以通过 `options.headers` 读取解析后的 `open --headers` 对象；命令没有传入 header 时为 `undefined`。后续 Extension Command 会收到同一个对象。多个 Extension 的脚本会与 OpenRuntime 自身脚本合并。某个 Extension 失败不会阻止其他 Extension 或页面继续打开。

#### `detectStack`

`detectStack` 只在执行 `openruntime stack` 时运行，不会拖慢 `openruntime open`：

```ts
import type { OpenRuntimeExtensionHooks } from "@openruntime/cli";

export const detectStack: NonNullable<
  OpenRuntimeExtensionHooks["detectStack"]
> = async ({ openruntime }) => {
  const detected = await openruntime.browser.eval(
    "globalThis._MODERNJS_ROUTE_MANIFEST != null"
  );
  if (!detected) return;

  return {
    id: "modernjs",
    name: "Modern.js",
    evidence: ["window._MODERNJS_ROUTE_MANIFEST"],
    recommendedExtensions: ["@scope/modern-tools"]
  };
};
```

识别结果只返回简短证据，不要包含完整页面配置或敏感值。相同页面和相同识别器集合会复用最近结果；`openruntime stack --refresh` 会强制重新识别。

#### `close`

`close` 用于清理同一次 `open` 中创建的页面外资源：

```ts
import type { OpenRuntimeExtensionHooks } from "@openruntime/cli";

export const close: NonNullable<OpenRuntimeExtensionHooks["close"]> = async () => {
  // 关闭这个 Extension 自己创建的资源。
};
```

只有成功参与对应 `open` 的 Extension 会收到 `close`。当页面被 `stop`，或被同一工作目录中的另一次 `open` 替换时，它都会运行。清理失败会被记录，但不会阻止页面生命周期继续。

Hook 默认并行执行。需要控制顺序时，使用对象形式：

```ts
hooks: {
  open: {
    after: ["account-tools"],
    requires: ["environment-tools"],
    run: async options => {
      // ...
    }
  }
}
```

`before` 和 `after` 只控制先后顺序；`requires` 还要求被引用的 Hook 必须存在并成功完成。OpenRuntime 会根据已加载的 Extension 列表算出并行批次，`close` 按 `open` 的相反顺序执行。Hook 结果不会传给后续 Hook，一个 Hook 失败也不会停止无关 Hook。

Hook 参数和返回类型见 [Hooks API](extension-api.zh-CN.md#hooks)。

### Skills

复杂 Command 可以声明一个现有 `SKILL.md` 的绝对路径：

```ts
import { fileURLToPath } from "node:url";

{
  name: "foo",
  skill: {
    path: fileURLToPath(new URL("./SKILL.md", import.meta.url))
  },
  run: async options =>
    await (await import("./commands/foo.mjs")).runFoo(options)
}
```

`openruntime foo --skill` 只输出 Skill 路径，不执行 Command。Skill 应说明适用场景、参数、判断方法和验证标准，不要重复可以从 `--help` 直接得到的内容。

## 使用 Extension API

Command 通过 `options.openruntime` 访问 OpenRuntime 能力：

| 任务 | 优先使用 |
| --- | --- |
| 读取和操作当前页面 | `openruntime.browser` |
| 收集截图、Network、Console、内存和代码执行证据 | `openruntime.browser` 下的对应能力 |
| 读取应用主动声明的内部状态 | `targets`、`snapshot`、`events`、`actions` |
| 执行页面声明的动作并等待结果 | `runAction`、`waitFor` |

页面没有接入 Runtime Core 时，浏览器相关能力仍然可用。只有 Command 确实需要应用内部事实时，才要求 connected runtime。

执行动作后继续读取页面结果或使用 `waitFor` 等待明确状态。不要仅凭 `page` 存在或动作已经运行就宣布验证成功。

完整方法、字段和边界见 [`OpenRuntimeExtensionApi`](extension-api.zh-CN.md#openruntimeextensionapi)。

## 本地开发

### 直接加载本地入口

先完成构建，再让 `OPENRUNTIME_EXTENSIONS_DIR` 直接指向生成的 `.mjs` 入口。这样不会污染正式扩展目录：

```sh
cd my-extension
pnpm build

OPENRUNTIME_EXTENSIONS_DIR="$PWD/dist/extension.mjs" \
  openruntime --help

OPENRUNTIME_EXTENSIONS_DIR="$PWD/dist/extension.mjs" \
  openruntime foo --help

OPENRUNTIME_EXTENSIONS_DIR="$PWD/dist/extension.mjs" \
  openruntime foo inspect --name demo
```

先确认顶层 help 中出现了 Command，并通过该 Command 自己的 help 检查详细用法，再运行无需页面的路径。实现文件通过动态导入加载，因此修改后直接重跑命令即可，不需要常驻开发进程。

### 验证页面路径

页面类 Command 先处理没有最近页面的情况，再使用代表性页面验证：

```sh
export OPENRUNTIME_EXTENSIONS_DIR="$PWD/dist/extension.mjs"
openruntime open https://example.com --no-bridge
openruntime foo inspect
openruntime stack --refresh
openruntime stop
```

修改后始终回到相同账号、环境和用户路径验证结果。

### 运行仓库 demo

仓库内的[本地 CLI Extension demo](../demos/cli-extension/README.zh-CN.md)包含可直接运行的 Command、三个 Hook 和测试。它展示了：

- 读取位置参数和选项。
- 成功时返回结果，失败时抛出清晰错误。
- 在页面不存在时给出明确下一步。
- 读取当前页面和 `open` 注入的标记。
- 通过 `detectStack` 返回识别结果。

## 发布 npm 包

发布前先构建自包含产物，再检查实际包内容：

```sh
npm pack --dry-run
```

确认包中只包含 Extension 入口、按需加载的实现、Skill 和必要资源，不包含源码密钥、测试账号、登录状态、录制数据或无关的大文件。

打包后先安装本地 `.tgz` 做最终验证：

```sh
openruntime extensions add ./scope-my-extension-1.0.0.tgz
openruntime extensions list
openruntime --help
openruntime foo --help
```

## 验证 Extension

交付前至少确认：

1. `openruntime --help` 能发现 Command，入口没有加载错误，并且 `openruntime <command> --help` 能展示详细用法。
2. 运行无关命令时，实际实现文件没有被提前加载。
3. 无需页面的 Command 在没有执行 `openruntime open` 时也能运行。
4. 需要页面的 Command 在没有页面时返回明确下一步。
5. 缺少参数、重复选项、未知子命令和失败路径都有确定结果。
6. `open`、`stack` 和 `stop` 分别触发对应的 `open`、`detectStack` 和 `close` Hook。
7. 一个 Hook 失败时，其他 Extension 和页面仍能工作。
8. 在真实或代表性页面上完成操作，并验证最终页面或 Runtime 结果。
9. `npm pack --dry-run` 中只包含预期文件。

仓库内开发还应运行 Extension 自己的测试和 `@openruntime/cli` 的扩展测试，确认加载、Hook 隔离和结构化输出没有被破坏。
