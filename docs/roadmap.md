# OpenRuntime Roadmap

## 总目标

OpenRuntime 要提供一套应用可写入、Agent 可读取和执行的运行时能力，让 AI coding 可以稳定完成页面验证、问题定位和修复闭环。

第一版以本地开发和 demo 验证为主，先跑通 SDK、Bridge、CLI、Modern.js plugin、MF runtimePlugin 和 Agent 使用方式的闭环。

## 阶段 0：项目基础

目标：让后续实现有清晰的包结构、测试入口和文档入口。

Checklist：

- [x] 确定包管理器、构建工具和测试工具。
- [x] 建立基础目录，例如 `packages/core`、`packages/bridge`、`packages/cli`、`packages/modern-plugin`、`packages/mf-runtime-plugin`。
- [x] 定义 TypeScript 编译、test、build 命令。
- [x] 建立最小测试样例，确保本地 CI 命令可运行。
- [x] 保留 `docs/rfc-openruntime.md` 作为 API 来源，避免实现时从旧设计反推。

验收标准：

- [x] 新 agent 只读 `README`、`AGENTS.md`、`docs/rfc-openruntime.md` 和本 roadmap，就能知道从哪里开始。
- [x] 根目录命令可以完成类型检查和测试。

## 阶段 1：Core SDK

目标：实现页面内 Runtime Center 和核心 API。

Checklist：

- [x] 实现 Target Registry：`registerTarget`、`unregisterTarget`、`getTargets`。
- [x] 实现 Snapshot：`updateSnapshot`、`getSnapshot`。
- [x] 实现 Event Log：自动记录 `snapshot.updated`、`snapshot.update.rejected`。
- [x] 实现 Action Registry：`registerAction`、`unregisterAction`、`getActions`。
- [x] 实现 `runAction`，自动记录 `action.started`、`action.success`、`action.error`。
- [x] 实现 `getInputOptions`，支持异步 provider 和超时。
- [x] 实现 `waitFor`，只等待 target 到达指定状态，不默认返回 events。
- [x] 实现 Window API：`window.__OPEN_RUNTIME__`。
- [x] 校验规则：Core 不内置固定 type/status，状态必须来自 `registerTarget.statuses`。
- [x] 校验规则：未注册 target 的 `updateSnapshot` 应拒绝，不自动创建 inferred target。

验收标准：

- [x] 单元测试覆盖 target 注册、状态更新、事件记录、action 执行和等待成功/失败。
- [x] `runAction` 不自动更新 Snapshot，只由 handler 或框架接入调用 `updateSnapshot`。
- [x] `dependsOn` 只出现在 Snapshot 当前状态中，Event 只通过 payload 记录变化。

## 阶段 2：Bridge 和 CLI

目标：让页面外 Agent 可以稳定访问页面内 Runtime。

Checklist：

- [ ] 实现页面侧 `connectBridge({ port, autoReconnect })`。
- [ ] 实现 Bridge runtime 连接管理：`runtimeId`、`url`、连接状态、最后 snapshot/events 保留。
- [ ] 实现 HTTP API：`/runtimes`、`/targets`、`/snapshot`、`/events`、`/actions`、`/actions/:name/options`、`/actions/:name/run`、`/wait-for`。
- [ ] 实现 CLI：`bridge start`、`runtimes`、`targets`、`snapshot`、`events`、`actions`、`input-options`、`run-action`、`wait-for`。
- [ ] 实现 runtime selector：`--url`、`--runtime`，无参数时默认选择最新活跃 runtime。
- [ ] `wait-for` 命令成功或失败后释放进程。
- [ ] `input-options` 命令等待异步 provider 完成，默认超时 5s。

验收标准：

- [ ] 打开测试页面后，CLI 能读取 targets、snapshot、actions。
- [ ] CLI 能执行 action，并用 `wait-for` 验证后续状态。
- [ ] 页面刷新后生成新的 `runtimeId`，旧连接能被 Bridge 标记为 disconnected。

## 阶段 3：Modern.js Plugin

目标：通过 Modern.js plugin 自动写入框架层状态。

Checklist：

- [ ] 梳理 Modern.js 已有 hook：路由表、navigation、loader、SSR、hydration、route component、runtime error。
- [ ] 标记缺失 hook；缺失时优先在 Modern.js 中补 hook，不在 OpenRuntime 中用 DOM 或全局状态猜测。
- [ ] 在路由表生成后注册 route target、loader target、route component target。
- [ ] 在 app 启动、navigation、loader、SSR、hydration、组件挂载和错误时调用 `updateSnapshot`。
- [ ] 为 route target 补充框架能确定的 `dependsOn`，例如 route 依赖 loader 或 route component。
- [ ] 提供业务 helper，例如 `useOpenRuntimeReady` 或 `OpenRuntimeReady`，用于业务 ready target。

