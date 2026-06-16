# Internal CLI Extensions

OpenRuntime 的开源 CLI 保持通用能力：Bridge、runtime 选择、targets、snapshot、events、actions、wait-for 和浏览器辅助命令。

内部业务可以在 CLI 里加自己的命令，例如：

```bash
openruntime vmok get-module-info
openruntime goofy <command>
```

这份文档描述的是当前内部扩展实现。它不是面向 npm 用户的公开 API 承诺，主要服务内部业务接入和后续把通用扩展机制整理成开源能力。

## 当前结构

CLI 扩展相关代码现在分成三层：

```txt
packages/cli/src/
  index.ts                    # CLI 总入口，解析一级命令并分发到内置命令或扩展命令
  args.ts                     # 轻量参数解析和 option 读取工具
  client.ts                   # Bridge HTTP client、runtime 选择、action/wait-for 封装
  extensions/
    types.ts                  # 扩展运行上下文类型
    vmok/
      index.ts                # vmok 示例扩展
```

当前分发链路：

1. `runCli` 调用 `parseCliArgs(argv)` 得到 `ParsedCliArgs`。
2. `runCli` 优先处理内置命令，例如 `start`、`snapshot`、`run-action`、`wait-for`。
3. 命中扩展一级命令时，例如 `vmok`，调用对应扩展入口。
4. 扩展入口拿到统一上下文，自行读取参数、选择 runtime、请求 Bridge，并把结果写到 stdout。

当前已接入的扩展命令：

```bash
openruntime vmok get-module-info [--bridge <url>] [--url <url> | --runtime <id>] [--target <target-id>]
openruntime vmok get-instance <name>
```

## 维护方式

不要把内部业务逻辑直接写进主 CLI 分发文件。主 CLI 只做两件事：

1. 识别一级扩展名，例如 `vmok`、`goofy`。
2. 把命令转交给 `packages/cli/src/extensions/<name>/`。

内部业务逻辑放在自己的目录里：

```txt
packages/cli/src/extensions/
  types.ts
  vmok/
    index.ts
  goofy/
    index.ts
```

这样开源版本可以保留稳定的扩展入口和示例，内部版本只维护自己的扩展目录。

新增业务扩展时，建议只改这些地方：

1. 新增 `packages/cli/src/extensions/<name>/index.ts`。
2. 在 `packages/cli/src/index.ts` 引入并分发一级命令。
3. 在 `createHelpText` 里补一行用法和必要示例。
4. 在 `packages/cli/test/index.test.ts` 补一条命令级测试。
5. 如果这个扩展是内部专用，只把可公开示例留在开源版本里。

## 扩展入口 API

扩展入口接收 `CliExtensionRunOptions`：

```ts
export interface CliExtensionRunOptions {
  args: ParsedCliArgs;
  stdout: {
    write(chunk: string): void;
  };
  fetcher: Fetcher;
  bridgeUrl: string;
  runtimeSelector: RuntimeSelector;
}
```

字段含义：

| 字段 | 作用 |
| --- | --- |
| `args` | 已解析的命令参数。`args.command[0]` 是一级扩展名，`args.command[1]` 通常是扩展子命令。 |
| `stdout.write` | 输出命令结果。推荐输出格式化 JSON，并以换行结尾。 |
| `fetcher` | 当前 CLI 使用的请求函数。测试里会注入 mock，扩展不要直接依赖全局 `fetch`。 |
| `bridgeUrl` | 已归一化的 Bridge 地址。默认是 `http://localhost:17321`，也会处理 `--bridge` 和 `--port`。 |
| `runtimeSelector` | 当前 runtime 选择条件，来自 `--runtime <id>` 或 `--url <url>`。 |

扩展入口返回 `Promise<number>`。成功返回 `0`，失败可以直接 `throw Error`。`runCli` 会统一捕获错误，写到 stderr，并返回 `1`。

## 参数工具

扩展可以复用 `packages/cli/src/args.ts`：

