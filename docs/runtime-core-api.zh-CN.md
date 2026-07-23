# Runtime Core API

English version: [Runtime Core API](runtime-core-api.md)

`@openruntime/core` 是 OpenRuntime 的页面侧 API。它让应用主动提供浏览器表面无法稳定获得的内部状态、关键事件、声明动作和等待条件。

Runtime Core 是可选增强，不是使用 OpenRuntime CLI、登录状态、浏览器调试或 Extensions 的前置条件。

## 什么时候使用

适合接入 Runtime Core 的情况：

- 页面外观无法可靠说明业务流程是否真正完成。
- Agent 需要知道哪个数据、模块、remote 或子应用仍在阻塞。
- 同一个业务结果会被 Agent、自动化脚本或 CI 长期验证。
- 页面需要明确声明允许 Agent 执行的动作、输入和风险。
- 团队需要等待真实业务状态，而不是使用固定延时或反复查询 DOM。

下面情况通常不需要接入：

- 一次性的页面问题已经能通过 Console、Network 或页面结果稳定定位和验证。
- 只需要内存、代码使用、截图或浏览器侧性能诊断。
- 需求可以完全由 Extension 在页面外部完成。
- 接入只为了证明项目“使用了 OpenRuntime”，没有长期调试或验证价值。

## 五类能力

- **Target**：声明页面中有哪些对象或业务结果可以被引用、观察和等待。
- **Snapshot**：记录 Target 当前的真实状态和必要数据。
- **Event**：记录状态或动作如何变化到现在。
- **Action**：声明页面允许 Agent 执行的动作、输入、可用性和风险。
- **waitFor**：等待某个 Target 到达指定状态。

这些能力用于提供应用内部事实，不应根据 DOM、Console 或 Network 反推后伪装成应用主动声明的状态。

## 最小接入

安装页面侧包：

```sh
pnpm add @openruntime/core
```

创建并安装 Runtime：

```ts
import {
  createOpenRuntime,
  installOpenRuntimeOnWindow,
} from "@openruntime/core";

const runtime = installOpenRuntimeOnWindow(createOpenRuntime());
```

已有框架插件或宿主 Runtime 时应复用现有实例，不要在多个入口重复创建。

## 提供稳定状态

先注册 Target，再更新 Snapshot：

```ts
runtime.registerTarget({
  id: "business:orders:list",
  type: "business.list",
  source: "orders",
  statuses: ["loading", "ready", "error"],
});

runtime.updateSnapshot({
  id: "business:orders:list",
  status: "ready",
  data: {
    count: orders.length,
  },
});
```

Target ID 应稳定、唯一、可读。`type` 和 `statuses` 由接入方声明，Core 不内置固定业务类型或状态。

Snapshot 只保存证明当前事实所需的数据。当前阻塞关系放在 Snapshot 的 `dependsOn` 中；Event 只记录这次变化，不承担当前状态查询。

## 声明允许动作

Action 只暴露页面明确允许 Agent 执行的稳定动作：

```ts
runtime.registerAction({
  name: "orders.refresh",
  description: "Refresh the current orders list.",
  source: "orders",
  risk: "safe",
  handler: async () => {
    await refreshOrders();
    return { accepted: true };
  },
});
```

Action 应明确风险、是否可用、输入约束和动态候选。`runAction` 只执行动作并记录 action event，不自动更新 Snapshot。动作后的结果仍由应用更新 Snapshot，Agent 使用 `waitFor` 验证。

## Agent 如何读取

OpenRuntime CLI 打开页面后，可以读取已经连接的 Runtime：

```sh
openruntime targets --session orders-debug
openruntime snapshot --session orders-debug --id business:orders:list
openruntime events --session orders-debug --target-id business:orders:list
openruntime actions --session orders-debug
openruntime run-action orders.refresh --session orders-debug
openruntime wait-for business:orders:list ready --session orders-debug
```

页面没有 Runtime Core 时，这些命令不会提供应用内部信息，但浏览器调试和 Extension 仍然可以正常使用。

## Runtime Core 与 Extension 的区别

| 需求 | 使用方式 |
| --- | --- |
| 测试账号、登录态和环境准备 | Extension 或 agent-browser Profile/state/auth |
| Console、Network、截图、内存、代码执行分析 | CLI 或 Extension |
| 团队专项诊断和验证命令 | Extension |
| 页面内部业务状态和阻塞关系 | Runtime Core |
| 页面允许 Agent 执行的稳定业务动作 | Runtime Core |

Extension 在页面外部组织开发调试流程；Runtime Core 在页面内部提供事实。两者可以组合，但不要求同时使用。

## 框架接入

框架或运行时已经知道的事实应由对应插件提供，不要在业务代码里重复探测：

- Modern.js 使用 `@openruntime/modern-plugin` 提供 route、loader、SSR、hydration 和 Garfish 状态。
- Module Federation 接入应复用 MF observability 提供的 remote、shared、expose 和 runtime error 信息。
- 普通应用或稳定业务结果可以直接使用 `@openruntime/core`。

框架缺少必要生命周期时，应优先补正式 hook，而不是在 OpenRuntime 中用 DOM、Console 或 Network 模拟框架状态。

更完整的字段、行为和示例见 [Core Reference](../skills/openruntime/references/core.md)。
