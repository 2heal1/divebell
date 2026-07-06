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

## 前置要求

进入 OpenRuntime workflow 前，先运行 `prepare`。`prepare` 只做静态准备检查：
读取业务项目 `package.json`，结合项目源码扫描，判断缺哪些依赖和接入；它不访问页面，
也不证明页面 runtime 已经生效。

```bash
node <openruntime-skill-dir>/scripts/prepare.mjs \
  --package-json <path-to-package.json> \
  --source-editable true \
  --source-affects-page true
```

`--source-editable` 表示当前任务是否允许修改源码。`--source-affects-page` 表示当前源码改动
是否会影响正在调试的页面，例如页面是否来自本地 dev server 或已代理到本地代码。
不传时两者都按 `true` 处理。

`prepare` 输出：

- `dependency.required/declared/installed/missing/invalid/install/installSpecs`：应该有、
  已声明、已正式安装、缺失、声明但不可用、建议安装或重装的包和安装规格。
- `usage.required/detected/missing/unknown`：应该接入、源码里已检测到、源码里没检测到、
  静态检查无法确认的接入能力。
- `install`：下一步需要安装或重装的包名。
- `use`：当前项目类型需要使用的 OpenRuntime 相关包名。
- `descriptions.packages/usage`：每个包和接入能力的简短用途说明，以及需要深入时读取的 reference。
- `nextAction`：下一步必须执行的动作。

按下面三种场景处理：

- 源码可改，且源码改动会影响调试页面：`--source-editable true --source-affects-page true`。
  需要安装并接入页面侧 OpenRuntime 相关包；缺依赖先安装，依赖可用但源码没接入时先改代码接入。
- 源码可改，但源码改动不会影响调试页面，例如调试的是线上页面且没有代理到本地：
  `--source-editable true --source-affects-page false`。不要要求页面侧接入，只安装
  `@openruntime/cli`，然后使用 OpenRuntime 浏览器 CLI 能力诊断。
- 源码不可改：`--source-editable false`。不要要求页面侧接入，只安装
  `@openruntime/cli`，然后使用 OpenRuntime 浏览器 CLI 能力诊断。

`prepare` 返回 `exit 2` 时，必须先按 `nextAction` 处理，再重跑 `prepare` 或进入
`OPEN_PAGE`。`prepare` 返回 `exit 0` 只表示静态准备检查通过，不代表页面里
OpenRuntime 已经生效；真正连接结果由 `CONNECTED` 确认。浏览器 CLI 模式下，不强制
进入 `CONNECTED`，按 `nextAction.type=use_browser_cli` 使用 `open`、`console`、
`network`、`page-snapshot`、`eval`、`wait-eval` 等命令定位。

禁止用下面方式绕过前置要求：

- 用浏览器 `eval` 临时注入 OpenRuntime 或临时连接 Bridge。
- 把 CLI 自己的依赖、临时目录依赖或未声明的 `node_modules` 软链当成业务项目依赖。
- 在缺依赖或缺接入时继续跑 `snapshot`、`console`、`network`、`page-snapshot`、
  `wait-for` 或 `verify` 做无效诊断。

## 什么时候使用

遇到下面任一情况，使用 OpenRuntime：

- 用户明确要求使用、接入、评测或排查 OpenRuntime。
- 项目已经使用 OpenRuntime、`@openruntime/*`、Modern.js、Garfish、Vmok 或 Module Federation。
- 需要用结构化运行时证据验证页面、组件、路由、remote、shared、子应用或业务状态。
- 需要执行页面声明的 action，或等待应用、组件、remote、business target ready。
- 需要把浏览器错误、全局变量、加载链路或业务结果沉淀成可查询的 snapshot。

如果只是普通浏览器自动化，且用户没有要求 OpenRuntime、项目也没有 OpenRuntime
上下文，不要因为本 skill 改变原本工具选择。

## 执行状态机

