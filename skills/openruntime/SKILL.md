---
name: openruntime
description: >-
  帮助已接入或准备接入 OpenRuntime 的项目把页面、组件、业务动作、
  Modern.js、Garfish 和 Module Federation 状态暴露成 target/action/snapshot，
  并用 CLI 读取、执行、等待和诊断。Use when a task explicitly asks to
  use, evaluate, integrate, or troubleshoot OpenRuntime/@openruntime, or
  needs runtime evidence for frontend behavior.
---

# OpenRuntime

## OpenRuntime 是什么

OpenRuntime 让前端应用把页面内部状态、业务动作和浏览器操作开放给 Agent。
它的核心价值是让 Agent 读取应用主动暴露的运行时事实，而不是只靠 UI、DOM、console、截图或异步时机猜结果。

OpenRuntime 主要解决三件事：让页面连上 Agent、让运行时状态可读取、让业务结果可验收。
它不是普通浏览器自动化的替代品。页面没有结构化信号时，可以用 `page-snapshot`、`eval`、`wait-eval` 或必要时的 console 做普通浏览器取证，但这些不能写成 OpenRuntime 结构化证据。

## 适用场景

使用 OpenRuntime：

- 用户明确要求使用 OpenRuntime，或项目已经/准备接入 OpenRuntime。
- 需要把页面、组件、业务状态或业务动作暴露给 Agent。
- 需要确认 route、loader、组件、业务结果、remote、shared、Garfish 子应用或 action 结果是否 ready。
- 需要排查 Modern.js、Garfish、Module Federation、Vmok 或其他前端运行时问题，并希望使用结构化状态定位。
- 需要反复验证同一个前端事实，或者希望 Agent 后续能稳定复用这个信号。

## 安装 OpenRuntime

执行解析脚本，根据返回内容安装和接入：

```bash
node skills/openruntime/scripts/resolve-integration.mjs <path-to-package.json>
```

脚本返回 JSON：`install` 是需要安装的包，`use` 是需要在项目里接入或启用的包。`install` 为空表示不需要新增安装，`use` 为空表示脚本没有检测到需要接入的 OpenRuntime 包。按返回结果执行；没有安装或接入时写清原因。

核心包：

- `@openruntime/core`：页面侧创建 runtime、注册 target、更新 snapshot、注册 action。
- `@openruntime/bridge`：让页面 runtime 和 Agent 侧 CLI 跨进程通信。
- `@openruntime/cli`：Agent 侧打开页面、读取状态、执行 action、等待 target。

框架和运行时包只在对应场景使用：

- Modern.js `>=3.4.0` 或 preview 项目使用 `@openruntime/modern-plugin` 暴露 route、loader、SSR、hydration 等状态；详细接入见 `references/modernjs.md`。
- Module Federation 或 Vmok 消费者项目使用 `@module-federation/observability-plugin` 暴露 remote、expose、shared、报告信息；只要依赖名包含 `vmok` 就按 Vmok/MF 加载链路处理；详细接入见 `references/module-federation.md`。
- Garfish 状态由 Modern 插件的 Garfish 工具暴露；详细接入见 `references/garfish.md`。
- 使用 Modern/MF/Vmok/Garfish 时，根据 `resolve-integration.mjs` 输出选择对应 reference 阅读，不要把所有 reference 全部加载到上下文。

安装或接入失败时，先说明失败原因。不要在没有说明原因的情况下，把 `eval`、`network` 或 console 结果当成 OpenRuntime / MF 结构化证据。

## OpenRuntime 功能

先理解这些概念：

- Bridge：Agent 侧和页面侧 runtime 的通信通道；没有 Bridge，CLI 看不到页面里的 OpenRuntime 状态。
- runtime：页面里运行的 OpenRuntime 实例；它负责注册 target、更新 snapshot、记录 events 和执行 actions。
- target：一个可被引用、查询和等待的状态目标，例如 route、组件、remote、shared 或业务结果。
- snapshot：target 当前状态和关键数据；排查或验收时优先读 snapshot，而不是反复查 DOM 或 console。
- events：target 状态变化和 action 执行历史；用于追溯状态为什么变成现在这样。
- action：页面显式声明给 Agent 执行的动作；执行后仍要通过 snapshot / verify 确认结果。
- CLI：Agent 使用的命令入口，用来打开页面、读取状态、执行 action、等待和验收。

