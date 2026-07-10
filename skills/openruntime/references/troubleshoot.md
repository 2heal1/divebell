# 使用 OpenRuntime 排查并修复

OpenRuntime 让页面主动暴露运行时事实和声明动作，减少 Agent 依赖 DOM、截图、
console 或异步时机猜测。连接 Bridge、注册 target、更新 snapshot、记录 event
只暴露事实，不改变接口、路由、业务状态或渲染分支。

只在根 `SKILL.md` 把任务分流到“问题排查”后读取本文件。这里要求 Agent 执行固定状态机。
不要用自然语言判断替代 CLI 输出、
workflow JSON、退出码或 `nextAction`。

## 1. 排查边界

遇到下面任一情况，进入本流程：

- 用户要求定位、修复或验证前端页面问题，并明确要求使用 OpenRuntime。
- 任务需要用结构化运行时证据找出页面、组件、路由、remote、shared、子应用或业务故障。
- 为了完成修复，需要补 OpenRuntime 连接、插件接入或最终业务验收信号。

如果只是查询信息、了解命令、执行一次页面声明的 action 或调用扩展命令，返回根
`SKILL.md`，改读 `references/use-cli.md`。不要让普通命令调用进入本状态机。

如果用户只要求接入 OpenRuntime、增加 target/action 或开发 CLI 命令，但没有待排查的
故障，返回根 `SKILL.md`，改读 `references/integrate.md`。

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

需要确认当前 CLI 命令、参数或扩展命令时，运行 `pnpm exec openruntime --help`。
扩展命令会出现在 `Commands` 或 `External Commands`。如果区域末尾显示某个命令有 skill，先运行
`pnpm exec openruntime <command> --skill` 获取 `SKILL.md` 的绝对路径，读取并遵循后再使用该命令。
只在命令描述明确匹配当前任务时使用扩展命令。

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
和更新 snapshot 写法；缺少示例时读取同目录的 `core.md`。禁止预防性读取
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

如果 `workflow verify` 没通过，按脚本的 `nextAction` 修复；信息不足时回到 OBSERVE，
先用现有 target/snapshot 状态判断，再必要时使用 OpenRuntime 浏览器能力补充定位。
不要因为一次 verify 失败就进入大范围重复取证。

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

- `@openruntime/core` 页面侧 target、snapshot、action 用法：同目录的 `core.md`
- Modern.js / EdenX 接入、route、loader、业务 ready helper：同目录的 `modernjs.md`
- Module Federation / Vmok remote、expose、shared、observability：同目录的 `module-federation.md`
- Garfish 子应用生命周期和 custom loader：同目录的 `garfish.md`
