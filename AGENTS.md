# OpenRuntime Agent Guide

## 项目目标

OpenRuntime 要让前端应用把运行时状态、事件、可等待目标和声明动作开放给 Agent。目标是让 Agent 在 AI coding 中能自己验证页面、定位问题、执行安全动作并等待结果，减少人的中途介入。

## 当前可信文档

优先级从高到低：

1. `docs/rfc-openruntime.md`：当前主 RFC。API、CLI、SDK、Skill、Target Registry、Snapshot、Event、Action、waitFor 的定义都以这里为准。
2. `docs/roadmap.md`：当前实现路线和 checklist。后续拆任务时优先按 roadmap 阶段推进。
3. `docs/ecosystem-modernjs.md`：Modern.js 接入背景、本地代码入口和 plugin 接入方向。
4. `.codex/skills/mf/SKILL.md`：遇到 Module Federation、remote、shared、manifest、observability、runtime error 时先使用这个 skill。

## 当前核心设计

- OpenRuntime Core 不内置固定的 target type 或 status。每个 target 的 `type` 和 `statuses` 由 `registerTarget` 声明。
- Target Registry 回答“页面里有什么可以被引用或等待”。
- Snapshot 回答“页面当前是什么状态”。
- Event Log 回答“状态和 action 是怎么变化过来的”。
- Action Registry 回答“页面声明了哪些动作可以被 Agent 执行”。
- `runAction` 只执行动作并记录 action event，不自动更新 Snapshot。执行后的验证应继续使用 `waitFor`。
- `dependsOn` 只表达当前状态里的阻塞线索，主位置在 Snapshot；Event 只通过 `snapshot.updated` 的 payload 记录这次变化。

## Modern.js / MF 接入方向

OpenRuntime 的 Modern.js 接入后续应以 Modern.js plugin 的形式完成，不要写成独立外置 adapter。这个 plugin 负责注册和更新 Modern.js 能直接知道的 target，例如 app、route、loader、route component、SSR、hydration 和 navigation。

OpenRuntime 的 Module Federation 接入后续应在 MF 仓库的 observability plugin 中完成，并优先复用 MF observability 能力。这个接入负责注册和更新 MF 能直接知道的 target，例如 consumer、remote、manifest、remoteEntry、expose、shared 和 runtime error。

这些 plugin 需要依赖 Modern.js / MF 暴露的 hook。如果现有 hook 不够，不要在 OpenRuntime 里绕开框架做脆弱探测，应优先在 Modern.js 或 MF 里补 hook。

## Modern.js 相关上下文

优先从本地仓库读取事实：

- Modern.js 本地仓库：`/Users/bytedance/fork_repo/modern.js`
- 应用框架入口：`packages/solutions/app-tools`
- 路由 / runtime / SSR 相关：`packages/runtime/plugin-runtime`
- loader / redirect 相关：`packages/cli/plugin-data-loader`
- server / BFF 相关：`packages/server/*`
- 早期 MF 评估 demo：`tests/integration/agent-runtime-mf`

如果本地仓库没有足够上下文，再参考官方文档：`https://modernjs.dev/guides/get-started/introduction`。

## 工作规则

- 不要把 `Agent Runtime` 旧命名当成当前产品名；当前统一叫 OpenRuntime。
- 不要从旧文档里的 `items + relations`、`from/to`、`RuntimeRelationEvent`、`waitForEvent`、`action expect` 反推第一版 API。
- 不要只基于 DOM、console 或 network 定义成功标准；OpenRuntime 的重点是结构化 target、snapshot、event 和 action。
- 写 Modern.js 接入方案时，按 Modern.js plugin 思路设计，优先使用或补齐框架 hook。
- 写 MF 接入方案时，优先在 MF observability plugin 中接入 OpenRuntime，使用已安装的 MF skill，尤其是 observability、remote、shared 和 runtime error 相关能力。
- 如果实现需要新的生命周期或运行时信号，先判断应该补在 Modern.js / MF hook 里，还是补在 OpenRuntime SDK API 里。