### 连接 Bridge

`open-runtime open` 会启动或复用本机 Bridge 并打开页面，但不会替业务页面创建 target。安装包后，页面 runtime 必须从源码或框架插件配置里连接 Bridge；不要用浏览器 `eval` 临时连接 runtime。

Modern 插件连接：

```ts
import { defineRuntimeConfig } from "@modern-js/runtime";
import { openRuntimeModernPlugin } from "@openruntime/modern-plugin";

export default defineRuntimeConfig({
  plugins: [
    openRuntimeModernPlugin({
      bridge: { port: 17321 },
    }),
  ],
});
```

Core 连接：

```ts
import { createOpenRuntime, installOpenRuntimeOnWindow } from "@openruntime/core";

const runtime = installOpenRuntimeOnWindow(createOpenRuntime());

runtime.connectBridge({
  port: 17321,
});
```

只安装 `@openruntime/core` 不会自动连接 Bridge；页面侧必须调用 `connectBridge`。如果 `openruntime runtimes` 为空，说明页面 runtime 没有连接 Bridge；源码可改时回到安装脚本输出，在源码或框架插件配置里完成连接。源码不可改、用户禁止接入、依赖安装失败或接入失败时，把结构化 runtime 证据标记为 unavailable，再退回普通浏览器取证。

判断连接成功时必须解析 `runtimes` JSON。只要存在 `status: "connected"` 的 runtime，就算页面 runtime 已连接；标识字段是 `runtimeId`，不是 `id`。拿到 connected runtime 后记录 `runtimeId`、`url` 和 `status`，停止连接轮询，不要把后续 `targets`、`snapshot` 或 `actions` 探索耗时计入连接耗时。

### 添加 target 和 snapshot

用 `registerTarget` 声明可等待的状态，用 `updateSnapshot` 写入真实状态。业务 target 默认不会凭空存在；源码可改、需要反复验证、要跨刷新/重启验证，或当前失败无法通过已有信号定位时，主动补最小 target。

```ts
runtime.registerTarget({
  id: "business:orders:risk-panel",
  type: "business.component",
  statuses: ["pending", "ready", "error"],
  source: "orders",
});

runtime.updateSnapshot({
  id: "business:orders:risk-panel",
  status: "ready",
  data: { riskPanelReady: true },
});
```

只暴露能证明结论的状态，不要把整页 DOM 或完整业务数据塞进 snapshot。目标组件可能失败到连自己都注册不了时，在稳定父级、页面或路由容器里注册 target：父级先写 `pending`，子组件成功时写 `ready`，父级捕获错误、超时或缺失时写 `error`。

如果要确认浏览器错误是否消失，源码可改时不要反复查 console；在稳定位置捕获错误并写入 debug target，例如 `debug:<area>:runtime-error`，再用 `snapshot --query <keyword>` 或 `snapshot --id <target-id>` 查询。源码不可改时，一次 console 读取只能作为普通 fallback 证据。

### 添加 action

用 action 表达需要参数、多步骤、跨系统状态、没有稳定 UI 入口，或需要反复复现并等待明确结果的动作。简单点击、输入、跳转和临时 DOM/window 探索不需要强行改成 action。

```bash
pnpm exec openruntime run-action --url <url> orders.refresh --payload '{"scope":"current"}'
pnpm exec openruntime verify business:orders:risk-panel ready --url <url> --timeout 10000
```

`run-action` 只说明动作被执行；动作结果必须落到 target 的 snapshot 上，再用 `verify` 验收。

### 读取状态

用收窄查询读取状态，避免每一步都拉完整 snapshot 或 events：

```bash
pnpm exec openruntime targets --query <keyword>
pnpm exec openruntime snapshot --query <keyword>
pnpm exec openruntime snapshot --id <target-id>
pnpm exec openruntime events --query <keyword> --limit 50
pnpm exec openruntime events --target-id <target-id> --limit 50
```

