# 读取应用状态并执行页面声明动作

这个例子展示 OpenRuntime 如何让 Agent 从页面外读取一个订单页面的状态和事件，执行页面允许的刷新动作，并等待最终结果。页面同时显示当前状态和最近事件，方便对照命令返回的内容。

完整操作方式和多 Runtime 场景见 [浏览器连接与多 Runtime 使用指南](../../docs/runtime-connections.zh-CN.md)。

## 准备

在仓库根目录先构建一次：

```bash
pnpm build
```

## 启动

开第一个终端，启动 demo 页面：

```bash
pnpm --filter @openruntime/demo-bridge-readonly dev
```

开第二个终端，用 CLI 打开页面。CLI 会自动启动 Bridge，并在页面加载前放入连接管理器：

```bash
pnpm exec openruntime open http://localhost:19080/ --ui
```

## 验收

继续在终端执行下面命令。

查看已连接页面：

```bash
pnpm exec openruntime runtimes
```

读取页面声明的 targets：

```bash
pnpm exec openruntime targets --url http://localhost:19080/
```

读取页面当前状态：

```bash
pnpm exec openruntime snapshot --url http://localhost:19080/
```

读取页面事件：

```bash
pnpm exec openruntime events --url http://localhost:19080/ --limit 8
```

读取页面声明的 actions：

```bash
pnpm exec openruntime actions --url http://localhost:19080/
```

读取 action 的输入选项：

```bash
pnpm exec openruntime input-options --url http://localhost:19080/ --action demo.refresh-orders --input source
```

执行页面声明的 action：

```bash
pnpm exec openruntime run-action --url http://localhost:19080/ demo.refresh-orders --payload '{"amount":2,"source":"cli"}'
```

等待 action 后的状态：

```bash
pnpm exec openruntime wait-for --url http://localhost:19080/ business:orders ready --timeout 5000
```

页面上点 `Loading`、`Error`、`Ready` 或 `Add order` 后，再执行 `snapshot` 和 `events`，应该能看到状态和事件变化。

## 预期结果

- `runtimes` 里能看到一个 `connected` 的 runtime，`url` 是 `http://localhost:19080/`。
- `targets` 里能看到 `app:bridge-readonly-demo`、`route:/bridge-readonly`、`business:orders`。
- `snapshot` 里能看到这些 target 的当前状态。
- `events` 会随着页面按钮操作增加。
- `actions` 里能看到 `demo.refresh-orders`。
- `input-options` 能看到 `cli` 和 `demo` 两个来源选项。
- `run-action` 能增加 orders 数量。
- `wait-for` 能返回 `business:orders` 已经是 `ready`。

如果 Bridge 端口不是 `17321`，打开页面和后续命令都加上：

```bash
--port 17322
```

## 构建检查

这个 demo 也可以单独构建：

```bash
pnpm --filter @openruntime/demo-bridge-readonly build
```

构建后可以用 Rsbuild preview 查看：

```bash
pnpm --filter @openruntime/demo-bridge-readonly preview
```
