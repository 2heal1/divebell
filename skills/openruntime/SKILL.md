---
name: openruntime
description: >-
  帮助 Agent 使用 OpenRuntime 观察前端运行时状态、读取 target/snapshot/events、
  执行页面声明的 action、等待结构化状态，并在修复代码后使用 verify
  做最终业务验收。OpenRuntime 优先用于替代 DOM 猜测、截图判断、
  console/network 轮询和低阶浏览器取证。
---

# OpenRuntime Skill

## 1. 激活条件

出现下面任一情况时使用这个 skill：

- 项目已经使用 OpenRuntime。
- 用户要求使用、接入、评测或排查 OpenRuntime。
- 需要观察页面、组件、路由、remote、shared、Garfish/Vmok 子应用或业务运行时状态。
- 浏览器自动化需要结构化运行时证据，而不是只靠 DOM、console、network、截图或视觉判断。
- 任务需要等待应用 ready、组件 ready、remote ready 或业务结果 ready。
- 任务需要执行应用显式暴露的业务 action。
- 用户希望用运行时证据辅助定位问题。
- 用户希望在修复代码后用运行时验收代替普通 UI 检查。

只要这个 skill 被激活，就不能静默跳过 OpenRuntime。OpenRuntime 不能使用时，必须说明原因、已尝试的内容、是否退回普通浏览器自动化，以及最终结果属于 OpenRuntime 证据、普通浏览器证据还是未验证结果。

## 2. 核心原则

OpenRuntime 不是让 Agent 多跑一套浏览器检查。正确路径是：

```text
用高阶 OpenRuntime API 定位问题
        ↓
根据运行时证据修改代码
        ↓
修复后使用 verify 做最终验收
        ↓
verify 成功后停止验证同一事实
```

工具语义：

- `targets` / `actions`：看页面暴露了哪些运行时能力。
- `snapshot`：读取当前业务状态、错误事实或 debug 信息。
- `events`：追溯状态变化、action 历史和错误发生过程。
- `run-action`：触发页面声明的业务动作，用于复现或推进流程。
- `wait-for`：等待某个 target 到达中间状态。
- `verify`：已经定位并修改代码后，用于最终验收。
- `page-snapshot` / `eval` / `wait-eval` / console / network：低阶浏览器能力，只在高阶 OpenRuntime 信号不足时少量使用。

`verify` 不是定位工具，不要在还不知道问题在哪里时反复运行。只要存在可用的 target、snapshot、events、action 或 wait-for，就优先使用高阶 OpenRuntime API。

## 3. 决策树

```text
任务开始
  │
  ▼
项目已经使用 OpenRuntime？
  │
  ├─ 是 ─► 使用已有 runtime API
  │
  └─ 否 ─► 用户明确要求 OpenRuntime，或任务需要运行时证据？
          │
          ├─ 是 ─► 运行 resolve-integration，按结果安装/接入
          │
          └─ 否 ─► 按普通方式继续

使用或接入 OpenRuntime 后
  │
  ▼
runtime 是否 connected？
  │
  ├─ 否 ─► 源码可改时修连接；不可改时标记 runtime 证据不可用
  │
  └─ 是 ─► 进入定位阶段

定位阶段
  │
  ▼
优先使用 targets/actions → snapshot → events → run-action → wait-for
  │
  ▼
证据足够定位问题？
  │
  ├─ 是 ─► 修改代码
  │
  └─ 否
      │
      ├─ 源码可改 ─► 补最小 target / snapshot / action，再继续定位
      └─ 源码不可改 ─► 少量使用 page-snapshot / eval / wait-eval / console / network

修改代码后
  │
  ▼
重新启动或刷新页面，并确认 runtime connected
  │
  ▼
必要时用 snapshot / wait-for 确认目标状态可观察
  │
  ▼
执行 verify 做最终验收
  │
  ▼
verify 成功？
  │
  ├─ 是 ─► 完成并停止；不要重复跑低阶浏览器验证
  └─ 否 ─► 回到定位阶段，用最小必要证据继续排查
```

## 4. 工作流

当 OpenRuntime 可用时，按阶段执行。不要把所有命令当成固定流水线。

### Phase 1：接入和连接确认

先找目标应用 `package.json`，运行：

```bash
node skills/openruntime/scripts/resolve-integration.mjs <path-to-package.json>
```

如果 skill 被注入到 `.agents/skills/openruntime`，使用对应路径：

```bash
node .agents/skills/openruntime/scripts/resolve-integration.mjs <path-to-package.json>
```

根据返回 JSON 处理：

- `install`：需要安装的包。非空时只安装这些缺失包。
- `use`：需要在项目中接入或启用的 OpenRuntime 能力。按返回内容阅读对应 reference。