完整 `snapshot` 或最近 `events` 只在目标未知时读取一次。一旦确定 target，后续按 `--id`、`--target-id`、`--type`、`--source`、`--status` 或 `--query` 收窄范围。

### wait-for 和 verify

`wait-for` 用于等待一个明确 target 到达指定状态。它只证明“这个 target 到了这个状态”，不负责判断这个 target 是否代表最终业务成功。

```bash
pnpm exec openruntime wait-for modern:route ready --where pathname=/orders --timeout 10000
```

判断 `wait-for` 时看 `result.success` 和 target 状态。`success: false`、timeout、target `error` 都是失败证据；不要用 `|| true` 吞掉失败。

`verify` 用于保守验收。已有或刚补了能代表业务事实的 target 时，必须直接执行 `verify <target-id> ready`；最终结果写出实际命令、`result.success` 和 `result.evidence.level`。

```bash
pnpm exec openruntime verify business:orders:risk-panel ready --timeout 10000
```

只有 `success: true` 且 `evidence.level: "business"` 才能写成业务验收通过。Modern、MF、Vmok 或 Garfish target 的 `verify` 最多说明路由、加载链路、共享依赖或子应用状态；不要写成业务组件、业务数据或业务动作成功。缺少业务 target 时，`verify` 只做一次轻量页面可见性检查来拦截明显白屏；白屏、检查不可用或检查不确定时，都不能把底层 ready 写成业务成功。

### 浏览器能力

`open` 默认使用静默浏览器。只有需要人工观察、布局、截图、动画、视觉问题或真实点击路径时，才使用 `--ui`。

```bash
pnpm exec openruntime open <url> --bridge http://localhost:17321
pnpm exec openruntime page-snapshot --url <url>
pnpm exec openruntime click <ref|selector|text>
pnpm exec openruntime fill <ref|selector> <value>
pnpm exec openruntime eval '({ pathname: location.pathname, title: document.title })'
pnpm exec openruntime wait-eval 'Boolean(document.querySelector("[data-testid=remote-order-panel]"))' --timeout 10000
```

`page-snapshot` 用于获取可操作元素引用；如果已经拿到 `[ref=eN]`，点击时优先用 ref。`eval` / `wait-eval` 用于未接入 OpenRuntime API、源码不可改或一次性普通页面验收；它们不能替代应该执行的 `verify`，也不能写成 OpenRuntime 业务验收。

### 常用 CLI

<!-- This section is generated by scripts/sync-openruntime-cli-docs.mjs. Do not edit by hand. -->

完整 CLI 清单见 `docs/cli-reference.md`。这里仅保留 OpenRuntime skill 最常用入口。

普通验收优先选择一条最短路径：能改源码且需要反复验证时先补最小业务 target，再用 `verify`；不能改源码或一次性简单页面结果用 `eval` / `wait-eval`。`snapshot`、`events` 和 `targets` 主要用于定位失败原因；浏览器错误等调试事实应优先写入 snapshot 后用 `snapshot --query` 查询。
- `open-runtime start [--port <port>]` - 启动或复用 CLI 管理的 Bridge；命令返回后 Bridge 会作为 CLI 托管进程常驻。
- `open-runtime open <url> [--bridge <url>] [--port <port>] [--session <id>] [--no-bridge] [--ui]` - 打开页面，默认会先准备 Bridge，并以静默浏览器模式运行；--ui 打开可见浏览器。
- `open-runtime runtimes [--bridge <url>]` - 列出连接到 Bridge 的 runtime。
- `open-runtime verify [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] <target-id> <status> [--where <path=value>] [--timeout <ms>] [--open] [--next]` - 保守验收 target：只有业务 target 成功才判定业务通过；Modern/MF/Garfish/Vmok 等底层 target 只作为底层证据，并在缺少业务 target 时做一次轻量白屏检查。
- `open-runtime wait-for [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] <target-id> <status> [--where <path=value>] [--timeout <ms>] [--open] [--strict] [--next]` - 等待 target 到达指定状态；--where 的 value 会按 JSON 字面量解析，可匹配 number、boolean、null。
- `open-runtime wait-eval <script> [--timeout <ms>]` - 轮询页面表达式，直到结果为 true。
- `open-runtime eval <script>` - 在页面内执行脚本，也支持 --file <path> 读取脚本文件。
- `open-runtime targets [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--id <id>] [--type <type>] [--source <source>] [--status <status>] [--query <keyword>]` - 读取所选 runtime 注册的 target 定义。
- `open-runtime snapshot [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--id <id>] [--type <type>] [--source <source>] [--status <status>] [--query <keyword>]` - 读取当前 runtime snapshot 状态。
- `open-runtime events [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--target-id <id>] [--type <type>] [--source <source>] [--status <status>] [--action <name>] [--since <event-id>] [--limit <n>] [--query <keyword>]` - 读取 runtime event 历史。

