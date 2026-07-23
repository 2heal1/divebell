# OpenRuntime CLI Extension API 参考

English version: [OpenRuntime CLI Extension API Reference](extension-api.md)

本文用于查询 Extension 定义、Command、Hook 和 `options` 的当前类型与使用约定。完整开发流程见 [CLI Extension 开发指南](cli-extensions.zh-CN.md)。

开发时通常直接从 `@openruntime/cli` 导入 `OpenRuntimeExtensionDefinition`、`OpenRuntimeExtensionHooks`、`CliExtensionRunOptions` 和 `OpenRuntimeExtensionApi`。下文还会展开它们引用的子结构，便于查询字段；这些子结构不需要单独导入，可以由上层公开类型推导。

## Extension 定义

```ts
interface OpenRuntimeExtensionDefinition {
  schemaVersion: 1;
  name: string;
  displayName?: string;
  description?: string;
  commands?: readonly OpenRuntimeExtensionCommand[];
  hooks?: OpenRuntimeExtensionHooks;
}
```

| 字段 | 使用说明 |
| --- | --- |
| `schemaVersion` | 当前固定为 `1`。 |
| `name` | Extension 的稳定名称，必须匹配 `^[a-z][a-z0-9-]*$`，且不能与其他已加载 Extension 重复。 |
| `displayName` | 可选的人类可读名称。 |
| `description` | 可选的简短用途说明。 |
| `commands` | 这个 Extension 注册的 Commands。命令名不能与内置或其他扩展命令重复。 |
| `hooks` | `open`、`detectStack` 和 `close` Hook。 |

定义必须至少包含一个 Command 或 Hook。TypeScript 入口建议直接标注为 `OpenRuntimeExtensionDefinition`；如果不生成声明文件，也可以使用 `satisfies OpenRuntimeExtensionDefinition`。测试和 CI 可以调用 `validateExtension(...)` 检查默认导出。

## Commands

```ts
interface OpenRuntimeExtensionCommand {
  name: string;
  skill?: { path: string };
  commandReferences?: readonly CliCommandReference[];
  run(options: CliExtensionRunOptions): Promise<unknown>;
}

interface CliCommandReference {
  category:
    | "Bridge and Browser"
    | "Runtime"
    | "Extensions"
    | "External Extensions";
  usage: string;
  description: string;
}
```

- `name` 是挂载到 `openruntime` 下的命令名。
- `commandReferences` 控制 `openruntime <command> --help` 中展示的详细用法和说明。顶层 `openruntime --help` 只展示命令名和简要说明。
- `skill.path` 必须是现有 `SKILL.md` 的绝对路径。
- `run` 成功时直接返回结果，失败时直接抛出错误。

### `CliExtensionRunOptions`

```ts
interface CliExtensionRunOptions {
  args: ParsedCliArgs;
  fetcher: Fetcher;
  page?: CliExtensionPageContext;
  openruntime: OpenRuntimeExtensionApi;
}
```

| 字段 | 类型 | 使用说明 |
| --- | --- | --- |
| `options.args` | `ParsedCliArgs` | 当前命令解析后的参数。`command` 是命令名和位置参数组成的数组；`options` 是 `Map<string, string[]>`，同名选项可以出现多次。 |
| `options.page` | `CliExtensionPageContext \| undefined` | 最近一次成功执行 `openruntime open` 后保存的页面上下文。无需页面的命令不要强制检查它；需要页面时必须先处理 `undefined`。 |
| `options.openruntime` | `OpenRuntimeExtensionApi` | 读取 Runtime、操作当前页面、收集浏览器证据和等待结果的主要入口。 |
| `options.fetcher` | `Fetcher` | OpenRuntime 内部使用的请求入口。通常不应直接调用；访问 Bridge 和 Runtime 时优先使用 `options.openruntime`。 |

### `options.args`

```ts
interface ParsedCliArgs {
  command: string[];
  options: Map<string, string[]>;
}
```

例如执行：

```sh
openruntime foo inspect order-42 --format=json --tag smoke --tag checkout --verbose
```

得到：

```ts
options.args.command // ["foo", "inspect", "order-42"]
options.args.options.get("format") // ["json"]
options.args.options.get("tag") // ["smoke", "checkout"]
options.args.options.get("verbose") // ["true"]
```

CLI 同时提供参数读取工具：

```ts
import {
  getNumberOption,
  getOptionValue,
  getOptionValues
} from "@openruntime/cli";

const format = getOptionValue(options.args, "format");
const tags = getOptionValues(options.args, "tag");
const timeout = getNumberOption(options.args, "timeout");
```

