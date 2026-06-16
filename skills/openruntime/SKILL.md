---
name: openruntime
description: >-
  帮助 Agent 为前端项目评估、接入或使用 OpenRuntime，设计最小 target/action，
  读取运行时状态、执行声明动作并等待目标状态，从而更快确认页面、组件、业务、
  Modern.js 和 Module Federation 的真实状态。Use when a task needs runtime
  evidence, wants to reduce UI guessing, or mentions OpenRuntime/@openruntime.
---

# OpenRuntime

OpenRuntime 让应用把运行时状态、事件和可执行动作开放给 Agent。
无论项目是准备接入、正在接入，还是已经接入，都优先考虑用 OpenRuntime
把关键状态变成可读取、可执行、可等待的信号，减少靠 UI、DOM 文本或截图猜测结果的时间。

## 什么时候使用

遇到下面情况，先用 OpenRuntime：

- 需要把页面、组件、业务 ready 变成结构化状态，而不是靠 UI 猜。
- 需要为项目设计或补充 OpenRuntime target、snapshot、event 或 action。
- 项目已经安装了 `@openruntime/core`、`@openruntime/bridge`、`@openruntime/cli` 或 `@openruntime/modern-plugin`。
- 页面已经暴露 OpenRuntime runtime，可以读取 `targets`、`snapshot`、`events` 或 `actions`。
- 需要确认页面、路由、loader、组件、业务状态、远程模块或共享依赖是否 ready。
- 需要执行页面声明的安全动作，然后等待结果。
- 需要排查 Modern.js 或 Module Federation 的运行时状态。

## 项目接入和命令入口

先判断项目当前处于哪一步：还没接入、正在接入，还是已经接入。
常用包分工如下：

- `@openruntime/core`：页面侧注册 target、更新 snapshot、注册 action。
- `@openruntime/bridge`：让页面 runtime 和 Agent 侧 CLI 跨进程通信。
- `@openruntime/cli`：Agent 侧读取状态、执行 action、等待 target。
- `@openruntime/modern-plugin`：Modern.js 项目自动暴露 route、loader、SSR、hydration 等状态。
- `@module-federation/observability-plugin`：MF 消费者项目接入后，OpenRuntime 才能稳定读取 remote、expose、shared 和报告信息。

项目还没接入时，先补页面侧最小 target/action，再用 Bridge 和 CLI 验证。
项目已安装 CLI 后，常用入口是：

```bash
pnpm exec openruntime <command>
```

如果页面已经打开，先找已连接 runtime：

```bash
pnpm exec openruntime runtimes
```

如果需要打开页面：

```bash
pnpm exec openruntime open <url>
```

有多个页面或多个 tab 时，尽量带上 `--url` 或 `--runtime`：

```bash
pnpm exec openruntime snapshot --url <url>
pnpm exec openruntime snapshot --runtime <runtime-id>
```

## 推荐工作流

1. 发现 runtime。

```bash
pnpm exec openruntime runtimes
```

2. 读取页面暴露了什么。

```bash
pnpm exec openruntime targets --url <url>
pnpm exec openruntime snapshot --url <url>
pnpm exec openruntime actions --url <url>
```

输出太多时使用过滤条件：

```bash
pnpm exec openruntime targets --url <url> --query route
pnpm exec openruntime snapshot --url <url> --id modern:route
pnpm exec openruntime events --url <url> --target-id modern:route --limit 30
```

3. 用 action 执行页面声明的操作。

```bash
pnpm exec openruntime run-action --url <url> <action-name> --payload '<json-object>'
```

如果 action 需要动态输入，先读取候选值：

```bash
pnpm exec openruntime input-options --url <url> --action <action-name> --input <input-name> --timeout 5000
```

4. 用 `wait-for` 等待最小范围 target 到达目标状态。

```bash
pnpm exec openruntime wait-for <target-id> <status> --url <url> --where <path=value> --timeout 10000
```

5. 失败时先看结构化状态和事件。

```bash
pnpm exec openruntime snapshot --url <url> --id <target-id>
pnpm exec openruntime events --url <url> --target-id <target-id> --limit 50
```

## 最小验证范围

验证“是否 ready”时，选最贴近目标的 OpenRuntime 信号：

- 路由是否加载：看 `modern:route`，必要时用 `--where pathname=/target-path`。
- loader 数据是否可用：看 route target 里的 loader 状态，或等待数据可用后才标记的业务 target。
- MF remote 模块是否加载：等待具体 expose target，例如 `mf:remote:<remoteName>:expose:<exposeName>`。
- 业务组件是否 ready：在组件真实 ready 的位置注册业务 target，例如 `business:ready:<scenario-id>`。

不要用宽泛的 app 级 target 证明深层业务组件已经 ready。
如果可以在更小范围注册 target，就在真实状态变化点注册和更新它。

