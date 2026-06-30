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
  -> PATCH
  -> CONNECTED
  -> FINAL_VERIFY
  -> DONE | BLOCKED
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

连接通过后，运行 `observe` 脚本来获取当前阶段应该使用的 OpenRuntime 工具；
只按脚本返回的 `nextAction` 继续：

```bash
node <openruntime-skill-dir>/scripts/workflow.mjs observe \
  --url <app-url> \
  --out openruntime-evidence.json
```

如果 `observe.nextAction.type=snapshot_observe`，只读已有插件 snapshot，不要默认读
`targets`、`actions` 或 `events`：

```bash
pnpm exec openruntime snapshot --url <app-url>
```

如果 snapshot 已经指向 MF shared、remote/expose、Modern route、loader 或 runtime
error 的问题层级，直接查源码、配置、依赖或 dist 产物并进入 PATCH。不要在定位阶段
为了形式补 `business:*` target。

推荐路径：

```text
snapshot 发现 shared/route/remote 异常
  -> 查配置/依赖/dist
  -> 修复
  -> snapshot 确认异常解除
  -> 补或复用最小 business target
  -> workflow verify
  -> DONE
```

如果 `observe.nextAction.type=browser_diagnose`，说明当前没有可用 MF/Modern/Vmok
插件 snapshot。此时正常使用 `console`、`page-snapshot`、`network`、`eval` 或
`wait-eval` 定位，不强制补 target。

没有插件 snapshot 时的推荐路径：

```text
没有 MF/Modern/Vmok snapshot
  -> 正常 console/page-snapshot/network 定位
  -> 修复
  -> 补或复用最小 business target
  -> workflow verify
```

### 补验收信号

`business:*` target 是最终验收必需项。诊断阶段不强制补；进入最终验收前必须补或复用
一个最小 business target：

- 对业务问题，target 表示业务结果，例如订单详情、风险组件、列表加载、表单提交是否成功。
- 对 MF/shared/route 这类底层问题，target 表示页面或业务入口已经恢复到用户可用状态。
- 对代码加载/执行问题，target 表示相关业务 JS 或 remote expose 已经完成关键执行。

如果页面 import 阶段可能崩溃，不要把失败 target 放在会崩的组件里。错误信号放在稳定
route、loader、error boundary 或宿主入口；业务 ready 信号放在真正渲染成功的位置。

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

如果只是为了定位错误，可以补最小 debug target，例如 `debug:<area>:runtime-error`，
然后用 `snapshot --query runtime-error` 或 `snapshot --id <target-id>` 查询；debug target
只能帮助定位，不能替代最终 business target。

补完 target 后，必须用 `openruntime snapshot` 读取刚补的 snapshot，确认 target 已注册且状态/data
符合预期：

```bash
pnpm exec openruntime snapshot --url <app-url> --id <target-id>
```

补完信号后必须回到 `OPEN_PAGE -> CONNECTED -> OBSERVE`，
不能直接宣称完成。
一次性排查补的 OpenRuntime 辅助代码，验证后可以删除；对后续 Agent 或运维有价值时再保留。

### PATCH

根据 snapshot observe 或 browser diagnose 得到的证据修改业务代码。
修改后必须重新打开或刷新页面，并回到 `CONNECTED`。

原因：

- dev server 可能需要重启。
- 页面可能需要刷新。
- runtime 连接可能已失效。
- 新增 target / snapshot 需要重新注册。
- 旧页面状态不能代表新代码状态。

### FINAL_VERIFY

最终统一用 business target 执行 `workflow verify`。插件 snapshot、console、
page-snapshot、network、eval 和截图都只能用于定位或辅助确认，不能作为 DONE 条件。

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

`modern:*`、`mf:*`、`vmok:*`、`garfish:*` 可以证明底层加载状态或错误解除，但不能单独证明任务完成。
即使任务目标是 MF/shared/route 修复，也必须补或复用一个最小 `business:*` target，
证明页面或业务入口已经恢复。

`verify` 返回 `exit 0` 且输出 `doneLock=true` / `terminal=true` 后，
必须立即进入 DONE。DONE 后必须百分百相信 `verify`，只允许读取已有 verify 输出 /
`openruntime-evidence.json` 来写结果，以及清理进程；严禁再调用 `snapshot`、`console`、
`page-snapshot`、`network`、`eval`、`wait-eval`、`wait-for`、`events`、`runtimes`、
截图、浏览器 UI 分析或再次 `verify` 来重复确认。

## 3. 停止条件 / fallback 边界

