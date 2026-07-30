# Divebell CLI Extension API 参考

English version: [Divebell CLI Extension API Reference](extension-api.md)

本文用于查询 Extension 定义、Command、Hook 和 `options` 的当前类型与使用约定。完整开发流程见 [CLI Extension 开发指南](cli-extensions.zh-CN.md)。

开发时通常直接从 `@divebell/cli` 导入 `DivebellExtensionDefinition`、`DivebellExtensionHooks`、`CliExtensionRunOptions` 和 `DivebellExtensionApi`。下文还会展开它们引用的子结构，便于查询字段；这些子结构不需要单独导入，可以由上层公开类型推导。

## Extension 定义

```ts
interface DivebellExtensionDefinition {
  schemaVersion: 1;
  name: string;
  requires?: readonly string[];
  displayName?: string;
  description?: string;
  commands?: readonly DivebellExtensionCommand[];
  hooks?: DivebellExtensionHooks;
}
```

| 字段 | 使用说明 |
| --- | --- |
| `schemaVersion` | 当前固定为 `1`。 |
| `name` | Extension 的稳定名称，必须匹配 `^[a-z][a-z0-9-]*$`，且不能与其他已加载 Extension 重复。 |
| `requires` | 必须安装、并允许通过 `options.runExtension` 调用的 Extension 名称。 |
| `displayName` | 可选的人类可读名称。 |
| `description` | 可选的简短用途说明。 |
| `commands` | 这个 Extension 注册的 Commands。命令名不能与内置或其他扩展命令重复。 |
| `hooks` | `open`、`detectStack` 和 `close` Hook。 |

定义必须至少包含一个 Command 或 Hook。Divebell 会在加载 Extension 列表时检查 `requires`；缺少依赖时不会加载这个 Extension，并明确提示需要安装哪个 Extension。TypeScript 入口建议直接标注为 `DivebellExtensionDefinition`；如果不生成声明文件，也可以使用 `satisfies DivebellExtensionDefinition`。测试和 CI 可以调用 `validateExtension(...)` 检查默认导出。

## Commands

```ts
interface DivebellExtensionCommand {
  name: string;
  requiresOpenHook?: boolean;
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

- `name` 是挂载到 `divebell` 下的命令名。
- `requiresOpenHook` 表示只有自己的 Extension 已在当前页面成功完成 `open`，这个 Command 才能执行。
- `commandReferences` 控制 `divebell <command> --help` 中展示的详细用法和说明。顶层 `divebell --help` 只展示命令名和简要说明。
- `skill.path` 必须是现有 `SKILL.md` 的绝对路径。
- `run` 成功时直接返回结果，失败时直接抛出错误。

### `CliExtensionRunOptions`

```ts
interface CliExtensionRunOptions {
  args: ParsedCliArgs;
  fetcher: Fetcher;
  page?: CliExtensionPageContext;
  headers?: Readonly<Record<string, string>>;
  divebell: DivebellExtensionApi;
  runExtension: CliExtensionRunFunction;
  withLoading: CliExtensionLoadingFunction;
}
```

| 字段 | 类型 | 使用说明 |
| --- | --- | --- |
| `options.args` | `ParsedCliArgs` | 当前命令解析后的参数。`command` 是命令名和位置参数组成的数组；`options` 是 `Map<string, string[]>`，同名选项可以出现多次。 |
| `options.page` | `CliExtensionPageContext \| undefined` | 最近一次成功执行 `divebell open` 后保存的页面上下文。无需页面的命令不要强制检查它；需要页面时必须先处理 `undefined`。 |
| `options.headers` | `Readonly<Record<string, string>> \| undefined` | 最近一次成功执行 `divebell open --headers` 时实际使用的完整 headers；打开页面时未传 headers 则为 `undefined`。 |
| `options.divebell` | `DivebellExtensionApi` | 读取 Runtime、操作当前页面、收集浏览器证据和等待结果的主要入口。 |
| `options.fetcher` | `Fetcher` | Divebell 内部使用的请求入口。通常不应直接调用；访问 Bridge 和 Runtime 时优先使用 `options.divebell`。 |
| `options.runExtension` | `CliExtensionRunFunction` | 调用当前 Extension 或已声明依赖中的 Command，并直接拿到原始结果。 |
| `options.withLoading` | `CliExtensionLoadingFunction` | 包裹可能耗时的工作；超过 400 毫秒仍未完成时，在终端显示一个 loading 动画。 |

### `options.args`

```ts
interface ParsedCliArgs {
  command: string[];
  options: Map<string, string[]>;
}
```

例如执行：

```sh
divebell foo inspect order-42 --format=json --tag smoke --tag checkout --verbose
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
} from "@divebell/cli";