`--flag` 会被解析成字符串 `"true"`。未知选项不会自动报错，Command 需要自行校验必填参数、允许值和组合关系。

### `options.page`

```ts
interface CliExtensionPageContext {
  url: string;
  openedUrl: string;
  normalizedUrl: string;
  bridgeUrl: string | null;
  sessionId: string | null;
  openedAt: number;
}
```

- `url` 是最近一次记录到的页面地址；`openedUrl` 是传给 `openruntime open` 的原始地址。
- `normalizedUrl` 用于稳定比较页面；`openedAt` 是毫秒时间戳。
- `bridgeUrl` 和 `sessionId` 可能为空，不能据此假设页面一定接入 Runtime Core。
- 这个对象是最近打开页面的历史上下文。需要确认页面此刻的真实状态时，继续使用 `options.openruntime.browser` 读取。

### Command 返回值和错误

Command 成功时直接返回结果。CLI 会把结果放入统一成功输出的 `data` 字段；没有显式返回值时，`data` 为 `null`。

```ts
return { count: 3 };
```

Command 失败时直接抛出错误。CLI 会把错误转换成统一错误输出并返回非零退出码。

## Skills

```ts
interface OpenRuntimeCommandSkill {
  path: string;
}
```

`path` 必须是现有 `SKILL.md` 的绝对路径。执行 `openruntime <command> --skill` 时，CLI 只输出这个路径，不运行 Command。

## Hooks

实现独立 Hook 文件时，通过 `OpenRuntimeExtensionHooks` 推导参数和返回值：

```ts
import type { OpenRuntimeExtensionHooks } from "@openruntime/cli";

export const open: NonNullable<OpenRuntimeExtensionHooks["open"]> =
  async options => ({ scripts: [] });
```

下面是三个 Hook 对应结构的展开说明：

```ts
interface OpenRuntimeExtensionHooks {
  open?(
    options: OpenRuntimeOpenHookOptions
  ): Promise<OpenRuntimeOpenHookResult | void>;
  detectStack?(
    options: OpenRuntimePageHookOptions
  ): Promise<OpenRuntimeStackDetection | readonly OpenRuntimeStackDetection[] | void>;
  close?(options: OpenRuntimePageHookOptions): Promise<void>;
}
```

### `open`

```ts
interface OpenRuntimeOpenHookOptions {
  args: ParsedCliArgs;
  url: string;
  openedUrl: string;
}

interface OpenRuntimeOpenHookResult {
  scripts?: readonly string[];
}
```

`open` 在浏览器真正打开 URL 前执行，可以返回一个或多个页面初始化脚本。多个 Extension 的脚本会合并；某个 Hook 失败不会阻止其他 Extension 或页面继续打开。

### `detectStack` 与 `close`

```ts
interface OpenRuntimePageHookOptions {
  args: ParsedCliArgs;
  page: CliExtensionPageContext;
  openruntime: OpenRuntimeExtensionApi;
}

interface OpenRuntimeStackDetection {
  id: string;
  name: string;
  version?: string;
  evidence?: readonly string[];
  recommendedExtensions?: readonly string[];
}
```

`detectStack` 只在执行 `openruntime stack` 时运行，可以返回一个结果、多个结果或不返回结果。不要在 `evidence` 中包含完整页面配置或敏感值。

`close` 只会通知在同一次 `open` 中成功参与过的 Extension。清理失败会被记录，但不会阻止浏览器关闭。

每个 Hook 最长运行 5 秒。超时会被记录为该 Extension 的 Hook 失败，不会阻塞其他 Extension。

## `OpenRuntimeExtensionApi`

`options.openruntime` 是 Command 和页面 Hook 访问 OpenRuntime 能力的主要入口。

| 能力 | API |
| --- | --- |
| 读取应用内部信息 | `targets`、`snapshot`、`events`、`actions` |
| 执行和等待页面声明能力 | `inputOptions`、`runAction`、`waitFor` |
| 操作和读取当前页面 | `browser.pageSnapshot`、`browser.click`、`browser.fill`、`browser.eval`、`browser.evalFile`、`browser.waitEval`、`browser.getWindow` |
| 收集浏览器证据 | `browser.screenshot`、`browser.network`、`browser.console` |
| 专项底层采集 | `browser.memory`、`browser.coverage` |

页面没有接入 Runtime Core 时，`browser` 下的页面操作和诊断仍然可用。只有 Command 确实需要应用内部状态时，才要求 connected runtime。

Coding Agent 仍负责读取和修改项目代码。Extension API 没有统一的代码工作区或开发服务器管理接口；不要把扩展自己的文件访问包装成 OpenRuntime 已经提供的通用代码能力。
