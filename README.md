# OpenRuntime

OpenRuntime 提供一套面向 Agent 的前端运行时观测和操作能力：它可以托管本地 Bridge，提供打开页面、跳转、点击、填写、截图、读取网络和 console 的浏览器能力，也提供 target、snapshot、event、action 和 waitFor 等标准定义与 API。

OpenRuntime 的主旨是减少 AI “猜”。页面当前是什么状态、发生过什么事件、哪些动作可以执行、应该等待哪个目标、失败原因是什么，都应该有迹可循。Agent 可以通过 OpenRuntime 更快拿到事实依据；团队也可以用它封装固定流程，让自动化真正跑起来。

例如，一个已接入 OpenRuntime 的 release notes 页面可以声明 `docs:release-notes` target 和 `release-note.list-latest` action。Agent 要获取最近更新时，可以按固定流程执行：

```sh
npx open-runtime start
npx open-runtime open https://example.com/openruntime/release-notes
npx open-runtime wait-for docs:release-notes ready --url https://example.com/openruntime/release-notes
npx open-runtime run-action --url https://example.com/openruntime/release-notes release-note.list-latest --payload '{"limit":3}'
```

这里的 target 和 action 由页面接入方声明。Agent 不需要猜 DOM 结构，只按标准能力拿结果。
团队可以继续把这几步包装成内部命令，例如 `open-runtime release-note latest --limit 3`。

## 快速接入

普通项目通常只需要两个部分：

1. 页面侧安装 SDK 或框架插件。
2. Agent / 开发者侧安装 CLI。CLI 会自己启动和管理 Bridge，也能打开和操作浏览器。

### 普通前端项目

安装页面侧 SDK：

```sh
npm i @openruntime/core
```

在页面里注册一个 target，写入当前状态，并连接 CLI 管理的 Bridge：

```ts
import { createOpenRuntime, installOpenRuntimeOnWindow } from "@openruntime/core";

const runtime = installOpenRuntimeOnWindow(createOpenRuntime());

runtime.registerTarget({
  id: "app:home",
  type: "app.page",
  source: "app",
  statuses: ["loading", "ready", "error"],
});

runtime.updateSnapshot({
  id: "app:home",
  status: "ready",
});

runtime.connectBridge({ port: 17321 });
```

安装并使用 CLI：

```sh
npm i -D @openruntime/cli
npx open-runtime start
npx open-runtime open http://localhost:3000
npx open-runtime targets --url http://localhost:3000
npx open-runtime snapshot --url http://localhost:3000
npx open-runtime wait-for app:home ready --url http://localhost:3000
```

### Modern.js 项目

安装 Modern.js 插件和 CLI：

```sh
npm i @openruntime/modern-plugin
npm i -D @openruntime/cli
```

在 `src/modern.runtime.ts` 接入：

```ts
import { openRuntimeModernPlugin } from "@openruntime/modern-plugin";

export default openRuntimeModernPlugin({
  bridge: {
    port: 17321,
  },
});
```

然后通过 CLI 读取框架状态：

```sh
npx open-runtime start
npx open-runtime open http://localhost:3000
npx open-runtime snapshot --url http://localhost:3000 --query modern
npx open-runtime wait-for modern:route ready --url http://localhost:3000
```

Modern.js 插件负责框架状态，例如 app、route、loader、SSR 和 hydration。业务是否真的 ready 仍然应由业务代码用 ready helper 声明。

### Garfish 主应用

Garfish 主应用同样使用 `@openruntime/modern-plugin` 里的 Garfish helpers。它会暴露 `modern:garfish` 聚合 target，以及 `modern:garfish:app:<name>` 子应用 target。

在主应用的 Garfish 配置里接入：

```ts
import {
  createOpenRuntimeGarfishCustomLoader,
  createOpenRuntimeGarfishPlugin,
  createOpenRuntimeGarfishReporter,
} from "@openruntime/modern-plugin";

const reporter = createOpenRuntimeGarfishReporter();

export const garfishOptions = {
  plugins: [createOpenRuntimeGarfishPlugin({ reporter })],
  customLoader: createOpenRuntimeGarfishCustomLoader({ reporter }),
};
```