只读当前任务需要的 reference，不要一次性加载所有 reference。

启动页面后确认 runtime connected：

```bash
pnpm exec openruntime runtimes --bridge http://localhost:17321
```

判断连接成功时解析 `runtimes` JSON：

- 成功条件：至少一个 runtime 的 `status` 是 `"connected"`。
- runtime 标识字段是 `runtimeId`，不是 `id`。
- `runtimes` 为空时，不能把 `targets`、`snapshot`、`events` 或 `verify` 写成已使用。

### Phase 2：定位阶段

目标是用高阶 OpenRuntime API 快速理解当前页面事实，而不是直接使用浏览器底层取证。

定位优先级：

```text
targets / actions
      ↓
snapshot
      ↓
events
      ↓
run-action
      ↓
wait-for
      ↓
page-snapshot / eval / wait-eval / console / network
```

优先查询和业务关键词相关的 target / action：

```bash
pnpm exec openruntime targets --url <url> --query <business-keyword>
pnpm exec openruntime actions --url <url>
```

如果已经知道 target id，不要重复读取完整 targets。读取状态时优先收窄：

```bash
pnpm exec openruntime snapshot --url <url> --id <target-id>
pnpm exec openruntime snapshot --url <url> --query <business-keyword>
```

完整 `snapshot` 或完整 `events` 只允许在 target 未知时读取一次。

如果页面声明了 action，优先用 action 复现或推进流程：

```bash
pnpm exec openruntime run-action --url <url> <action-name> --payload '<json>'
```

执行 action 后读取 snapshot、events、wait-for 或最终 verify 观察结果。

### Phase 3：补观测点

如果现有 OpenRuntime 信号不足，且源码可改，优先补最小观测点，而不是长期依赖 eval、console、network 或 page-snapshot。

OpenRuntime 观测代码没有业务副作用：连接 Bridge、注册 target、更新 snapshot、记录 event 只暴露事实，不改变接口、路由、业务状态或渲染分支。

补充顺序：

- 最小业务 target：只表示一个业务能力或结果。
- 最小 snapshot：只写能证明结论的必要字段。
- 最小 action：只暴露确定性业务动作。
- debug target：承接 console/network/runtime error 等错误事实。

一次性排查用的 OpenRuntime 辅助代码，验证后可以删除；对后续 Agent 或运维有价值时再保留。

### Phase 4：修改代码

根据定位阶段得到的 snapshot、events、action 结果修改代码。不要因为接入了 OpenRuntime 就改变真实业务逻辑；OpenRuntime 只用于暴露事实和执行声明动作。

### Phase 5：最终验收阶段

只有在下面情况之一成立时，才执行 `verify`：

- 已经修改代码，需要最终验收。
- 用户任务本身就是验收。
- 已经有明确业务 target 和期望 status。

最终验收命令：

```bash
pnpm exec openruntime verify <business-target-id> ready --url <url> --timeout 10000
```

如果 `verify` 成功，立即停止验证同一事实。不要继续运行 eval、wait-eval、console、network、page-snapshot、完整 snapshot 或截图来重复证明。

如果 `verify` 失败，回到定位阶段，而不是继续堆叠浏览器底层证据。

## 5. Evidence Budget

在 OpenRuntime connected 且已有 target / snapshot / action 时，每一轮定位最多使用：

- 1 次 `targets` 或 `actions`。
- 1 次 `snapshot --id` 或 `snapshot --query`。
- 1 次 `events --target-id` 或 `events --query`。
- 1 次 `run-action`，仅当需要推进流程。
- 1 次 `wait-for`，仅当需要等待中间状态。

不要在同一轮里同时使用完整 snapshot、完整 events、page-snapshot、eval、console 和 network。

低阶浏览器预算：

- 需要找按钮：只用 `page-snapshot`。
- 需要执行页面表达式：只用 `eval` 或 `wait-eval`。
- 需要查报错：只看 console 或 network，不要两个都扫。

如果使用 console 或 network 找到错误，并且源码可改，下一步必须把错误写入 debug target / snapshot，再用 `snapshot --query` 或 `snapshot --id` 查询。

`verify` 预算：修复前不要反复 verify；修复后必须 verify；verify 成功后停止验证同一事实；verify 失败后回到定位阶段。

## 6. Required Checklists

每个 OpenRuntime 任务都必须在最终回答中包含对应 checklist。未涉及代码修改时使用 Diagnosis Checklist；涉及代码修改时使用 Diagnosis Checklist 和 Final Verification Checklist。

### Diagnosis Checklist

