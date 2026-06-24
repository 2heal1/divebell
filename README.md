# OpenRuntime

OpenRuntime 是一套让前端应用向 Agent 开放运行时状态、事件和动作的能力，用来提速 AI coding 中的页面验证、问题定位和修复闭环。

## 先读什么

1. `docs/rfc-openruntime.md`：当前主 RFC，也是 API 和产品边界的来源。
2. `docs/roadmap.md`：按阶段拆分的实现计划和 checklist。
3. `AGENTS.md`：给 Agent 的项目工作说明。
4. `skills/openruntime/SKILL.md`：Agent 使用 OpenRuntime 验证页面的工作流。
5. `docs/ecosystem-modernjs.md`：Modern.js 接入相关背景。
6. `docs/internal-cli-extensions.md`：内部业务扩展 CLI 命令的结构和 API。
7. `.codex/skills/mf/SKILL.md`：Module Federation 相关问题和观测能力。

## 当前状态

这个项目已经包含 Core SDK、Bridge、CLI、Modern.js plugin、demo 和 Agent skill。Module Federation 接入在 MF 仓库的 observability plugin 中推进。

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
5. `skills/openruntime`：Agent 使用 OpenRuntime 的项目 skill。

Module Federation 接入目前在 MF 仓库的 observability plugin 中推进，不再在本仓库维护独立接入包。

CLI 浏览器能力包括打开页面、跳转、点击、填写、读取页面变量、截图和查看网络请求。查看当前页面请求列表可以运行：

```sh
pnpm exec openruntime network
```

按 URL 文本过滤请求可以加 `--url`：

```sh
pnpm exec openruntime network --url /api/orders
```

排查必须复用用户账号的问题时，可以让用户从本机 Chrome 导出账号状态：

```sh
pnpm exec openruntime export-profile
pnpm exec openruntime import-profile <复制到的内容>
```

如果用户有多个 Chrome profile，可以指定 Chrome 的 profile 名称、目录名或邮箱：

```sh
pnpm exec openruntime export-profile --chrome-profile "Profile 1"
pnpm exec openruntime export-profile --chrome-profile user@example.com
```

如果只需要某个站点的登录状态，可以按域名导出，减少无关站点数据：

```sh
pnpm exec openruntime export-profile --domain github.com --output /tmp/openruntime-github.oprprofile
pnpm exec openruntime import-profile --input /tmp/openruntime-github.oprprofile
```

`--domain` 可以和 `--chrome-profile`、`--chrome-user-data-dir`、`--timeout` 一起使用。读取本机 Chrome profile 前需要先完全退出 Chrome。

根目录命令：

1. `pnpm build`：构建所有基础包。
2. `pnpm test`：运行所有包的最小测试。
3. `pnpm check`：一次跑完构建和测试。
4. `pnpm clean`：清理构建产物。
