---
name: openruntime
description: >-
  帮助已接入或准备接入 OpenRuntime 的前端项目把页面、组件、业务动作、
  Modern.js、Garfish、Vmok 和 Module Federation 状态暴露成 target/action/snapshot，
  并通过 CLI 与 workflow 脚本完成连接检查、补接入提示和最终业务验收。
  Use when a task explicitly asks to use, evaluate, integrate, or troubleshoot
  OpenRuntime/@openruntime, or needs runtime evidence for frontend behavior.
---

# OpenRuntime Skill

OpenRuntime 让页面主动暴露运行时事实和声明动作，减少 Agent 依赖 DOM、截图、
console 或异步时机猜测。连接 Bridge、注册 target、更新 snapshot、记录 event
只暴露事实，不改变接口、路由、业务状态或渲染分支。

这个 skill 的重点是让 Agent 执行固定状态机。不要用自然语言判断替代 CLI 输出、
workflow JSON、退出码或 `nextAction`。

## 1. 什么时候使用

遇到下面任一情况，使用 OpenRuntime：

- 用户明确要求使用、接入、评测或排查 OpenRuntime。
- 项目已经使用 OpenRuntime、`@openruntime/*`、Modern.js、Garfish、Vmok 或 Module Federation。
- 需要用结构化运行时证据验证页面、组件、路由、remote、shared、子应用或业务状态。
- 需要执行页面声明的 action，或等待应用、组件、remote、business target ready。
- 需要把浏览器错误、全局变量、加载链路或业务结果沉淀成可查询的 snapshot。

如果只是普通浏览器自动化，且用户没有要求 OpenRuntime、项目也没有 OpenRuntime
上下文，不要因为本 skill 改变原本工具选择。

## 2. 执行状态机

OpenRuntime skill 只使用下面这条状态机：

```text
START
  -> OPEN_PAGE
  -> CONNECTED
  -> OBSERVE
  -> DISCOVERY_PROBE（可选）       # 初始没有足够 target 时，每轮最多一次低阶取证
  -> PATCH_OBSERVABILITY（可选）  # 缺少业务证据且源码可改时
  -> PATCH
  -> CONNECTED
  -> FINAL_VERIFY
  -> DONE | FALLBACK | BLOCKED
```

每个脚本状态最多 3 轮：

```text
exit 0 -> 进入下一步
exit 2 -> 按 nextAction 修改源码、补信号或重启页面，再重跑当前状态
exit 1 -> 停止并报告 BLOCKED
```

不要在 workflow 命令后追加 `|| true`。

### OPEN_PAGE

先启动目标应用，再用 OpenRuntime CLI 打开目标页面：

```bash
pnpm exec openruntime open <app-url> --bridge http://localhost:17321
```

CLI 会自动启动或复用本地 Bridge，不需要先单独运行 `openruntime start`。
只有在明确调试 Bridge 本身时，才手动运行 `start`。

### CONNECTED

用当前 OpenRuntime skill 的实际路径运行：

```bash
node <openruntime-skill-dir>/scripts/workflow.mjs connected \
  --package-json <path-to-package.json> \
  --bridge http://localhost:17321 \
  --url <app-url> \
  --out openruntime-evidence.json
```

`<openruntime-skill-dir>` 是当前 skill 目录。仓库内开发通常是 `skills/openruntime`；
被注入到其他环境时，使用注入后的实际目录。

`connected` 会自动执行 `resolve-integration`，把 `install` / `use` 写进
`openruntime-evidence.json`。如果当前工作目录没有 `open` 记录，它会要求先运行
`openruntime open`。如果已经 open 过但没有 connected runtime，它会按项目类型返回
应加入的 Modern plugin、MF/Vmok observability 或 Core runtime 连接代码。

源码可改时，必须按 `nextAction.snippets` 修改入口或 runtime 配置。
不要用浏览器 `eval` 做临时 Bridge 连接。

### OBSERVE

连接通过后，先复用已有高阶信号：

```bash
pnpm exec openruntime targets --url <app-url> --query <keyword>
pnpm exec openruntime actions --url <app-url>
pnpm exec openruntime snapshot --url <app-url> --query <keyword>
pnpm exec openruntime events --url <app-url> --target-id <target-id> --limit 50
```

完整 `snapshot` 或完整 `events` 只在目标未知时读取一次。一旦知道 target id，
后续必须用 `--id`、`--target-id`、`--query`、`--type` 或 `--status` 收窄。

优先级：

```text
targets / actions
  -> snapshot
  -> events
  -> run-action
  -> wait-for
  -> fallback browser evidence
```