OpenRuntime skill 只使用下面这条状态机：

```text
START
  -> OPEN_PAGE
  -> CONNECTED
  -> OBSERVE
  -> PATCH
  -> CONNECTED
  -> FINAL_VERIFY
  -> DONE | OBSERVE | BLOCKED
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
  --out openruntime-evidence.json \
  --source-editable true
```

`<openruntime-skill-dir>` 是当前 skill 目录。仓库内开发通常是 `skills/openruntime`；
被注入到其他环境时，使用注入后的实际目录。

`connected` 会自动执行 `resolve-integration`，把依赖、接入和运行时连接拆开写进
`openruntime-evidence.json`：

- `integration.dependency.required/installed/missing` 表示应该安装、已正式安装和缺少的包。
  已安装必须同时满足业务项目 `package.json` 有依赖声明，且业务项目 `node_modules`
  里的包入口文件可解析；临时目录、CLI 自身依赖或未声明的 `node_modules` 软链不算正式安装。
  `integration.dependency.invalid/install/installSpecs` 表示声明存在但包不可用时需要重新安装的包和安装规格。
- `integration.usage.required/detected/missing` 表示应该接入、源码中已检测到接入和缺少的接入。
- `connected.ok/runtimeCount/connectedCount` 表示页面里 runtime 是否真的连上 Bridge。

如果当前工作目录没有 `open` 记录，它会要求先运行 `openruntime open`。如果已经 open
过但没有 connected runtime，它会按项目类型返回必须安装的依赖、必须接入的 Modern plugin、
MF/Vmok observability 或 Core runtime 连接代码。

源码可改时，必须按 `nextAction` 执行。`nextAction.type=install_missing_dependencies`
时先执行 `requiredCommands`；`nextAction.type=apply_required_usage` 时按
`nextAction.snippets` 修改入口或 runtime 配置。

### OBSERVE

连接通过后，运行 `observe` 脚本来获取当前阶段应该使用的 OpenRuntime 工具；
只按脚本返回的 `nextAction` 继续：

```bash
node <openruntime-skill-dir>/scripts/workflow.mjs observe \
  --url <app-url> \
  --out openruntime-evidence.json
```

如果 requiredAction 状态文件仍然存在，`observe` 会直接失败并返回同一个
`requiredAction`，不会返回 `browser_diagnose`。

如果 `observe.nextAction.type=snapshot_observe`，先把插件 snapshot 当作一次快速探测，
不要把它当成必须完成的定位主路径。首次只跑一次全量 snapshot，不带 `--id`、`--query`、
`--type`、`--status`，也不要并发跑多条 snapshot 变体：

```bash
pnpm exec openruntime snapshot --url <app-url>
```

不要在首次 snapshot 同一时间追加这些命令：

```bash
pnpm exec openruntime snapshot --url <app-url> --id <target-id>
pnpm exec openruntime snapshot --url <app-url> --query <keyword>
```

看完全量 snapshot 后再决定：

- 如果它已经指向 MF shared、remote/expose、Modern route、loader 或 runtime error
  的问题层级，直接查源码、配置、依赖或 dist 产物。
- 如果它没有提供有用线索，立即切到 OpenRuntime 浏览器能力定位，例如 `console`、
  `network`、`page-snapshot`、`eval` 或 `wait-eval`；不要为了使用 snapshot 继续反复查询。
- 只有需要细化一个已经出现的 snapshot 线索时，才补充一次带 `--id` 或 `--query` 的
  定向 snapshot。

推荐路径：

```text
全量 snapshot 快速探测
  -> 有线索：查配置/依赖/dist/源码
  -> 无线索：console/network/page-snapshot/eval 定位
  -> 定位到问题
  -> PATCH 阶段补或复用最小 business target
  -> 修复
  -> workflow verify
  -> DONE 或回到 OBSERVE 继续修复
```