| API | 作用 |
| --- | --- |
| `getOptionValue(args, name)` | 读取最后一个 `--name` 值。适合单值参数。 |
| `getOptionValues(args, name)` | 读取所有同名参数。适合可重复参数。 |
| `getNumberOption(args, name)` | 把 `--name` 解析成数字；无法解析时返回 `undefined`。 |

当前参数解析支持三种写法：

```bash
--target vmok:module-info
--target=vmok:module-info
--flag
```

`--flag` 会被解析成字符串 `"true"`。

## Bridge Client API

扩展可以复用 `packages/cli/src/client.ts` 里的 Bridge client：

| API | 作用 |
| --- | --- |
| `fetchRuntimes(fetcher, bridgeUrl)` | 获取当前 Bridge 上所有 runtime。 |
| `selectRuntime(runtimes, runtimeSelector)` | 根据 `--runtime` 或 `--url` 选择 runtime；未指定时选择最近活跃的 connected runtime。 |
| `fetchRuntimeResource(fetcher, bridgeUrl, runtime, resource, searchParams)` | 读取 runtime 资源，例如 `snapshot`、`targets`、`events`、`actions`。返回 `{ runtime, result }`。 |
| `fetchInputOptions(fetcher, bridgeUrl, runtime, actionName, inputName, payload, timeout)` | 读取 action input 的动态选项。 |
| `runRuntimeAction(fetcher, bridgeUrl, runtime, actionName, payload)` | 执行 runtime action。 |
| `waitForRuntime(fetcher, bridgeUrl, runtime, targetId, status, timeout, where)` | 等待 target 进入指定状态。 |
| `normalizeBridgeUrl(input)` | 归一化 Bridge 地址，移除末尾 `/`，没有传值时使用默认端口。 |
| `requestJson(fetcher, url, init)` | 发起 JSON 请求，并把 Bridge 错误转换成 `Error`。仅在上面的封装不够用时使用。 |

典型扩展流程：

```ts
const targetId = getOptionValue(args, "target") ?? "vmok:module-info";
const runtimes = await fetchRuntimes(fetcher, bridgeUrl);
const runtime = selectRuntime(runtimes, runtimeSelector);
const query = new URLSearchParams();
query.set("id", targetId);

const snapshot = await fetchRuntimeResource<RuntimeSnapshot>(
  fetcher,
  bridgeUrl,
  runtime,
  "snapshot",
  query
);
```

如果扩展需要操作页面，优先用页面声明的 action：

```ts
const result = await runRuntimeAction(
  fetcher,
  bridgeUrl,
  runtime,
  "vmok.refresh",
  { force: true }
);
```

执行后继续用 `waitForRuntime` 验证最终状态，不要把 `run-action` 的返回值当成页面完成的证明。

```ts
await waitForRuntime(
  fetcher,
  bridgeUrl,
  runtime,
  "vmok:module-info",
  "ready",
  10000,
  undefined
);
```

## 输出约定

扩展命令应该输出 JSON，方便 Agent 和脚本继续消费。

推荐形状：

```json
{
  "runtime": {
    "runtimeId": "runtime-1",
    "url": "http://localhost:4412/",
    "status": "connected"
  },
  "result": {
    "targetId": "vmok:module-info",
    "status": "ready",
    "moduleInfo": {}
  }
}
```

约定：

- 顶层保留 `runtime`，方便调用方知道命中了哪个页面。
- 业务结果放在 `result`。
- 如果结果来自某个 target，保留 `targetId`、`status`、`updatedAt`。
- 调试信息可以放进 `result`，但不要输出 token、cookie、内网密钥或用户隐私数据。

## 开源版本

开源版本不应该包含真实内部业务细节。推荐规则：

- 通用扩展机制可以开源。
- 不含敏感信息的示例扩展可以开源，例如 `vmok get-module-info` 这种只演示 target 读取的命令。
- 真实内部平台能力放在内部扩展目录里维护。
- 发布开源版本时，只保留通用机制和可公开示例。

