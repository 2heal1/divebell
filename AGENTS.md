# OpenRuntime Agent Guide

## 项目目标

OpenRuntime 是面向 Coding Agent 的可扩展开发调试工具。它提供开箱即用的真实场景调试流程，
并允许团队通过 Extensions 接入自己的账号、环境、内部平台、诊断方法和验证标准。

Coding Agent 负责阅读和修改代码；OpenRuntime 负责把用户入口与团队已有的领域能力连接起来。
Extension 可以从当前页面识别应用、环境和部署等资源，调用已有 SDK、OpenAPI、CLI 或内部平台，
再回到相同账号、环境和用户路径验证修改。浏览器是当前默认的真实场景入口，但不是产品边界；
需要应用内部事实时，再通过 Runtime Core API 暴露状态、事件、声明动作和等待条件。

## 当前可信文档

优先级从高到低：

1. `README.md` / `README.zh-CN.md`：当前产品定位、能力边界和文档入口。
2. `docs/agent-devloop.md` / `docs/agent-devloop.zh-CN.md`：真实开发调试闭环和最小人工介入原则。
3. `docs/cli-extensions.md` / `docs/cli-extensions.zh-CN.md`：Extensions 与 Extension API。
4. `docs/runtime-core-api.md` / `docs/runtime-core-api.zh-CN.md`：Runtime Core 的使用边界和公开接入方式。
5. `skills/openruntime/references/core.md`：Target、Snapshot、Event、Action、waitFor 的完整字段和行为。
6. `.codex/skills/mf/SKILL.md`：遇到 Module Federation、remote、shared、manifest、observability、runtime error 时先使用这个 skill。

## 当前核心设计

- Runtime Core 是可选增强，不是使用 OpenRuntime CLI、浏览器调试、agent-browser 登录能力或 Extensions 的前置条件。
- Extension 在页面外部组织账号、环境、专项诊断和验证；Runtime Core 在页面内部提供事实和声明动作。
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
- 不要把 OpenRuntime 定义成 Agent Runtime、Runtime API、浏览器自动化工具或开发运行环境；产品定位是面向 Coding Agent 的可扩展开发调试工具。
- agent-browser 提供通用浏览器能力；OpenRuntime 提供面向开发调试的默认流程和领域 Extension。只需要通用浏览器操作时，可以直接使用 agent-browser。
- 团队已有的账号、环境、资源识别、SDK、OpenAPI、CLI、内部平台、诊断方法和验收标准应优先通过 Extension 接入。
- 受保护页面优先复用已经准备好的登录状态和 session。测试账号和授权应提前配置、范围明确、可重复使用，不能绕过权限边界。
- 普通页面没有 Runtime Core 时，正常使用页面结果、Console、Network、截图和专项 Extension 排查，不要为了开始调试强制修改应用接入 Runtime。
- 页面外部可以完成且值得复用的需求优先做 Extension；只有需要应用内部事实、声明动作或长期稳定等待条件时才接入 Runtime Core。
- 修改后回到与问题相同的账号、环境和用户路径验证。根据问题使用最可靠的现有证据，不强制所有任务增加 business target 或调用固定 verify 命令。
- 不要从旧文档里的 `items + relations`、`from/to`、`RuntimeRelationEvent`、`waitForEvent`、`action expect` 反推第一版 API。
- 写 Modern.js 接入方案时，按 Modern.js plugin 思路设计，优先使用或补齐框架 hook。
- 写 MF 接入方案时，优先在 MF observability plugin 中接入 OpenRuntime，使用已安装的 MF skill，尤其是 observability、remote、shared 和 runtime error 相关能力。
- 如果实现需要新的生命周期或运行时信号，先判断应该补在 Modern.js / MF hook 里，还是补在 OpenRuntime SDK API 里。
