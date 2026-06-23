# Internal CLI Extensions

OpenRuntime 的开源 CLI 保持通用能力：Bridge、runtime 选择、targets、snapshot、events、actions、wait-for 和浏览器辅助命令。

内部业务命令通过 `@openruntime/cli` 暴露的扩展入口注册，不再直接写进开源 CLI 主入口。真实内部实现放在内部仓库 `/Users/bytedance/internal_repo/openruntime` 的 `@byted-openruntime/*` 包里维护。

## Public Extension Point

开源 CLI 暴露 `createOpenRuntimeCli({ extensions, packageInfo })`。默认导出的 `runCli` 不带任何内部扩展，行为仍然是公开 CLI。

内部 CLI 可以这样组装：

```ts
import {
  createOpenRuntimeCli,
  type OpenRuntimeCliExtension,
} from '@openruntime/cli';

const extension: OpenRuntimeCliExtension = {
  name: 'demo',
  commandReferences: [
    {
      category: 'Extensions',
      usage: 'open-runtime demo ping [--url <url>]',
      description: 'Runs a demo extension command.',
    },
  ],
  exampleReferences: [
    {
      command: 'open-runtime demo ping',
      description: 'Runs the demo extension.',
    },
  ],
  run: async (options) => {
    options.stdout.write('{"ok":true}\n');
    return 0;
  },
};

export const cli = createOpenRuntimeCli({
  extensions: [extension],
});
```

`createOpenRuntimeCli` 会拒绝两类扩展：

- 扩展名和内置命令重名，例如 `snapshot`。
- 多个扩展注册同一个一级命令名。

## Extension Context

扩展入口接收 `CliExtensionRunOptions`：

| 字段 | 作用 |
| --- | --- |
| `args` | 已解析参数。`args.command[0]` 是扩展名，`args.command[1]` 通常是子命令。 |
| `stdout` / `stderr` | 命令输出。推荐 stdout 输出 JSON。 |
| `fetcher` | 当前 CLI 使用的请求函数。测试里可以注入 mock。 |
| `browserRunner` | 复用公开 CLI 的浏览器能力。 |
| `bridgeUrl` | 已归一化的 Bridge 地址。 |
| `runtimeSelector` | 来自 `--runtime`、`--session`、`--url` 的 runtime 选择条件。 |

扩展可以从 `@openruntime/cli` 复用这些 helper：

- `getOptionValue`
- `getOptionValues`
- `getNumberOption`
- `fetchRuntimes`
- `selectRuntime`
- `fetchRuntimeResource`
- `runRuntimeAction`
- `waitForRuntime`
- `parseBrowserJsonOutput`

## Internal Package Direction

内部仓库维护同名多包：

```txt
@byted-openruntime/core
@byted-openruntime/cli
@byted-openruntime/modern-plugin
```

推荐边界：

- `@byted-openruntime/core` 依赖并重新导出 `@openruntime/core`，只补内部常量、target helper 和业务约定。
- `@byted-openruntime/cli` 依赖 `@openruntime/cli`，通过 `createOpenRuntimeCli` 注册内部命令。
- `@byted-openruntime/modern-plugin` 依赖并包装 `@openruntime/modern-plugin`，只加内部默认配置或 helper。

内部命令不要 import 回 `packages/cli/src/index.ts`。公开 CLI 文档也不要包含内部命令。

## Rules

- 长期稳定能力优先通过 target/action 暴露。
- 需要触发页面行为时优先用 `runRuntimeAction`。
- 执行 action 后继续用 `waitForRuntime` 验证页面状态，不要把 action 返回值当成最终成功证明。
- 临时内部调试命令可以使用浏览器能力，但只能留在内部包。
- 不要输出 token、cookie、内网密钥或用户隐私数据。