如果 `observe.nextAction.type=browser_diagnose`，说明当前没有可用 MF/Modern/Vmok
插件 snapshot。此时正常使用 `console`、`page-snapshot`、`network`、`eval` 或
`wait-eval` 定位，不强制补 target。

没有插件 snapshot 时的推荐路径：

```text
没有 MF/Modern/Vmok snapshot
  -> 正常 console/page-snapshot/network 定位
  -> 定位到问题
  -> PATCH 阶段补或复用最小 business target
  -> 修复并 workflow verify
```

### PATCH

根据 OBSERVE 得到的证据修改业务代码。进入 PATCH 后必须补或复用最小 `business:*`
target，用它表示“问题已经对用户可见地修复”。修改后必须重新打开或刷新页面，并回到
`CONNECTED -> FINAL_VERIFY`。

如果修改了构建配置、或依赖解析，必须重启目标应用后再观测和验收，防止
旧 dev server / HMR / 构建缓存继续使用旧配置。包括但不限于：

- `*.config.*`、`rsbuild` / `rspack` / `vite` 配置。
- `alias`、`shared`、remote/expose、chunk split、dev server 配置。
- `package.json`、lockfile、workspace 依赖、插件接入配置。

单独执行 `build`、`openruntime open`、浏览器刷新或 `connected` 不能替代应用重启。
重启后再执行 `open -> CONNECTED -> FINAL_VERIFY`。

原因：

- 构建配置变更不重启会产生无效观测。
- 页面可能需要刷新。
- runtime 连接可能已失效。
- 新增 target / snapshot 需要重新注册。
- 旧页面状态不能代表新代码状态。

### 补验收信号

`business:*` target 是最终验收必需项。OBSERVE 诊断阶段不强制补；定位到问题并进入
PATCH 阶段后，必须补或复用一个最小 business target：

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

补 target、snapshot 或 action 前，先看项目里已有的 OpenRuntime 初始化、连接、注册 target
和更新 snapshot 写法；缺少示例时读取 `references/core.md`。禁止预防性读取
`node_modules/@openruntime/**` 下的安装包文件；`.d.ts` 也算内部文件。先按本
skill、reference 和项目相邻写法 patch，再用 typecheck/build 裁决。只有出现真实错误，
且本 skill、reference 和项目示例都无法解释时，才允许破例查看安装包内部文件。

补完 target 后，只针对刚补的 target 读取一次 snapshot，确认 target 已注册且状态/data
符合预期；不要把这一步扩展成新的大范围取证：

```bash
pnpm exec openruntime snapshot --url <app-url> --id <target-id>
```

补完信号后继续修复，并进入 `CONNECTED -> FINAL_VERIFY`。不能只因为 target 已注册就宣称完成。
一次性排查补的 OpenRuntime 辅助代码，验证后可以删除；对后续 Agent 或运维有价值时再保留。

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
必须立即进入 DONE。最终正常结果只允许在 `doneLock=true` 且
`businessVerified=true` 后写。DONE 后必须百分百相信 `verify`，只允许读取已有 verify 输出 /
`openruntime-evidence.json` 来写结果，以及清理进程；严禁再调用 `snapshot`、`console`、
`page-snapshot`、`network`、`eval`、`wait-eval`、`wait-for`、`events`、`runtimes`、
截图、浏览器 UI 分析或再次 `verify` 来重复确认。

如果 `workflow verify` 没通过，按脚本的 `nextAction` 修复；信息不足时回到 OBSERVE，
先用现有 target/snapshot 状态判断，再必要时使用 OpenRuntime 浏览器能力补充定位。
不要因为一次 verify 失败就进入大范围重复取证。

## requiredAction 规则

`connected` 返回的 `requiredAction` 是硬状态，不是建议。默认状态文件在
`~/.openruntime/required-actions/<cwd-hash>.json`。后续 workflow 和 CLI 命令会读取
这个文件；只要里面还有 `status=pending|blocked`，诊断和取证命令必须失败。