const format = getOptionValue(options.args, "format");
const tags = getOptionValues(options.args, "tag");
const timeout = getNumberOption(options.args, "timeout");
```

`--flag` 会被解析成字符串 `"true"`。未知选项不会自动报错，Command 需要自行校验必填参数、允许值和组合关系。

### `options.runExtension`

```ts
interface CliExtensionRunRequest {
  command: string;
  args?: readonly string[];
  options?: Readonly<Record<
    string,
    string | number | boolean |
    readonly (string | number | boolean)[]
  >>;
}

interface CliExtensionRunFunction {
  <T = unknown>(
    extensionName: string,
    request: CliExtensionRunRequest
  ): Promise<T>;
}
```

先在 Extension 基础定义上统一声明依赖，再调用目标 Extension 的 Command：

```ts
{
  schemaVersion: 1,
  name: "order-workflow",
  requires: ["account-tools"],
  commands: [{
    name: "verify-order",
    run: async ({ runExtension }) => {
      const account = await runExtension<{ id: string }>("account-tools", {
        command: "resolve-account",
        args: ["checkout"],
        options: {
          role: "buyer",
          tag: ["smoke", "checkout"]
        }
      });
      return { accountId: account.id };
    }
  }]
}
```

`args` 只包含目标 Command 名称之后的位置参数。`options` 可以传单值或数组，目标 Command 会从自己的 `options.args` 中正常读取。目标会复用当前页面、会话、Runtime 选择、浏览器能力和嵌套的 `runExtension`。

目标结果会直接返回给调用方。嵌套调用不会额外输出一份 CLI 结果，也不会触发生命周期 Hook。调用同一个 Extension 内的其他 Command 不需要在 `requires` 中声明自己；调用其他 Extension 必须由调用方 Extension 统一声明。循环调用和超过 16 层的调用会失败，并给出完整调用链。

### `options.withLoading`

用它包裹 Command 中可能需要明显等待的部分：

```ts
interface CliExtensionLoadingFunction {
  <T>(run: () => T | PromiseLike<T>): Promise<T>;
}

const report = await options.withLoading(async () => {
  return await createReport();
});
```

400 毫秒内完成的工作不会显示动画。更慢的工作只会在交互式终端中显示一个动画，并在 Command 输出最终结果或错误前清除。嵌套或并行调用也会共用同一个动画。

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

- `url` 是最近一次记录到的页面地址；`openedUrl` 是传给 `divebell open` 的原始地址。
- `normalizedUrl` 用于稳定比较页面；`openedAt` 是毫秒时间戳。
- `bridgeUrl` 和 `sessionId` 可能为空，不能据此假设页面一定接入 Runtime SDK。
- 这个对象是最近打开页面的历史上下文。需要确认页面此刻的真实状态时，继续使用 `options.divebell.browser` 读取。

### Command 返回值和错误

Command 成功时直接返回结果。CLI 会把结果放入统一成功输出的 `data` 字段；没有显式返回值时，`data` 为 `null`。

```ts
return { count: 3 };
```

Command 失败时直接抛出错误。CLI 会把错误转换成统一错误输出并返回非零退出码。

## Skills

```ts
interface DivebellCommandSkill {
  path: string;
}
```

`path` 必须是现有 `SKILL.md` 的绝对路径。执行 `divebell <command> --skill` 时，CLI 只输出这个路径，不运行 Command。

## Hooks

实现独立 Hook 文件时，通过 `DivebellExtensionHooks` 推导参数和返回值：

```ts
import type { DivebellExtensionHooks } from "@divebell/cli";

export const open: NonNullable<DivebellExtensionHooks["open"]> =
  async options => ({ scripts: [] });
```

下面是三个 Hook 对应结构的展开说明：

```ts
interface DivebellExtensionHooks {
  open?: DivebellOpenHook | DivebellOrderedHook<DivebellOpenHook>;
  detectStack?:
    | DivebellDetectStackHook
    | DivebellOrderedHook<DivebellDetectStackHook>;
  close?(options: DivebellPageHookOptions): Promise<void>;
}

