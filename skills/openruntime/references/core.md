# OpenRuntime Core Reference

本文档承接 `SKILL.md` 中不适合放在入口的细节。按需读取，不要在每个任务里完整加载。

## 目录

- OpenRuntime 是什么
- 安装和接入
- Bridge 和连接
- Target
- Snapshot
- Event
- Action
- wait-for 和 verify
- 低阶浏览器能力边界
- 排障
- 示例

## OpenRuntime 是什么

OpenRuntime 让前端应用把运行时状态、事件、可等待目标和声明动作开放给 Agent。目标是让 Agent 在 AI coding 中能自己验证页面、定位问题、执行安全动作并等待结果，减少人的中途介入。

OpenRuntime 的主要对象：

- Bridge：CLI 和页面 runtime 的连接通道。
- Runtime：页面中的 OpenRuntime 实例，负责注册 target、更新 snapshot、记录 event 和执行 action。
- Target：页面中可以被引用或等待的对象，例如业务组件、route、remote、shared 或子应用。
- Snapshot：target 的当前事实。它回答“现在是什么状态”。
- Event：状态变化、错误和 action 历史。它回答“状态怎么变成这样的”。
- Action：页面声明给 Agent 的安全动作。它回答“Agent 可以让页面做什么”。

OpenRuntime 不是 DOM 猜测、截图判断、console 轮询或 network 抓包的替代包装。它要求页面主动暴露结构化事实。

## 安装和接入

先运行 resolver：

```bash
node skills/openruntime/scripts/resolve-integration.mjs <path-to-package.json>
```

返回字段：

- `install`：需要安装的依赖包列表。
- `use`：需要接入或启用的能力列表。

常见包：

- `@openruntime/core`：页面侧基础能力，包括 create runtime、install runtime、register target、update snapshot、register action。
- `@openruntime/bridge`：Bridge 通信能力，通常不需要业务代码直接使用。
- `@openruntime/cli`：Agent 命令行入口。
- `@openruntime/modern-plugin`：Modern.js 框架信号。
- `@module-federation/observability-plugin`：MF/Vmok 加载链路信号。

如果 resolver 返回 Modern.js、MF、Vmok 或 Garfish 相关能力，只读取对应 reference。

## Bridge 和连接

源码可改时，必须在源码或框架插件配置里连接 Bridge；源码不可改时，明确标记 runtime evidence unavailable。

Core 直接接入示例：

```ts
import { createOpenRuntime, installOpenRuntimeOnWindow } from "@openruntime/core";

const runtime = installOpenRuntimeOnWindow(createOpenRuntime());

runtime.connectBridge({
  port: 17321,
});
```

连接确认：

```bash
pnpm exec openruntime runtimes --bridge http://localhost:17321
```

成功条件：至少一个 runtime 的 `status` 是 `"connected"`。如果 `runtimes` 为空，不要声称已经使用 targets、snapshot、events 或 verify。

## Target

Target 是页面声明给 Agent 的可观察对象。一个 target 应该只表达一个稳定能力或结果。

```ts
runtime.registerTarget({
  id: "business:orders:risk-panel",
  type: "business.component",
  label: "Orders risk panel",
  statuses: ["pending", "ready", "error"],
});
```

命名建议：

- 业务 target：`business:<area>:<capability>`。
- debug target：`debug:<area>:runtime-error`。
- 框架 target：由 Modern/MF/Garfish 插件生成。

不要重复注册同义 target。已有 target 能证明事实时，优先复用。

## Snapshot

Snapshot 是 target 的当前事实。只放能证明结论的必要字段，不要塞完整 DOM、完整接口响应或大量无关业务数据。

```ts
runtime.updateSnapshot({
  id: "business:orders:risk-panel",
  status: "ready",
  data: {
    orderId,
    visible: true,
    riskCount,
  },
});
```

错误写法：

```ts
runtime.updateSnapshot({
  id: "debug:consumer:runtime-error",
  status: "error",
  data: {
    message: error.message,
    stack: error.stack,
    pathname: location.pathname,
  },
});
```

查询：

```bash
pnpm exec openruntime snapshot --url <url> --id business:orders:risk-panel
pnpm exec openruntime snapshot --url <url> --query runtime-error
```

## Event

Event 用来追溯状态变化、action 历史和错误发生过程。只有需要历史时才读取 events。

```bash
pnpm exec openruntime events --url <url> --target-id business:orders:risk-panel --limit 50
pnpm exec openruntime events --url <url> --query runtime-error --limit 50
```

