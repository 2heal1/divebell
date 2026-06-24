# OpenRuntime Roadmap

## 总目标

OpenRuntime 要提供一套应用可写入、Agent 可读取和执行的运行时能力，让 AI coding 可以稳定完成页面验证、问题定位和修复闭环。

第一版以本地开发和 demo 验证为主，先跑通 SDK、Bridge、CLI、Modern.js plugin、MF observability 接入和 Agent 使用方式的闭环。

## 阶段 0：项目基础

目标：让后续实现有清晰的包结构、测试入口和文档入口。

Checklist：

- [x] 确定包管理器、构建工具和测试工具。
- [x] 建立基础目录，例如 `packages/core`、`packages/bridge`、`packages/cli`、`packages/modern-plugin`。
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

- [x] 实现页面侧 `connectBridge({ port, autoReconnect })`。
- [x] 实现 Bridge runtime 连接管理：`runtimeId`、`url`、连接状态、最后 snapshot/events 保留。
- [x] 实现 HTTP API：`/runtimes`、`/targets`、`/snapshot`、`/events`、`/actions`、`/actions/:name/options`、`/actions/:name/run`、`/wait-for`。
- [x] 实现 CLI：`start`、`open`、`runtimes`、`targets`、`snapshot`、`events`、`actions`、`input-options`、`run-action`、`wait-for`。
- [x] 实现 runtime selector：`--url`、`--runtime`，无参数时默认选择最新活跃 runtime。
- [x] `wait-for` 命令成功或失败后释放进程。
- [x] `input-options` 命令等待异步 provider 完成，默认超时 5s。

验收标准：

- [x] 打开测试页面后，CLI 能读取 targets、snapshot、actions。
- [x] CLI 能执行 action，并用 `wait-for` 验证后续状态。
- [x] 页面刷新后生成新的 `runtimeId`，旧连接能被 Bridge 标记为 disconnected。

## 阶段 3：Modern.js Plugin

目标：通过 Modern.js plugin 自动写入框架层状态。

Checklist：

- [x] 梳理 Modern.js 已有 hook：路由表、navigation、loader、SSR、hydration、route component、runtime error。
- [x] 标记缺失 hook；缺失时优先在 Modern.js 中补 hook，不在 OpenRuntime 中用 DOM 或全局状态猜测。
- [x] 在路由表生成后注册 `modern:route` 聚合 target；route manifest 放在 target data，当前 pathname、matches、loader 状态和错误放在 snapshot data。
- [x] 在 app 启动、navigation、loader、SSR、hydration、route component 错误时调用 `updateSnapshot`。
- [x] 提供业务 helper：`registerOpenRuntimeReady`、`markOpenRuntimeReady`、`markOpenRuntimeReadyError`，用于业务 ready target。
- [x] 提供 Modern.js demo，覆盖 route、loader success/error、business ready、声明 action、`run-action` 和 `wait-for`。
- [x] 补充 SSR / hydration demo，验证 `modern:ssr` 和 `modern:hydration` 只在真实存在时出现。
- [x] 补充 route component 加载失败 demo，验证 snapshot 只在失败时显示 `routeComponent: error`。
- [ ] 后续和 MF runtimePlugin 协作时，为 route target 补充框架能确定的 `dependsOn`，例如 route 依赖 remote / expose。

阶段 3 收口说明：`dependsOn` 需要 MF runtimePlugin 提供 remote / expose 等运行时目标后才能可靠建立，延后到阶段 4 和 MF 接入一起完成；阶段 3 不用 DOM、console 或业务手写依赖关系去猜。

验收标准：

- [x] Modern.js demo 打开后，Agent 能看到 `modern:app`、`modern:route`、业务 ready target 和声明 action。
- [x] `modern:route` target data 能看到 route manifest；snapshot data 只显示当前 pathname、navigation、matches、loader 状态和错误。
- [x] CSR demo 不会默认出现 `modern:ssr` 或 `modern:hydration`。
- [x] route 未 ready 或失败时，Agent 能从 Snapshot 看到 loader / route error 线索，而不是只能查 DOM 或 console。
- [x] 业务 ready 不由 Modern.js plugin 猜测，只由业务 helper 或业务代码声明。
- [x] SSR / hydration 场景完成 demo 验证。
- [x] route component 加载失败场景完成 demo 验证。

## 阶段 4：MF Observability 接入

目标：在 MF 仓库的 observability plugin 中接入 OpenRuntime，自动写入模块加载状态。

Checklist：

- [x] 复用已安装 MF skill 和 MF observability 能力，确认可读取的 runtime 信号。
- [x] 梳理 MF observability 可用信号：consumer、remote、manifest、remoteEntry、expose、shared、runtime error。
- [x] 标记缺失 hook；缺失时优先在 MF observability plugin 或 MF runtime 中补 hook。
- [x] 注册 remote、remote expose、shared target；manifest 和 remoteEntry 作为 remote / expose 的 phase 展示。
- [x] 在加载开始、成功、失败时更新 Snapshot 和 Event。

验收标准：

- [x] MF demo 中 remote、manifest / remoteEntry phase、expose、shared 的状态可被 Agent 读取。
- [x] 不重复实现 MF 加载追踪，优先复用 MF observability。

后续任务：

- [ ] 和 Modern.js plugin 协作补充 route / business 到 remote / expose 的 `dependsOn`。

## 阶段 5：Agent Skill 和使用示例

目标：让 Agent 知道什么时候用 OpenRuntime，以及如何和 Browser / CLI 配合。

Checklist：

- [x] 编写 OpenRuntime skill。
- [x] 明确 Agent 使用顺序：打开页面、读取 targets/snapshot/actions、执行 action、waitFor、失败后读取 events。
- [x] 明确 fallback：没有 OpenRuntime 时再使用 DOM、console、network 和截图。
- [x] 提供常见任务示例：等待路由 ready、执行业务 action、排查 remote 加载失败、排查 loader redirect。
- [x] 把 MF 相关任务和现有 MF skill 串起来。

验收标准：

- [x] Agent 能在不知道页面 DOM 细节的情况下，通过 CLI 完成一个声明 action 和 waitFor 验证。
- [x] 失败报告里包含 snapshot 和 events 证据。

## 阶段 6：Demo 和评估

目标：用真实场景验证 OpenRuntime 是否提升 AI coding 效率。

Checklist：

- [x] 准备基础 Modern.js demo：route、loader、SSR、hydration、business ready。
- [x] 准备 MF demo：remote success/error、shared 冲突、manifest/remoteEntry 失败。
- [x] 从 `/Users/bytedance/fork_repo/modern.js/tests/integration/agent-runtime-mf` 迁移或重建必要 case。
- [x] 设计 baseline：不用 OpenRuntime，只用 DOM/console/network。
- [x] 设计 runtime round：使用 OpenRuntime API/CLI/skill。
- [x] 统计耗时、人工介入次数、失败定位准确率、证据完整度。

阶段 6 收口说明：Modern.js 场景复用 `demos/modern-basic`、`demos/modern-ssr` 和 `demos/modern-ssr-stream` 的真实 demo 和验证脚本；MF 场景在 `demos/stage6-evaluation` 中按旧 `agent-runtime-mf` case 重建评估夹具，避免在 OpenRuntime 仓库重复实现 MF 加载追踪。评估入口见 `docs/evaluation-stage6.md` 和 `pnpm run evaluate:stage6`。

验收标准：

- [x] 至少一个 Modern.js 场景和一个 MF 场景完成 baseline/runtime 对比。
- [x] Agent 输出能说明“当前卡在哪个 target”，而不是只说页面异常。

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
