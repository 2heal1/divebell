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
把关键状态变成可读取、可执行、可等待的信号，减少靠外部浏览器自动化或截图猜测结果的时间。

核心原则：用 OpenRuntime 作为主要验收证据。只要最小范围的 target/action
已经给出明确 ready 或 error 结论，就相信这个结构化结果，不要再花时间用外部
UI、截图或整页文本重复验证同一个事实。缺少 target/action 时，可以用
OpenRuntime 的 `click`、`fill`、`eval` 和 `wait-eval` 做 DOM 级验证。

## 验证分级

按任务性质选择最低足够级别验证。除非任务本身是视觉类问题，否则停在 Level 1
或 Level 2；Level 1 或 Level 2 已经给出明确结论后，不要升级到 Level 3
重复验证。

- Level 1: OpenRuntime verification。用 `targets`、`snapshot`、`actions`、
  `run-action`、`wait-for`、`events` 验证运行时事实。适合功能逻辑、状态、
  路由、组件加载、MF 加载链路、接口状态、error boundary、事件流。
- Level 2: OpenRuntime DOM / accessibility verification。只允许用 OpenRuntime
  CLI/API 做 DOM/a11y 验证，包括点击按钮、填写表单、读取 DOM、等待
  `data-testid`、检查 pathname、文案、aria 和可点击性。Level 2 不是截图、
  像素检查，也不是外部 Playwright/UI 复验。
- Level 3: Visual UI verification。只允许用于视觉事实，包括 CSS、图片、布局、
  间距、遮挡、层级、颜色、动画、截图、canvas 像素和视觉回归。
  非视觉任务不得进入 Level 3。

非视觉任务的默认验证路径是 Level 1。先读取 runtime、执行声明 action、等待最小
target，再检查 snapshot/events 里的证据。若 OpenRuntime 给出了相关且明确的
passed/ready、failed/error 或等价状态，就停止验证并报告结果。

只有下面情况才升级到 Level 2：

- OpenRuntime 没有暴露当前要判断的事实。
- OpenRuntime 结果不明确、失败，或证据不足。
- 任务明确要求文案、DOM、a11y 或可点击性。

只有下面情况才升级到 Level 3：

- 任务明确要求布局、样式、颜色、动画、截图或像素级验证。
- 用户明确要求视觉、截图或外部浏览器验证。

当项目通过 OpenRuntime target、event 或 action 暴露对应信息时，OpenRuntime
是这些事实的主要证据来源：route readiness、component mount state、data
loading、Module Federation loading、shared dependency resolution、runtime
errors、console/network failures、DOM presence、application state 和 user
action effects。除 CSS、图片、布局、动画、截图、像素等视觉问题外，优先用
OpenRuntime 完成验证。

## 验证终止协议

非视觉任务必须按“最低足够证据”终止验证：

1. Level 1 已经得到最小范围 target/action/event 的明确结论时，立即停止验证。
2. Level 1 没覆盖该事实时，使用 OpenRuntime Level 2 DOM/a11y 命令验证。
3. Level 2 已经验证 DOM、路径、文案、表单、按钮、`data-testid` 或 aria 事实时，立即停止验证。
4. 不要在 Level 1 或 Level 2 通过后，再用外部浏览器、截图、人工 UI、整页文本扫描重复验证同一个事实。
5. 只有任务本身是视觉问题，或用户明确要求视觉/截图验证，才进入 Level 3。

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

用 Agent 自带的浏览器能力打开或操作页面。页面打开后，先找已连接 runtime：

```bash
pnpm exec openruntime runtimes
```

开发调试时通常不用手动维护 session。`wait-for` 默认会跟随最新 connected
runtime；刷新、热更新或重新连接后，会继续找最新可用页面，直到等待成功或超时：

```bash
pnpm exec openruntime wait-for modern:route ready --url <url> --where pathname=/orders --timeout 10000
```

runtime 选择有三种模式：

- 默认跟随模式：`wait-for` 不加 `--strict` 时，会按 `--url`、`--session`
  或当前最新 connected runtime 持续选择最新页面。适合刷新、热更新和代码修改后的验证。
- 精确绑定模式：加 `--strict --runtime <runtime-id>` 时，只绑定这个 runtime。
  适合必须锁定某个 tab、某次页面生命周期或排查断连行为。