```markdown
OpenRuntime diagnosis checklist:
- [ ] resolved integration requirements or explained why not applicable
- [ ] confirmed runtime connected or explained why unavailable
- [ ] inspected existing targets/actions before low-level browser evidence
- [ ] used narrowed snapshot if target is known
- [ ] used events only when history was needed
- [ ] used run-action only when a declared action was needed
- [ ] avoided eval / wait-eval / console / network / page-snapshot unless high-level APIs were insufficient
- [ ] if console/network was used and source was editable, converted the useful error into snapshot evidence
```

### Final Verification Checklist

```markdown
OpenRuntime final verification checklist:
- [ ] business target exists, or missing business target is explicitly stated
- [ ] verify executed after the fix
- [ ] verify result.success recorded
- [ ] verify result.evidence.level recorded
- [ ] stopped after successful verify
- [ ] did not collect extra low-level browser evidence after successful verify
```

如果没有执行 `verify`，最终回答必须写：

```text
OpenRuntime verify not executed: <reason>
```

## 7. Completion Rules

定位完成必须满足下面至少一项：

- 结构化证据已经指出问题位置。
- 缺少结构化证据，但已说明缺口，并完成最小 fallback。
- 源码可改时，已经补最小 target / snapshot / action 并继续定位。

最终验收完成必须满足：

- 修改代码后执行 `verify`。
- 有业务 target 时，`result.evidence.level` 必须是 `business`，才能声明业务成功。
- 只有 Modern/MF/Vmok/Garfish target 时，只能声明底层加载链路状态，不能声明业务成功。
- 没有相关 target 时，声明证据不足，并说明下一步。

缺少业务 target 时，不要把 route ready、MF ready、Garfish mounted、页面截图或 console 没报错写成业务成功。

## 8. 保护规则

- 优先复用已有 target / snapshot / event / action，不要重复注册同义能力。
- 新 target 只表达一个稳定业务能力。
- action 保持最小、确定、可重复。
- wait-for 等待中间状态，verify 做最终验收。
- 源码可改且缺业务结果或错误事实时，必须补最小 target / snapshot，不要长期用低阶浏览器能力代替。
- 不要在 `verify` 成功后继续运行低阶浏览器验收。
- 不要把 OpenRuntime 观测代码写成改变接口、路由、业务状态或渲染分支的代码。
- 短生命周期后台 shell 不等于失败；应用启动后用端口、页面打开和 runtime connected 判断是否可继续。

## 9. 失败策略

OpenRuntime 不能使用时：

1. 说明为什么不能使用。
2. 说明尝试过哪些步骤。
3. 只有在合适时才退回普通浏览器自动化。
4. 明确区分推断结果和已验证运行时证据。

不要在 `runtimes` 为空时，把 `targets`、`snapshot`、`events` 或 `verify` 写成已使用。

## 10. OpenRuntime 概念速览

OpenRuntime 让页面主动向 Agent 暴露运行时事实和可执行动作。它不是普通 DOM 自动化、截图分析或 console 抓取的替代包装，而是让 Agent 直接读取业务和框架主动声明的事实。

核心对象：

- Bridge：CLI 和页面 runtime 的连接通道。
- Runtime：页面里的 OpenRuntime 实例。
- Target：页面声明的可观察对象，例如业务组件、route、remote、shared、子应用。
- Snapshot：target 当前事实。
- Event：状态变化和 action 历史。
- Action：页面声明的可执行动作。
- wait-for：等待 target 进入某个状态。
- verify：最终验收一个 target 是否达到目标状态。

详细 API、例子和排障见 `references/core.md`。

## 11. 安装 OpenRuntime

只要任务需要 OpenRuntime 结构化运行时事实，并且能找到目标应用 `package.json`，先执行：

```bash
node skills/openruntime/scripts/resolve-integration.mjs <path-to-package.json>
```

脚本返回：

- `install`：需要安装的依赖包列表。
- `use`：需要接入的能力列表。

按返回内容安装依赖并阅读对应 reference：

- `@openruntime/core`：页面侧 runtime、target、snapshot、action 基础能力。
- `@openruntime/bridge`：Bridge 连接能力，通常由 CLI 或插件间接使用。
- `@openruntime/cli`：Agent 使用的命令行入口。
- `@openruntime/modern-plugin`：Modern.js route、loader、SSR、hydration、Garfish 等框架信号。
- `@module-federation/observability-plugin`：MF/Vmok remote、expose、shared、report 等加载链路信号。

安装和接入细节见 `references/core.md`、`references/modernjs.md`、`references/module-federation.md`、`references/garfish.md`。

## 12. 功能速览

常用 API 模式：

