# 浏览器连接与多 Runtime 使用指南

这份文档说明如何让 OpenRuntime CLI 连接页面，以及一个页面存在多个 Runtime 时如何查看和操作它们。

英文文档见 [Browser Connections and Multiple Runtimes](runtime-connections.md)。

## 基本流程

页面只负责创建并登记 Runtime，不需要自己连接 Bridge。使用 CLI 打开页面时，CLI 会准备本地 Bridge，并在页面代码运行前放入连接管理器：

```bash
openruntime open http://localhost:3000 --ui
```

连接管理器会：

1. 连接页面已经登记的所有 Runtime。
2. 继续监听新登记的 Runtime，例如稍后挂载的微前端子应用。
3. 在 Runtime 被移除时只断开对应连接。
4. 在当前浏览器会话跳转或刷新后继续工作。

通常不需要提前执行 `openruntime start`。如果只需要浏览器能力、不需要 Runtime 连接，可以使用：

```bash
openruntime open http://localhost:3000 --no-bridge --ui
```

## 确认连接

打开页面后执行：

```bash
openruntime runtimes
```

单 Runtime 页面会返回一个已连接实例。微前端页面可能返回多个实例，例如下面这个经过精简的结果：

```json
{
  "runtimes": [
    {
      "runtimeId": "runtime-shell",
      "name": "shell",
      "source": "host",
      "status": "connected"
    },
    {
      "runtimeId": "runtime-orders",
      "name": "orders",
      "source": "micro-frontend",
      "parentRuntimeId": "runtime-shell",
      "status": "connected"
    }
  ]
}
```

后续命令需要使用这里返回的 `runtimeId`。如果没有结果，先确认页面是通过 `openruntime open` 打开的，并且页面已经登记 Runtime。

## 单 Runtime 操作

页面只有一个 Runtime 时，可以直接读取和操作：

```bash
openruntime targets
openruntime snapshot
openruntime events --limit 20
openruntime actions
openruntime run-action orders.refresh --payload '{"force":true}'
openruntime wait-for business:orders ready --timeout 5000
```

也可以通过 `--url` 或 `--session` 缩小页面范围：

```bash
openruntime snapshot --url http://localhost:3000
openruntime snapshot --session check-orders
```

## 多 Runtime 操作

同一页面有多个 Runtime 时，先运行 `runtimes`，再通过 `--runtime` 明确选择实例：

```bash
openruntime targets --runtime runtime-orders
openruntime snapshot --runtime runtime-orders
openruntime events --runtime runtime-orders --limit 20
openruntime actions --runtime runtime-orders
openruntime input-options --runtime runtime-orders --action orders.refresh --input source
openruntime run-action --runtime runtime-orders orders.refresh --payload '{"force":true}'
openruntime wait-for --runtime runtime-orders business:orders ready --timeout 5000 --strict
```

`--url` 和 `--session` 用于选择页面，但同一页面里的多个 Runtime 通常共享 URL 和 session，因此它们不能代替 `--runtime`。

读取类命令未指定 `--runtime` 时，会选择最近有响应的匹配实例。`run-action` 在匹配到多个实例时会拒绝执行，并提示可选的 Runtime ID。多 Runtime 场景建议所有命令都显式传 `--runtime`，避免读取或等待了错误的子应用。

`wait-for` 默认允许在页面刷新后跟随新出现的 Runtime，因此只有同时传入 `--runtime` 和 `--strict` 才会固定等待指定实例。微前端子应用的精确验收应使用这种写法。

## 微前端挂载与切换

假设页面包含一个主应用和一个按路由切换的子应用：

1. 主应用启动并登记自己的 Runtime，CLI 建立第一条连接。
2. 进入订单路由，订单子应用挂载并登记 Runtime，CLI 自动建立第二条连接。
3. 切换到结算路由，订单子应用移除自己的 Runtime，订单连接随之消失。
4. 结算子应用登记新的 Runtime，`openruntime runtimes` 会显示主应用和结算子应用。

不需要重新运行 `openruntime open`，也不需要为每个子应用创建 Bridge。

如果一个子应用卸载后又使用相同 Runtime ID 重新挂载，新连接会替换旧连接；旧连接的延迟退出不会断开新连接。

## 页面如何登记 Runtime

框架接入已经负责登记时，业务应用不需要重复处理。直接使用 Core SDK 时，可以在应用挂载时登记，在卸载时移除：

```ts
import {
  createOpenRuntime,
  installOpenRuntimeOnWindow,
  uninstallOpenRuntimeFromWindow
} from "@openruntime/core";

const runtime = createOpenRuntime();

installOpenRuntimeOnWindow(runtime, window, {
  runtimeId: "runtime-orders",
  name: "orders",
  source: "micro-frontend",
  parentRuntimeId: "runtime-shell"
});

// 子应用卸载时执行
uninstallOpenRuntimeFromWindow(runtime, window);
```

注意：

- 每个同时存在的实例必须使用不同的 Runtime ID。
- 同一种子应用可以同时挂载多份时，应把挂载标识加入 Runtime ID。
- 无法保证 ID 唯一时，可以不传 `runtimeId`，让 OpenRuntime 自动生成，再通过 `openruntime runtimes` 获取。
- `name`、`source` 和 `parentRuntimeId` 用于帮助识别实例，不参与命令选择。
- 不要在页面代码中手动连接 Bridge；连接由 `openruntime open` 统一管理。

## 使用指定 Bridge 或端口

连接已有 Bridge：

```bash
openruntime open http://localhost:3000 --bridge http://localhost:18000 --ui
openruntime runtimes --bridge http://localhost:18000
openruntime snapshot --bridge http://localhost:18000 --runtime runtime-orders
```

使用另一个本地端口：

```bash
openruntime open http://localhost:3000 --port 18000 --ui
openruntime runtimes --port 18000
```

打开页面和后续命令应使用同一个 Bridge 地址或端口。

## 推荐的验收顺序

```bash
openruntime open http://localhost:3000 --ui
openruntime runtimes
openruntime targets --runtime <runtime-id>
openruntime snapshot --runtime <runtime-id>
openruntime actions --runtime <runtime-id>
openruntime run-action --runtime <runtime-id> <action-name> --payload '{}'
openruntime wait-for --runtime <runtime-id> <target-id> <status> --strict
openruntime snapshot --runtime <runtime-id>
openruntime events --runtime <runtime-id> --limit 20
```

执行 Action 只表示页面已经接收并完成这次操作；最终结果仍应通过 `wait-for`、`snapshot` 或业务验收命令确认。