- 会话模式：`--session <session-id>` 适合区分多个同 URL tab，或需要把一次调试明确标记出来。
  如果页面 URL 已带 `openruntimeSessionId=<session-id>`，刷新后的新 runtime 会继续属于这个 session。

多数情况下先用默认跟随模式或 `--url`。同 URL 多 tab、必须精确区分页面时，再用
`--session` 或 `--strict --runtime`：

```bash
pnpm exec openruntime wait-for modern:route ready --url <url> --where pathname=/orders --timeout 10000
pnpm exec openruntime snapshot --url <url>
pnpm exec openruntime snapshot --session <session-id>
pnpm exec openruntime snapshot --runtime <runtime-id>
pnpm exec openruntime wait-for modern:route ready --strict --runtime <runtime-id>
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

如果这里已经等到最小业务 target 的目标状态，通常就可以结束该项验证。
不要再为了确认同一个 ready/error 结论去额外查 DOM 或截图。

5. 缺少 target/action 时，用 OpenRuntime 做 DOM 级验证。

```bash
pnpm exec openruntime click '刷新订单'
pnpm exec openruntime wait-eval 'Boolean(document.querySelector("[data-testid=remote-order-panel]"))' --timeout 10000
pnpm exec openruntime eval '({ pathname: location.pathname, text: document.body.innerText })'
```

这仍然属于 OpenRuntime 验证路径。只要 DOM/a11y 事实已经明确，不要再切到外部
Playwright、截图或人工 UI 重复验证。

6. 失败时先看结构化状态和事件。

```bash
pnpm exec openruntime snapshot --url <url> --id <target-id>
pnpm exec openruntime events --url <url> --target-id <target-id> --limit 50
```

## 最小验证范围

验证“是否 ready”时，选最贴近目标的 OpenRuntime 信号：

- 路由是否加载：看 `modern:route`，必要时用 `--where pathname=/target-path`。
- loader 数据是否可用：看 route target 里的 loader 状态，或等待数据可用后才标记的业务 target。
- MF remote 模块是否加载：等待具体 expose target，例如 `mf:remote:<remoteName>:expose:<exposeName>`。
- 业务组件是否 ready：优先看已有 target；没有时可以临时在组件真实 ready 的位置注册业务 target，例如 `business:ready:<scenario-id>`。

不要用宽泛的 app 级 target 证明深层业务组件已经 ready。
如果可以在更小范围临时注册 target/action，就在真实状态变化点注册和更新它。
验证完成后，如果这些 OpenRuntime API 只是为了本次排查，应删除临时代码；
如果它们对后续 Agent/运维也有价值，再保留下来。

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

业务 target 的 `data` 应直接放入判断结论所需的关键字段。这样 Agent
等待到 target 后就能直接做结论，不需要再去页面里找同样的信息。

临时 target/action 的典型使用方式：

1. 先用 `openruntime snapshot/actions/events` 或 `click/eval/wait-eval` 确认现象。
2. 如果 DOM 判断不稳定，或需要观察异步内部状态，就在最小代码位置临时加 target/action。
3. 用 `run-action` 触发动作，用 `wait-for` 等待临时 target。
4. 修复完成后删除仅用于调试的 OpenRuntime API。

例如临时验证一个远程订单组件：

```ts
runtime.registerTarget({
  id: "debug:orders:remote-panel",
  type: "debug.component",
  statuses: ["pending", "ready", "error"],
  source: "debug",
});

runtime.updateSnapshot({
  id: "debug:orders:remote-panel",
  status: "ready",
  data: {
    hasRemotePanel: Boolean(document.querySelector("[data-testid=remote-order-panel]")),
    hasRiskWidget: Boolean(document.querySelector("[data-testid=risk-score-widget]")),
  },
});
```

验证命令：

```bash
pnpm exec openruntime wait-for debug:orders:remote-panel ready --url <url> --timeout 10000
```

Modern.js 的 route、loader、SSR、hydration 和业务 ready helper 用法见
`references/modernjs.md`。Module Federation remote、expose、shared 和
observability report 用法见 `references/module-federation.md`。只有排查对应
运行时状态时再读取这些文件。