验收标准：

- [ ] Modern.js demo 打开后，Agent 能看到 app、route、loader、component、SSR、hydration 的 target 和当前状态。
- [ ] route 未 ready 时，Agent 能从 Snapshot 看到直接 blocker，而不是只能查 DOM 或 console。
- [ ] 业务 ready 不由 Modern.js plugin 猜测，只由业务 helper 或业务代码声明。

## 阶段 4：MF RuntimePlugin

目标：通过 MF runtimePlugin 自动写入模块加载状态。

Checklist：

- [ ] 复用已安装 MF skill 和 MF observability 能力，确认可读取的 runtime 信号。
- [ ] 梳理 MF runtimePlugin 可用 hook：instance、remotes、manifest、remoteEntry、expose、shared、runtime error。
- [ ] 标记缺失 hook；缺失时优先在 MF runtimePlugin 或 MF runtime 中补 hook。
- [ ] 注册 consumer、remote、manifest、remoteEntry、expose、shared target。
- [ ] 在加载开始、成功、失败时更新 Snapshot 和 Event。
- [ ] 和 Modern.js plugin 协作补充 route 到 remote / expose 的 `dependsOn`。

验收标准：

- [ ] MF demo 中 remote、manifest、remoteEntry、expose、shared 的状态可被 Agent 读取。
- [ ] remote 或 shared 失败时，route / business 的 blocker 能指向对应 MF target。
- [ ] 不重复实现 MF 加载追踪，优先复用 MF observability。

## 阶段 5：Agent Skill 和使用示例

目标：让 Agent 知道什么时候用 OpenRuntime，以及如何和 Browser / CLI 配合。

Checklist：

- [ ] 编写 OpenRuntime skill。
- [ ] 明确 Agent 使用顺序：打开页面、读取 targets/snapshot/actions、执行 action、waitFor、失败后读取 events。
- [ ] 明确 fallback：没有 OpenRuntime 时再使用 DOM、console、network 和截图。
- [ ] 提供常见任务示例：等待路由 ready、执行业务 action、排查 remote 加载失败、排查 loader redirect。
- [ ] 把 MF 相关任务和现有 MF skill 串起来。

验收标准：

- [ ] Agent 能在不知道页面 DOM 细节的情况下，通过 CLI 完成一个声明 action 和 waitFor 验证。
- [ ] 失败报告里包含 snapshot 和 events 证据。

## 阶段 6：Demo 和评估

目标：用真实场景验证 OpenRuntime 是否提升 AI coding 效率。

Checklist：

- [ ] 准备基础 Modern.js demo：route、loader、SSR、hydration、business ready。
- [ ] 准备 MF demo：remote success/error、shared 冲突、manifest/remoteEntry 失败。
- [ ] 从 `/Users/bytedance/fork_repo/modern.js/tests/integration/agent-runtime-mf` 迁移或重建必要 case。
- [ ] 设计 baseline：不用 OpenRuntime，只用 DOM/console/network。
- [ ] 设计 runtime round：使用 OpenRuntime API/CLI/skill。
- [ ] 统计耗时、人工介入次数、失败定位准确率、证据完整度。

验收标准：

- [ ] 至少一个 Modern.js 场景和一个 MF 场景完成 baseline/runtime 对比。
- [ ] Agent 输出能说明“当前卡在哪个 target”，而不是只说页面异常。

## 阶段 7：发布前整理

目标：把可用能力整理成可安装、可复用的第一版。

Checklist：

- [ ] 整理包名、版本和发布策略。
- [ ] 完成 README、API 文档、CLI 文档和接入文档。
- [ ] 补齐错误码或失败原因文档。
- [ ] 补齐端到端测试。
- [ ] 确认安全边界：不执行未声明动作，不自动猜危险操作。
- [ ] 确认第一版不做跨 tab、跨 iframe、跨 worker、多 Runtime Center 聚合。

验收标准：

- [ ] 一个新项目可以按文档安装 SDK、启动 Bridge、连接页面、用 CLI 读取状态。
- [ ] 一个 Modern.js 项目可以通过 plugin 接入 OpenRuntime。
- [ ] 一个 MF 项目可以通过 runtimePlugin 接入 OpenRuntime。