不要把完整 events 当成默认第一步。target 已知时收窄到 target id。

## Action

Action 是页面声明给 Agent 的动作。它应该最小、确定、可重复。

```ts
runtime.registerAction({
  name: "orders.refreshRiskPanel",
  description: "Refresh the order risk panel",
  handler: async () => refreshRiskPanel(),
});
```

执行：

```bash
pnpm exec openruntime run-action --url <url> orders.refreshRiskPanel --payload '{}'
```

执行 action 后，继续通过 snapshot、events、wait-for 或 verify 观察结果。`run-action` 本身不等于验收成功。

## wait-for 和 verify

`wait-for` 等待中间状态，适合导航、加载、action 后状态推进。

```bash
pnpm exec openruntime wait-for business:orders:risk-panel ready --url <url> --timeout 10000
```

`verify` 做最终验收，适合修改代码后的最后一步。

```bash
pnpm exec openruntime verify business:orders:risk-panel ready --url <url> --timeout 10000
```

业务成功必须由 business target 证明。Modern/MF/Vmok/Garfish target ready 只能证明底层加载链路，不证明业务 UI 成功。

## 低阶浏览器能力边界

低阶浏览器能力包括 `page-snapshot`、`eval`、`wait-eval`、console 和 network。

允许使用的情况：

- runtime disconnected 且源码不可改。
- 高阶 OpenRuntime 证据不足。
- 一次性普通页面验证。
- 需要把 console/network 错误转写成 debug snapshot。

使用后如果源码可改，要把有价值的事实转为 target / snapshot / action，再回到 OpenRuntime 证据链。

## 排障

### runtime 没有 connected

1. 确认页面已启动且 URL 可访问。
2. 确认 Bridge 端口一致。
3. 源码可改时，在源码或插件配置里连接 Bridge。
4. 源码不可改时，明确说明 runtime evidence unavailable，再使用普通浏览器 fallback。

### target 找不到

1. 先查已有 targets。
2. 确认 target id 是否写错。
3. 读取相关 reference 判断框架插件是否应该产生 target。
4. 源码可改时补最小 business target。

### snapshot 为空或信息不足

1. 确认 target 是否已经注册。
2. 确认 updateSnapshot 是否在目标状态变化时执行。
3. 只补能证明结论的字段。
4. 不要长期用 eval / console 代替 snapshot。

### action 执行了但结果不对

1. 读取 action event。
2. 读取目标 business snapshot。
3. 判断 action 是没执行、执行失败，还是执行后没有更新 snapshot。
4. 修复后用 verify 验收。

### wait-for 超时

1. 读取目标 snapshot。
2. 读取目标 events。
3. 判断 target 未注册、状态未更新、还是 where 条件不匹配。
4. 修改代码后再 verify。

### verify 失败

1. 读取 verify 输出。
2. 不要继续重复 verify。
3. 优先读取目标 snapshot 和 events。
4. 如果业务事实不足，源码可改时补最小 target / snapshot。
5. 修改后重新执行 verify。

## 示例

### 验证登录

```ts
runtime.registerTarget({
  id: "business:auth:login",
  type: "business.flow",
  label: "Login flow",
  statuses: ["pending", "ready", "error"],
});
```

```bash
pnpm exec openruntime run-action --url http://localhost:3000/login auth.login --payload '{"username":"demo"}'
pnpm exec openruntime snapshot --url http://localhost:3000/login --id business:auth:login
pnpm exec openruntime verify business:auth:login ready --url http://localhost:3000/login --timeout 10000
```

### 读取发布说明

```bash
pnpm exec openruntime snapshot --url <url> --query release-notes
pnpm exec openruntime verify business:release-notes:content ready --url <url> --timeout 10000
```

### 等待 remote ready

```bash
pnpm exec openruntime snapshot --url <url> --query opsConsoleProvider
pnpm exec openruntime wait-for mf:remote:opsConsoleProvider ready --url <url> --timeout 10000
```

remote ready 只证明底层加载链路。最终业务成功仍需要 business target。

### console 错误转 debug snapshot

```ts
window.addEventListener("error", (event) => {
  runtime.updateSnapshot({
    id: "debug:consumer:runtime-error",
    status: "error",
    data: {
      message: event.message,
      filename: event.filename,
      pathname: location.pathname,
    },
  });
});
```

```bash
pnpm exec openruntime snapshot --url <url> --id debug:consumer:runtime-error
```