OBSERVE 只负责定位，不负责最终业务验收。OBSERVE 如果已经得到足够线索，
直接进入 PATCH；如果已有 target/snapshot/events/actions 不足，再进入
DISCOVERY_PROBE。

### DISCOVERY_PROBE（可选）

低阶浏览器能力包括 `console`、`network`、`page-snapshot`、`eval`、
`wait-eval`。只有目标未知、已有 target/snapshot/events/actions 不足时，
才允许使用一次低阶 Discovery Probe。

每次使用低阶 Discovery Probe 后，必须立即记录并补 target：

```bash
node <openruntime-skill-dir>/scripts/workflow.mjs record-probe \
  --type <console|network|page-snapshot|eval|wait-eval> \
  --summary "<probe-result>" \
  --out openruntime-evidence.json
```

`record-probe` 返回 `mustAddTarget=true` 后，禁止继续使用 `console`、
`network`、`page-snapshot`、`eval` 或 `wait-eval`。必须先把这次 Probe
得到的线索转成 `business:*` 或 `debug:*` target，并执行：

```bash
node <openruntime-skill-dir>/scripts/workflow.mjs target-added \
  --target <business-or-debug-target-id> \
  --kind <business|debug> \
  --out openruntime-evidence.json
```

`target-added` 之后，只能用 `snapshot`、`events`、`wait-for` 或
`workflow verify` 继续排查。只有这些结构化证据仍然不足时，才允许下一次
低阶 Discovery Probe；下一次 Probe 后同样必须再次补 target。

只要同时满足下面三点，必须结束 DISCOVERY_PROBE，进入 PATCH：

- 已有业务失败证据。
- 已有 MF/shared/runtime-error/route/loader 等运行时证据指向问题层级。
- 已能定位到候选源码文件、配置文件或依赖选择。

满足上面条件后，不得继续使用 `page-snapshot`、`eval`、`wait-eval`、
`console`、`network` 或截图重复确认同一事实。

修复后如果 `workflow verify` 未通过，只能回到目标化证据：
Business target snapshot、相关 MF/shared target、相关 target events 或新的
`workflow verify` 结果。不要重新展开低阶浏览器取证。

### PATCH_OBSERVABILITY

如果缺少能证明业务结果的 target，且源码可改，先补最小业务信号。

```ts
runtime.registerTarget({
  id: "business:<area>:<capability>",
  type: "business.<capability>",
  statuses: ["ready", "error"],
  source: "<app-or-package>",
});

runtime.updateSnapshot({
  id: "business:<area>:<capability>",
  status: "ready",
  data: {
    // 只保留证明业务结果所需的字段。
  },
});
```

浏览器错误也应写成最小 debug target，例如 `debug:<area>:runtime-error`，
然后用 `snapshot --query runtime-error` 或 `snapshot --id <target-id>` 查询。

如果本轮是由 `record-probe` 触发的补信号，补完 target 后必须运行
`target-added` 解除 `mustAddTarget`。未解除前不得继续低阶 Discovery Probe。

补完信号后必须回到 `OPEN_PAGE -> CONNECTED -> OBSERVE`，不能直接宣称完成。
一次性排查补的 OpenRuntime 辅助代码，验证后可以删除；对后续 Agent 或运维有价值时再保留。

### PATCH

根据 OBSERVE 或 PATCH_OBSERVABILITY 得到的证据修改业务代码。
修改后必须重新打开或刷新页面，并回到 `CONNECTED`。

原因：

- dev server 可能需要重启。
- 页面可能需要刷新。
- runtime 连接可能已失效。
- 新增 target / snapshot / action 需要重新注册。
- 旧页面状态不能代表新代码状态。

### FINAL_VERIFY

修改代码后，必须用业务 target 执行最终验收：

```bash
node <openruntime-skill-dir>/scripts/workflow.mjs verify \
  --target <business-target-id> \
  --status ready \
  --bridge http://localhost:17321 \
  --url <app-url> \
  --out openruntime-evidence.json
```

通过条件：

- `success=true`
- `evidenceLevel=business`
- `businessVerified=true`

`modern:*`、`mf:*`、`vmok:*`、`garfish:*` 只证明底层加载状态，不能单独证明业务成功。
如果 `verify` 返回 `exit 2`，按 `nextAction` 补业务 target / snapshot 或修业务失败，
然后回到 `CONNECTED`。不要改用 DOM、console、截图或 `page-snapshot` 宣称业务验收成功。

如果 `verify` 返回 `exit 0` 且输出 `doneLock=true` / `terminal=true`，
必须立即进入 DONE。DONE 后只允许写结果和清理进程，禁止任何额外取证。

## 3. 停止条件 / fallback 边界

满足下面条件时停止重复取证或验证同一事实：