满足下面条件时停止重复取证或验证同一事实：

- `workflow verify` 通过，并写入 `doneLock=true`。
- `workflow verify` 已经证明业务 target 为 `ready`。
- MF/shared/route/runtime-error 问题已经由插件 snapshot 明确证明成功或失败，并且最终
  business verify 已通过。
- 同一个事实已经由 snapshot 或 business verify 明确证明。

进入 DONE 后不要继续读取 snapshot、events、wait-for、network、console、
page-snapshot、截图、eval、wait-eval、runtimes，也不要再次 verify。额外证据不会提高
业务验证等级，只会增加噪音；`doneLock=true` 后继续取证属于 violation。如果已经
误跑了额外命令，最终结果仍以第一次通过的 `verify` 为准，并在结果里标记 violation。

普通浏览器诊断是正常路径，不是 fallback。只有下面情况才进入 BLOCKED 或报告
OpenRuntime evidence 不可用：

- 源码不可改。
- 用户禁止改代码。
- OpenRuntime 依赖接入失败或 runtime 无法 connected。
- 目标应用进程无法保持运行。
- business target 无法补、无法复用。

进入 BLOCKED 的情况：

- workflow 脚本 `exit 1`。
- 同一状态超过 3 轮仍未通过。
- 源码不可改且没有足够 runtime evidence。
- 没有 business target 且无法补 target。
- 目标应用进程无法保持运行。

报告 blocked 时写清楚当前状态、尝试次数、最后原因和已经尝试的 next action。

## 4. Reference

只在需要对应细节时读取：

- Modern.js / EdenX 接入、route、loader、业务 ready helper：`references/modernjs.md`
- Module Federation / Vmok remote、expose、shared、observability：`references/module-federation.md`
- Garfish 子应用生命周期和 custom loader：`references/garfish.md`

## 13. 常用 CLI

<!-- This section is generated by scripts/sync-openruntime-cli-docs.mjs. Do not edit by hand. -->

完整 CLI 清单见 `docs/cli-reference.md`。这里仅保留 OpenRuntime skill 最常用入口。

定位优先读取已有插件 `snapshot`，尤其是 MF/shared、remote、Modern route 和 runtime-error。最终验收必须补或复用最小 `business:*` target，并使用 `verify`；通过后百分百相信 verify，只允许写结果和清理，严禁再调用 `snapshot`、`console`、`page-snapshot`、`network`、`eval`、`wait-eval`、截图或再次 `verify`。没有 MF/Modern/Vmok 插件 snapshot 时，正常使用 `console`、`page-snapshot`、`network`、`eval` 或 `wait-eval` 定位。
- `open-runtime start [--port <port>]` - 显式启动或复用 CLI 管理的 Bridge；多数命令会自动准备本地 Bridge，通常不需要手动运行。
- `open-runtime open <url> [--bridge <url>] [--port <port>] [--session <id>] [--no-bridge] [--ui]` - 打开页面，默认会先准备 Bridge，并以静默浏览器模式运行；--ui 打开可见浏览器。
- `open-runtime runtimes [--bridge <url>]` - 列出连接到 Bridge 的 runtime；本地 Bridge 不存在时会自动启动。
- `open-runtime verify [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] <target-id> <status> [--where <path=value>] [--timeout <ms>] [--open] [--next]` - 业务级验收 target：只有业务 target 成功才判定业务通过；Modern/MF/Garfish/Vmok 等底层 target 只作为底层证据。
- `open-runtime wait-for [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] <target-id> <status> [--where <path=value>] [--timeout <ms>] [--open] [--strict] [--next]` - 等待 target 到达指定状态；--where 的 value 会按 JSON 字面量解析，可匹配 number、boolean、null。
- `open-runtime wait-eval <script> [--timeout <ms>]` - 轮询页面表达式，直到结果为 true。
- `open-runtime eval <script>` - 在页面内执行脚本，也支持 --file <path> 读取脚本文件。
- `open-runtime targets [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--id <id>] [--type <type>] [--source <source>] [--status <status>] [--query <keyword>]` - 读取所选 runtime 注册的 target 定义。
- `open-runtime snapshot [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--id <id>] [--type <type>] [--source <source>] [--status <status>] [--query <keyword>]` - 读取当前 runtime snapshot 状态。
- `open-runtime events [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--target-id <id>] [--type <type>] [--source <source>] [--status <status>] [--action <name>] [--since <event-id>] [--limit <n>] [--query <keyword>]` - 读取 runtime event 历史。