如果 `connected` 返回 `requiredAction.status=pending`，必须先完成
`requiredAction.requiredAction` 指定的动作、重启应用并重跑 `connected`。此时
`snapshot`、`targets`、`events`、`runtimes`、`console`、`network`、`page-snapshot`、
`eval`、`wait-eval`、`wait-for`、`verify` 等 CLI 命令会因为状态文件存在而失败。
如果源码或依赖不可改，用 `--source-editable false` 运行 `connected`，然后按
`report_blocked` 报告。不要用浏览器 `eval` 做临时 Bridge 连接。

## 停止条件 / fallback 边界

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

## 常用 CLI

<!-- This section is generated by scripts/sync-openruntime-cli-docs.mjs. Do not edit by hand. -->

完整 CLI 清单见 `references/cli.md`。这里仅保留 OpenRuntime skill 最常用入口。

定位时先用一次不带 `--id` / `--query` 的全量 `snapshot` 快速探测；如果没有有效线索，立即改用 OpenRuntime 浏览器能力，例如 `console`、`page-snapshot`、`network`、`eval` 或 `wait-eval`。进入 PATCH 后必须补或复用最小 `business:*` target，并使用 `verify` 最终验收；通过后百分百相信 verify，只允许写结果和清理，严禁再调用 `snapshot`、`console`、`page-snapshot`、`network`、`eval`、`wait-eval`、截图或再次 `verify`。
- `openruntime open <url> [--bridge <url>] [--port <port>] [--session <id>] [--no-bridge] [--ui]` - 打开页面，默认会先准备 Bridge，并以静默浏览器模式运行；--ui 打开可见浏览器。
- `openruntime runtimes [--bridge <url>]` - 列出连接到 Bridge 的 runtime；本地 Bridge 不存在时会自动启动。
- `openruntime targets [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--id <id>] [--type <type>] [--source <source>] [--status <status>] [--query <keyword>]` - 读取所选 runtime 注册的 target 定义。
- `openruntime snapshot [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--id <id>] [--type <type>] [--source <source>] [--status <status>] [--query <keyword>]` - 读取当前 runtime snapshot 状态。
- `openruntime events [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--target-id <id>] [--type <type>] [--source <source>] [--status <status>] [--action <name>] [--since <event-id>] [--limit <n>] [--query <keyword>]` - 读取 runtime event 历史。
- `openruntime console [--level <level>] [--query <keyword>] [--limit <n>]` - 兜底读取当前页面浏览器 console 日志；结构化验收和排错优先用 snapshot --query。
- `openruntime network [--url <query>]` - 查看当前页面的网络请求列表，并可按 URL 文本过滤。
- `openruntime page-snapshot` - 读取当前页面快照，包括可操作元素引用。
- `openruntime eval <script>` - 在页面内执行脚本，也支持 --file <path> 读取脚本文件。
- `openruntime wait-eval <script> [--timeout <ms>]` - 轮询页面表达式，直到结果为 true。
- `openruntime wait-for [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] <target-id> <status> [--where <path=value>] [--timeout <ms>] [--open] [--strict] [--next]` - 等待 target 到达指定状态；--where 的 value 会按 JSON 字面量解析，可匹配 number、boolean、null。
- `openruntime verify [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] <target-id> <status> [--where <path=value>] [--timeout <ms>] [--open] [--next]` - 业务级验收 target：只有业务 target 成功才判定业务通过；Modern/MF/Garfish/Vmok 等底层 target 只作为底层证据。

## Reference

只在需要对应细节时读取：

- CLI 命令详情：`references/cli.md`
- `@openruntime/core` 页面侧 target、snapshot、action 用法：`references/core.md`
- Modern.js / EdenX 接入、route、loader、业务 ready helper：`references/modernjs.md`
- Module Federation / Vmok remote、expose、shared、observability：`references/module-federation.md`
- Garfish 子应用生命周期和 custom loader：`references/garfish.md`