如果项目已有 `customLoader`，把它传给 `loader`，让 OpenRuntime 包一层而不是替换它。详细说明见 `packages/modern-plugin/README.md` 和 `skills/openruntime/references/garfish.md`。

常用检查：

```sh
npx open-runtime snapshot --url http://localhost:3000 --id modern:garfish
npx open-runtime wait-for --url http://localhost:3000 modern:garfish:app:orders mounted
```

Garfish target 只说明子应用加载、脚本执行、provider render、挂载和卸载状态。子应用内部业务是否 ready，仍然应由业务 target 声明。

### Module Federation 项目

OpenRuntime 第一版不在本仓库发布独立 MF 包。MF 项目应接入 `@module-federation/observability-plugin`，由 MF observability 把 remote、expose、shared、manifest、remoteEntry 和运行时错误暴露给 OpenRuntime。

Agent 侧排查 MF 问题时，先按 `skills/openruntime/references/module-federation.md` 和 `.codex/skills/mf/SKILL.md` 检查并主动补 observability 接入，再用 OpenRuntime CLI 读取 `mf:*` target。

## 包说明

| 包 | 普通用户是否直接安装 | 说明 |
| --- | --- | --- |
| `@openruntime/core` | 是 | 页面内 Runtime Center、target、snapshot、event、action 和 Bridge 连接 API。 |
| `@openruntime/cli` | 是 | Agent / 开发者使用的命令行工具；负责启动和管理 Bridge、打开和操作浏览器、读取状态、执行声明动作并等待目标状态。 |
| `@openruntime/modern-plugin` | Modern.js / Garfish 主应用安装 | 自动暴露 Modern.js 框架运行时状态，并提供 Garfish 主应用接入 helpers。 |
| `@openruntime/bridge` | 通常不用 | 继续发布，供 CLI 内部依赖和高级自定义工具复用。 |

发布包只包含编译产物和类型文件，不把依赖打进包里，也不对代码做额外压缩。安装速度后续优先通过拆分重依赖和可选能力优化。

## 常用 CLI

完整命令见 `docs/cli-reference.md`。

```sh
open-runtime start
open-runtime open <url>
open-runtime goto <url>
open-runtime click <ref|selector|text>
open-runtime fill <ref|selector> <value>
open-runtime screenshot [name] [--full-page]
open-runtime network [--url <query>]
open-runtime console [--level <level>] [--query <keyword>] [--limit <n>]
open-runtime runtimes
open-runtime targets --url <url>
open-runtime snapshot --url <url>
open-runtime events --url <url> --limit 50
open-runtime actions --url <url>
open-runtime run-action --url <url> <action-name> --payload '{"key":"value"}'
open-runtime wait-for --url <url> <target-id> <status> --timeout 10000
```

CLI 浏览器能力还包括跳转、点击、填写、读取页面变量、截图、查看网络请求和查看 console。排查需要复用账号状态时，可以使用：

```sh
open-runtime export-profile --domain github.com --output /tmp/openruntime-github.oprprofile
open-runtime import-profile --input /tmp/openruntime-github.oprprofile
```

## 安全边界和第一版限制

OpenRuntime 只执行页面通过 action registry 明确声明过的动作。未声明动作、不可用动作、输入不符合 schema 的动作都不会调用 handler。

第一版不做跨 tab、跨 iframe、跨 worker 或多 Runtime Center 聚合。Bridge 只面向本地开发和 Agent 验证场景，不作为公网服务暴露。

错误原因、安全边界、发布策略和发布前验收见 `docs/release-stage7.md`。

## 开发本仓库

本仓库使用 Node 24 和 pnpm workspace monorepo：

```sh
nvm use
corepack enable
pnpm install
pnpm check
```

当前主要入口：

1. `docs/rfc-openruntime.md`：当前主 RFC，也是 API 和产品边界来源。
2. `docs/roadmap.md`：阶段计划和 checklist。
3. `docs/release-stage7.md`：第一版发布整理。
4. `docs/cli-reference.md`：CLI 命令参考。
5. `packages/modern-plugin/README.md`：Modern.js 插件细节。
6. `skills/openruntime/SKILL.md`：Agent 使用 OpenRuntime 的工作流。

根目录命令：

```sh
pnpm build
pnpm test
pnpm check
pnpm clean
```