## 使用 OpenRuntime

先确认目标项目源码是否可更改。

- 源码可更改：必须接入 OpenRuntime，并让页面 runtime 连接 Bridge。连接后用 `runtimes` 确认存在 `status: "connected"` 的 runtime，再继续排查或验证。
- 源码不可更改：只使用 OpenRuntime CLI 做浏览器操作和普通页面取证，例如 `open`、`page-snapshot`、`eval`、`wait-eval`、`network`、必要时 console。

排查源码可改的问题时，按这个流程走：

1. 运行 `resolve-integration.mjs`，按返回的 `install` 和 `use` 安装、接入；根据返回内容读取 Modern、MF/Vmok 或 Garfish reference。
2. 启动 Bridge，例如 `pnpm exec openruntime start --port 17321`。
3. 启动应用，并确保源码或框架插件配置连接同一个 Bridge。
4. 打开问题页面并确认 runtime：

```bash
pnpm exec openruntime open <url> --bridge http://localhost:17321
pnpm exec openruntime runtimes --bridge http://localhost:17321
```

5. 先读当前结构化状态：

```bash
pnpm exec openruntime snapshot --url <url>
pnpm exec openruntime snapshot --url <url> --query <keyword>
```

如果 snapshot 已经有异常信息，先根据异常定位到需要验证的位置，再参考「添加 target 和 snapshot」补最小 target / snapshot，继续排查。

如果 snapshot 没有需要的内容，先用浏览器能力看页面和资源链路：

```bash
pnpm exec openruntime page-snapshot --url <url>
pnpm exec openruntime network --url <keyword>
pnpm exec openruntime console --query <keyword> --limit 50
```

`page-snapshot` 用来看 DOM 结构和可操作元素，`network` / console 只用于定位问题区间。定位到具体问题区间后，回到源码里参考「添加 target 和 snapshot」补最小 target / snapshot，再继续排查。不要长期用 DOM、network 或 console 代替结构化信号。

最终验收只用 `verify`：

```bash
pnpm exec openruntime verify <business-target-id> ready --url <url> --timeout 10000
```

`verify` 成功后就结束排查，不要重复启动或重复验证同一个事实。成功后仅用 OpenRuntime 的截图能力输出改动后的页面状态即可，不需要再调用 agent 的 UI 分析来证明成功：

```bash
pnpm exec openruntime screenshot <name> --full-page
```

如果为了排查临时接入了 OpenRuntime 辅助代码，确认修复后可以移除这些辅助代码，只保留主要业务修复。对后续 Agent 或运维有价值的 target / snapshot / action 才保留。

使用时避免这些反例：

- 源码可改却不连接 Bridge，只用 CLI 做普通浏览器排查。
- `runtimes` 为空时继续把 `targets`、`snapshot`、`events` 或 `verify` 写成已使用。
- 只等 `modern:route ready`，就把业务组件或业务结果写成 ready。
- `verify modern:route ready` 返回底层状态后，把它写成业务通过。
- 需要反复验证时，因为没有现成业务 target 就一直用 `eval` / console 代替补最小 target。
- `verify` 成功后继续重复截图、重复 UI 分析或重复检查同一事实。

Modern.js 的 route、loader、SSR、hydration 和业务 ready helper 用法见 `references/modernjs.md`。Garfish 子应用 runtime 观测和接入方式见 `references/garfish.md`。Module Federation remote、expose、shared 和 observability report 用法见 `references/module-federation.md`。只有排查对应运行时状态时再读取这些文件。