type DivebellOpenHook = (
  options: DivebellOpenHookOptions
) => Promise<DivebellOpenHookResult | void>;

type DivebellDetectStackHook = (
  options: DivebellPageHookOptions
) => Promise<
  DivebellStackDetection |
  readonly DivebellStackDetection[] |
  void
>;

interface DivebellOrderedHook<Handler> {
  run: Handler;
  before?: readonly string[];
  after?: readonly string[];
}
```

原来的函数简写仍然有效。只有需要控制顺序时，才使用对象形式：

```ts
hooks: {
  open: {
    after: ["account-tools"],
    run: async options => {
      // ...
    }
  }
}
```

没有顺序关系的 Hook 默认并行执行。Divebell 会在用当前 Extension 列表创建 CLI 时算好执行批次。`before` 和 `after` 只控制顺序：引用的 Hook 不存在或执行失败时，当前 Hook 仍可继续。必需的 Extension 统一在 Extension 基础定义上声明。出现顺序循环时，只停用循环中的 Hook。前一个 Hook 的返回值不会传给后一个 Hook。

`close` 不单独声明顺序。它按 `open` 批次的相反顺序执行；`open` 时并行的 Hook，在 `close` 时也并行。

### `open`

```ts
interface DivebellOpenHookOptions {
  args: ParsedCliArgs;
  url: string;
  openedUrl: string;
  headers?: Readonly<Record<string, string>>;
}

interface DivebellOpenHookResult {
  scripts?: readonly string[];
}
```

`open` 在浏览器真正打开 URL 前执行，可以返回一个或多个页面初始化脚本。`headers` 是 `open --headers` 最终生效值解析后的对象；命令没有传入 header 时为 `undefined`。Divebell 会把同一份 headers 保存在当前目录对应的页面记录中，并通过 `options.headers` 传给后续 Extension Command。如果其中包含账号凭据或 Token，也会一并保存，因此需要妥善保护本地 Divebell 状态目录。多个 Extension 的脚本会按 Hook 执行顺序合并并各自隔离；一个脚本抛错不会阻断后续 Extension 脚本或 Divebell 自己的页面初始化。某个 Hook 失败不会阻止无关 Extension 或页面继续打开。

### `detectStack` 与 `close`

```ts
interface DivebellPageHookOptions {
  args: ParsedCliArgs;
  page: CliExtensionPageContext;
  divebell: DivebellExtensionApi;
}

interface DivebellStackDetection {
  id: string;
  name: string;
  version?: string;
  evidence?: readonly string[];
  command?: string;
}
```

`detectStack` 只在执行 `divebell stack` 时运行，可以返回一个结果、多个结果或不返回结果。`command` 必须是当前 Extension 注册的一级命令；没有后续命令时可以省略。不要在 `evidence` 中包含完整页面配置或敏感值。

`close` 只会通知在同一次 `open` 中成功参与过的 Extension。当这个页面被 `stop`，或被同一工作目录中的另一次 `open` 替换时，它都会运行。清理失败会被记录，但不会阻止页面生命周期继续。

每个 Hook 最长运行 5 秒。超时会被记录为该 Extension 的 Hook 失败，不会阻塞其他 Extension。

## `DivebellExtensionApi`

`options.divebell` 是 Command 和页面 Hook 访问 Divebell 能力的主要入口。

| 能力 | API |
| --- | --- |
| 读取应用内部信息 | `targets`、`snapshot`、`events`、`actions` |
| 执行和等待页面声明能力 | `runAction`、`waitFor` |
| 操作和读取当前页面 | `browser.pageSnapshot`、`browser.click`、`browser.fill`、`browser.eval`、`browser.evalFile`、`browser.waitEval`、`browser.getWindow` |
| 收集浏览器证据 | `browser.screenshot`、`browser.network`、`browser.console` |
| 专项底层采集 | `browser.memory`、`browser.coverage` |

页面没有接入 Runtime SDK 时，`browser` 下的页面操作和诊断仍然可用。只有 Command 确实需要应用内部状态时，才要求 connected runtime。

Coding Agent 仍负责读取和修改项目代码。Extension API 没有统一的代码工作区或开发服务器管理接口；不要把扩展自己的文件访问包装成 Divebell 已经提供的通用代码能力。
