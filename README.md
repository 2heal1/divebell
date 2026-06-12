# OpenRuntime

OpenRuntime 是一套让前端应用向 Agent 开放运行时状态、事件和动作的能力，用来提速 AI coding 中的页面验证、问题定位和修复闭环。

## 先读什么

1. `docs/rfc-openruntime.md`：当前主 RFC，也是 API 和产品边界的来源。
2. `docs/roadmap.md`：按阶段拆分的实现计划和 checklist。
3. `AGENTS.md`：给 Agent 的项目工作说明。
4. `docs/ecosystem-modernjs.md`：Modern.js 接入相关背景。
5. `.codex/skills/mf/SKILL.md`：Module Federation 相关问题和观测能力。

## 当前状态

这个项目目前以文档和 Agent skill 为主。实现代码还没有形成稳定入口时，不要从旧 Agent Runtime 文档反推 API，以 `docs/rfc-openruntime.md` 为准。

## 怎么开始

本仓库使用 Node 24 和 pnpm workspace monorepo。开始开发前先切到 Node 24：

```sh
nvm use
corepack enable
pnpm install
pnpm check
```

当前基础包：

1. `packages/core`：页面内 Runtime Center 和核心 API 的实现位置。
2. `packages/bridge`：页面和外部 Agent 通信的 Bridge 实现位置。
3. `packages/cli`：Agent 读取状态、执行动作和等待结果的命令行入口。
4. `packages/modern-plugin`：Modern.js plugin 接入位置。

Module Federation 接入目前在 MF 仓库的 observability plugin 中推进，不再在本仓库维护独立接入包。

根目录命令：

1. `pnpm build`：构建所有基础包。
2. `pnpm test`：运行所有包的最小测试。
3. `pnpm check`：一次跑完构建和测试。
4. `pnpm clean`：清理构建产物。