页面侧常用 API：

```ts
runtime.registerTarget({
  id: "business:ready:orders",
  type: "business.ready",
  statuses: ["pending", "ready", "error"],
  source: "business",
});

runtime.updateSnapshot({
  id: "business:ready:orders",
  status: "ready",
  data: { count: orders.length },
});

runtime.registerAction({
  name: "orders.refresh",
  source: "business",
  risk: "safe",
  handler: async () => {
    await refreshOrders();
  },
});
```

Modern.js 项目可以优先使用 `@openruntime/modern-plugin` 的业务 ready helper：

```ts
import {
  markOpenRuntimeReady,
  markOpenRuntimeReadyError,
  registerOpenRuntimeReady,
  unregisterOpenRuntimeReady,
} from "@openruntime/modern-plugin";
```

## 什么时候看 UI

OpenRuntime 主要回答状态、事件、动作和运行时诊断问题。
如果一个 target 已经准确表达了页面、组件或业务 ready，不要再看整页 UI 重复确认同一个事实。

下面这些场景应该看 UI、截图或 DOM 几何信息：

- CSS、布局、间距、遮挡、层级、颜色、动画等视觉问题。
- 截图、canvas 像素、实际渲染效果。
- 页面没有接入 OpenRuntime，或者当前要判断的事实还没有对应 target/action。

如果缺少 target/action，且当前任务允许改代码，优先补最小 OpenRuntime 信号；
如果不能改代码，再退回 UI/DOM/截图证据。

## 常见任务

### 基础页面和业务验证

先看页面暴露的 target 和 action：

```bash
pnpm exec openruntime targets --url <url>
pnpm exec openruntime actions --url <url>
```

执行业务动作后等待业务 target：

```bash
pnpm exec openruntime run-action --url <url> orders.refresh
pnpm exec openruntime wait-for business:ready:orders ready --url <url> --timeout 10000
```

如果失败，再看 snapshot 和 events：

```bash
pnpm exec openruntime snapshot --url <url> --id business:ready:orders
pnpm exec openruntime events --url <url> --target-id business:ready:orders --limit 50
```

### Modern.js route / loader / SSR / hydration

等待路由：

```bash
pnpm exec openruntime wait-for modern:route ready --url <url> --where pathname=/orders --timeout 30000
```

读取当前 route 状态：

```bash
pnpm exec openruntime snapshot --url <url> --id modern:route
```

`modern:route.data.matches` 里会包含当前路由链、loader 状态、route component 状态和错误信息。
如果页面存在 SSR 或 hydration 状态，再读取 Modern.js 相关 target：

```bash
pnpm exec openruntime snapshot --url <url> --query modern
```

### MF remote / expose / shared 诊断

MF 场景优先让消费者项目接入 `@module-federation/observability-plugin`。
这个插件记录 remote、expose、shared、preload 等加载链路，并能生成 report。
OpenRuntime 的 MF target 和 report action 应基于这个观测数据，而不是自己重新猜 MF 加载过程。

浏览器运行时常见接入方式：

```bash
pnpm add @module-federation/observability-plugin
```

```ts
import { createInstance } from "@module-federation/runtime";
import { ObservabilityPlugin } from "@module-federation/observability-plugin";

createInstance({
  name: "runtime_host",
  remotes: [
    {
      name: "remote1",
      entry: "https://example.com/mf-manifest.json",
    },
  ],
  plugins: [
    ObservabilityPlugin({
      level: "verbose",
      browser: {
        enabled: true,
        scope: "runtime_host",
      },
    }),
  ],
});
```

先看 MF target：

```bash
pnpm exec openruntime targets --url <url> --type mf.remote
pnpm exec openruntime targets --url <url> --type mf.remote.expose
pnpm exec openruntime targets --url <url> --type mf.shared
```

等待具体 remote expose，而不是只等 remote 总览：

```bash
pnpm exec openruntime wait-for mf:remote:<remoteName>:expose:<exposeName> ready --url <url> --timeout 10000
```

排查 shared：

```bash
pnpm exec openruntime snapshot --url <url> --query <sharedName>
pnpm exec openruntime wait-for mf:shared:<sharedName>:<version>:<shareScope> loaded --url <url> --timeout 10000
pnpm exec openruntime wait-for mf:shared:<sharedName>:<version>:<shareScope> error --url <url> --timeout 10000
```

如果 MF observability 注册了报告 action，可以通过 OpenRuntime 读取详细诊断：

```bash
pnpm exec openruntime run-action --url <url> mf:list-reports --payload '{"remote":"<remoteName>"}'
pnpm exec openruntime run-action --url <url> mf:get-report --payload '{"traceId":"<trace-id>"}'
```