短期可以 copy 内部改动到开源仓库，但要限制在两个范围内：

1. 通用扩展机制。
2. 可公开的示例。

长期不要靠整包 copy 维护，否则内部命令会和开源 CLI 主逻辑互相污染。

推荐的长期结构：

1. 开源仓库保留 `extensions/types.ts`、示例扩展和分发机制。
2. 内部仓库维护真实业务扩展目录。
3. 内部发布时把内部扩展目录合入 CLI 包。
4. 开源发布时只包含可公开目录。

## VMOK 示例

读取模块信息：

```bash
openruntime vmok get-module-info --url http://localhost:4412
```

这个命令读取当前 runtime snapshot 里的 `vmok:module-info` target，并输出其中的 `data`。

页面侧需要注册并更新这个 target：

```ts
runtime.registerTarget({
  id: "vmok:module-info",
  type: "vmok.module-info",
  source: "vmok",
  statuses: ["ready", "error"],
});

runtime.updateSnapshot({
  id: "vmok:module-info",
  status: "ready",
  data: {
    modules: [
      {
        name: "example-module",
        version: "1.0.0",
      },
    ],
  },
});
```

如果业务方要换 target id，可以传：

```bash
openruntime vmok get-module-info --target custom:module-info --url http://localhost:4412
```

当前 VMOK 示例输出：

```json
{
  "runtime": {},
  "result": {
    "targetId": "vmok:module-info",
    "status": "ready",
    "updatedAt": 10,
    "moduleInfo": {},
    "target": {}
  }
}
```

这里保留完整 `target` 是为了排查时能看到原始 snapshot 内容。真实业务命令如果输出太大，可以只保留业务需要的字段。

读取 VMOK instance：

```bash
openruntime vmok get-instance shell
```

这个命令会对当前打开的浏览器页面执行一个临时脚本文件，核心逻辑先保持很薄：

```js
window.__VMOK__.instances.find(i=>i.name==='NAME')
```

命令输出：

```json
{
  "result": {
    "name": "shell",
    "value": {}
  }
}
```

`get-instance` 是一个临时内部调试命令，它读取页面全局变量，不走 OpenRuntime target。后续如果这个信息需要给 Agent 长期稳定使用，应改成页面侧注册 target 或 action。

## 新增业务命令 Checklist

以新增 `openruntime goofy get-session` 为例：

1. 新建 `packages/cli/src/extensions/goofy/index.ts`。
2. 导出 `runGoofyCommand(options: CliExtensionRunOptions): Promise<number>`。
3. 在 `runGoofyCommand` 内读取 `options.args.command[1]` 分发子命令。
4. 用 `getOptionValue` / `getOptionValues` 读取业务参数。
5. 用 `fetchRuntimes` + `selectRuntime` 选中页面。
6. 优先读取业务 target；需要触发页面行为时用 `runRuntimeAction`。
7. 需要等待结果时用 `waitForRuntime`。
8. 用 `stdout.write(JSON.stringify(value, null, 2) + "\n")` 输出结果。
9. 未知子命令直接 `throw new Error("Unknown goofy command ...")`。
10. 在 `packages/cli/src/index.ts` 增加一级命令分发。
11. 在 help 里补命令用法。
12. 在 CLI 测试里 mock Bridge 响应，验证请求路径和输出 JSON。

新增命令时不要做这些事：

- 不要绕过 Bridge 直接读浏览器全局变量。
- 临时内部调试命令除外，例如当前的 `vmok get-instance`；但长期稳定能力仍应收敛成 target 或 action。
- 不要在扩展里启动自己的 HTTP server。
- 不要把业务成功判断写成 DOM 文本匹配。
- 不要把内部平台 token、cookie 或环境变量打印出来。
- 不要让 `run-action` 自动代表成功；动作后的页面状态仍然要通过 target 验证。