```ts
runtime.registerTarget({
  id: "business:orders:risk-panel",
  type: "business.component",
  label: "Orders risk panel",
  statuses: ["pending", "ready", "error"],
});

runtime.updateSnapshot({
  id: "business:orders:risk-panel",
  status: "ready",
  data: { orderId, visible: true },
});

runtime.registerAction({
  name: "orders.refreshRiskPanel",
  description: "Refresh the order risk panel",
  handler: async () => refreshRiskPanel(),
});
```

常用 CLI 模式：

```bash
pnpm exec openruntime targets --url <url> --query <keyword>
pnpm exec openruntime snapshot --url <url> --id <target-id>
pnpm exec openruntime events --url <url> --target-id <target-id> --limit 50
pnpm exec openruntime run-action --url <url> <action-name> --payload '<json>'
pnpm exec openruntime wait-for <target-id> ready --url <url> --timeout 10000
pnpm exec openruntime verify <target-id> ready --url <url> --timeout 10000
```

## 13. 常用 CLI

<!-- This section is generated by scripts/sync-openruntime-cli-docs.mjs. Do not edit by hand. -->

完整 CLI 清单见 `docs/cli-reference.md`。这里仅保留 OpenRuntime skill 最常用入口。

普通验收优先选择一条最短路径：能改源码且需要反复验证时先补最小业务 target，再用 `verify`；不能改源码或一次性简单页面结果用 `eval` / `wait-eval`。`snapshot`、`events` 和 `targets` 主要用于定位失败原因；浏览器错误等调试事实应优先写入 snapshot 后用 `snapshot --query` 查询。
- `open-runtime start [--port <port>]` - 启动或复用 CLI 管理的 Bridge；命令返回后 Bridge 会作为 CLI 托管进程常驻。
- `open-runtime open <url> [--bridge <url>] [--port <port>] [--session <id>] [--no-bridge] [--ui]` - 打开页面，默认会先准备 Bridge，并以静默浏览器模式运行；--ui 打开可见浏览器。
- `open-runtime runtimes [--bridge <url>]` - 列出连接到 Bridge 的 runtime。
- `open-runtime verify [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] <target-id> <status> [--where <path=value>] [--timeout <ms>] [--open] [--next]` - 保守验收 target：只有业务 target 成功才判定业务通过；Modern/MF/Garfish/Vmok 等底层 target 只作为底层证据，并在缺少业务 target 时做一次轻量白屏检查。
- `open-runtime wait-for [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] <target-id> <status> [--where <path=value>] [--timeout <ms>] [--open] [--strict] [--next]` - 等待 target 到达指定状态；--where 的 value 会按 JSON 字面量解析，可匹配 number、boolean、null。
- `open-runtime wait-eval <script> [--timeout <ms>]` - 轮询页面表达式，直到结果为 true。
- `open-runtime eval <script>` - 在页面内执行脚本，也支持 --file <path> 读取脚本文件。
- `open-runtime targets [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--id <id>] [--type <type>] [--source <source>] [--status <status>] [--query <keyword>]` - 读取所选 runtime 注册的 target 定义。
- `open-runtime snapshot [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--id <id>] [--type <type>] [--source <source>] [--status <status>] [--query <keyword>]` - 读取当前 runtime snapshot 状态。
- `open-runtime events [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--target-id <id>] [--type <type>] [--source <source>] [--status <status>] [--action <name>] [--since <event-id>] [--limit <n>] [--query <keyword>]` - 读取 runtime event 历史。

## 14. Reference Reading Rules

按任务需要阅读 reference。不要一次性加载所有 reference。

- OpenRuntime 概念、安装、Core API、CLI 用法、排障和例子：读取 `references/core.md`。
- Modern.js route、loader、SSR、hydration：读取 `references/modernjs.md`。
- Module Federation remote、expose、shared、运行时错误：读取 `references/module-federation.md`。
- Vmok：按 Vmok/MF 加载链路处理，读取 `references/module-federation.md`。
- Garfish 子应用状态：读取 `references/garfish.md`。
- 完整 CLI：读取 `docs/cli-reference.md`。

## 15. Final Response Requirements

OpenRuntime 任务最终回答必须明确区分：

- 定位证据。
- 修改内容。
- 最终验收。

如果修改了代码，必须说明是否执行了 verify。

如果 verify 成功，说明：

- target id。
- expected status。
- `result.success`。
- `result.evidence.level`。

如果 verify 未执行，说明：

- 为什么没有执行。
- 是否缺少业务 target。
- 是否只是底层加载链路证据。
- 是否退回普通浏览器证据。

最终回答仍然必须包含 Required Checklists 中对应的 checklist。