- `workflow verify` 通过，并写入 `doneLock=true`。
- 业务 target 已经 `ready`，且 snapshot 能证明业务结果。
- 同一个事实已经由 snapshot、events 或 wait-for 明确证明成功或失败。
- DISCOVERY_PROBE 的停止条件已经满足，必须停止继续低阶取证并进入 PATCH。

进入 DONE 后不要继续读取 snapshot、events、wait-for、network、console、
page-snapshot、截图或 eval。额外证据不会提高业务验证等级，只会增加噪音；
`doneLock=true` 后继续取证属于 violation。

fallback 只在 OpenRuntime 不能形成结构化证据时使用。源码可改且 OpenRuntime
可用时，不允许把低阶取证叫 fallback，必须走 `DISCOVERY_PROBE ->
record-probe -> PATCH_OBSERVABILITY -> target-added`。

只有下面情况才允许 fallback browser evidence：

- 源码不可改。
- 用户禁止改代码。
- OpenRuntime 依赖接入失败或 runtime 无法 connected。
- 目标应用进程无法保持运行。
- 当前任务只需要一次性 UI 入口、DOM 结构或视觉问题检查，且用户没有要求沉淀 runtime evidence。

fallback 每轮最多使用一种低阶浏览器能力：`page-snapshot`、`eval`、`wait-eval`、
`console` 或 `network`。fallback 不能写成 OpenRuntime 业务验收，也不能替代
`workflow verify`。

进入 BLOCKED 的情况：

- workflow 脚本 `exit 1`。
- 同一状态超过 3 轮仍未通过。
- 源码不可改且没有足够 runtime evidence。
- 没有 business target，且无法补 target。
- 目标应用进程无法保持运行。

报告 blocked 时写清楚当前状态、尝试次数、最后原因、已经尝试的 next action、
是否使用了 fallback。

## 4. Reference

只在需要对应细节时读取：

- Modern.js / EdenX 接入、route、loader、业务 ready helper：`references/modernjs.md`
- Module Federation / Vmok remote、expose、shared、observability：`references/module-federation.md`
- Garfish 子应用生命周期和 custom loader：`references/garfish.md`

## 13. 常用 CLI

<!-- This section is generated by scripts/sync-openruntime-cli-docs.mjs. Do not edit by hand. -->

完整 CLI 清单见 `docs/cli-reference.md`。这里仅保留 OpenRuntime skill 最常用入口。

普通验收优先选择一条最短路径：能改源码且需要反复验证时先补最小业务 target，再用 `verify`；不能改源码或一次性简单页面结果用 `eval` / `wait-eval`。`snapshot`、`events` 和 `targets` 主要用于定位失败原因；浏览器错误等调试事实应优先写入 snapshot 后用 `snapshot --query` 查询。
- `open-runtime start [--port <port>]` - 显式启动或复用 CLI 管理的 Bridge；多数命令会自动准备本地 Bridge，通常不需要手动运行。
- `open-runtime open <url> [--bridge <url>] [--port <port>] [--session <id>] [--no-bridge] [--ui]` - 打开页面，默认会先准备 Bridge，并以静默浏览器模式运行；--ui 打开可见浏览器。
- `open-runtime runtimes [--bridge <url>]` - 列出连接到 Bridge 的 runtime；本地 Bridge 不存在时会自动启动。
- `open-runtime verify [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] <target-id> <status> [--where <path=value>] [--timeout <ms>] [--open] [--next]` - 保守验收 target：只有业务 target 成功才判定业务通过；Modern/MF/Garfish/Vmok 等底层 target 只作为底层证据，并在缺少业务 target 时做一次轻量白屏检查。
- `open-runtime wait-for [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] <target-id> <status> [--where <path=value>] [--timeout <ms>] [--open] [--strict] [--next]` - 等待 target 到达指定状态；--where 的 value 会按 JSON 字面量解析，可匹配 number、boolean、null。
- `open-runtime wait-eval <script> [--timeout <ms>]` - 轮询页面表达式，直到结果为 true。
- `open-runtime eval <script>` - 在页面内执行脚本，也支持 --file <path> 读取脚本文件。
- `open-runtime targets [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--id <id>] [--type <type>] [--source <source>] [--status <status>] [--query <keyword>]` - 读取所选 runtime 注册的 target 定义。
- `open-runtime snapshot [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--id <id>] [--type <type>] [--source <source>] [--status <status>] [--query <keyword>]` - 读取当前 runtime snapshot 状态。
- `open-runtime events [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--target-id <id>] [--type <type>] [--source <source>] [--status <status>] [--action <name>] [--since <event-id>] [--limit <n>] [--query <keyword>]` - 读取 runtime event 历史。
