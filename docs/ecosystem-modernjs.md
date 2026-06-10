# Modern.js 接入背景

## 来源

本文件优先基于本地仓库整理：

- `/Users/bytedance/fork_repo/modern.js/README.md`
- `/Users/bytedance/fork_repo/modern.js/package.json`
- `/Users/bytedance/fork_repo/modern.js/packages/solutions/app-tools`
- `/Users/bytedance/fork_repo/modern.js/packages/runtime/plugin-runtime`
- `/Users/bytedance/fork_repo/modern.js/packages/cli/plugin-data-loader`
- `/Users/bytedance/fork_repo/modern.js/tests/integration/agent-runtime-mf`

也参考了 Modern.js 官方介绍：`https://modernjs.dev/guides/get-started/introduction`。

## Modern.js 是什么

Modern.js 是一个基于 React 的渐进式 Web 框架。它面向 React 应用提供框架、构建、路由、数据获取、状态管理、服务端能力和生态工具。

对 OpenRuntime 来说，Modern.js 的价值在于：它知道很多 Agent 从页面外部很难稳定判断的信息，例如当前路由、路由表、loader、SSR、hydration、route component、服务端和客户端兜底行为。

## 本地仓库关键信息

| 路径 | 作用 |
| --- | --- |
| `packages/solutions/app-tools` | Modern.js 应用框架入口，包含 `modern` CLI、dev/build/serve/inspect 命令和 Rsbuild 集成。 |
| `packages/runtime/plugin-runtime` | 应用运行时、路由、渲染、SSR、hydration 等浏览器和服务端运行逻辑。 |
| `packages/cli/plugin-data-loader` | loader、redirect、route data request 等数据加载相关逻辑。 |
| `packages/server/*` | server、prod-server、BFF、server runtime 等服务端能力。 |
| `packages/toolkit/create` | Modern.js 项目创建器。 |
| `tests/integration/agent-runtime-mf` | 第一批 OpenRuntime / MF 评估 demo 的来源。 |

仓库当前 package 要求 Node.js `>=20`，pnpm `>=10.0.0`。应用框架包是 `@modern-js/app-tools`，它暴露 `modern` / `modern-app` 命令。

## Modern.js plugin 应该自动补什么

OpenRuntime Modern.js plugin 不应该让业务手写所有 target。框架能确定的信息应该自动写入。

第一版优先自动注册：

- `modern:app`：应用启动、运行和框架级错误。
- `modern:route`：单一聚合 route target。target data 保存 route manifest；snapshot data 保存当前 pathname、navigation、matches、loader 状态和错误。
- `modern:ssr`：只在页面存在 SSR 数据时注册，表示 SSR 初始状态。
- `modern:hydration`：只在 Modern.js 触发 hydration 事件时注册，表示客户端 hydration 状态。

第一版不再注册独立的 loader target 或 route component target。原因是 Agent 日常等待的是“当前 route 是否 ready”，而不是历史上每一个 loader / component 是否出现过。loader 和 route component 信息应作为当前 `modern:route` 的细节出现：

- 真实执行过的 loader 在当前 match 中显示 `loader: loading | success | redirect | error`。
- Modern.js 内部为了触发 lazy import 补的 loader 不算真实 data loader。
- route component 正常挂载不写入 snapshot，避免被误解成业务组件都 ready。
- route component 加载失败时才在当前 match 中显示 `routeComponent: error`。

建议优先自动更新：

- app 当前状态；
- route 当前 pathname、navigation 和 matches；
- 真实 loader 的 start / success / redirect / error；
- route component 加载错误；
- SSR / CSR fallback 状态；
- hydration 状态；
- 框架级错误。

## 和 Module Federation 的边界

OpenRuntime Modern.js plugin 负责框架层信息。MF remote、manifest、remoteEntry、expose、shared、runtime error 等信息优先由 OpenRuntime MF runtimePlugin 或 MF observability 能力写入。

如果 route 依赖某个 remote，`dependsOn` 可以由 OpenRuntime Modern.js plugin 和 OpenRuntime MF runtimePlugin 协同补充；不要要求业务手动维护所有依赖关系。

## Hook 原则

Modern.js 接入应优先使用 Modern.js plugin 能拿到的生命周期和运行时 hook。MF 接入应优先使用 MF runtimePlugin 能拿到的运行时 hook 和 observability 数据。如果现有 hook 不足，优先回到 Modern.js 或 MF 中补 hook，而不是在 OpenRuntime 里靠 DOM、console 或全局变量猜状态。

## 不要做什么

- 不要把 Modern.js 接入写成只服务 Module Federation 的能力。
- 不要只用 DOM 是否出现判断 route 或 business 是否 ready。
- 不要在 OpenRuntime Core 里内置 Modern.js 专属 type/status。
- 不要从旧 Agent Runtime 文档里的 `PageState`、`waitForEvent` 或 `items + relations` 继续扩展。
