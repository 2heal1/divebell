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

OpenRuntime 帮助项目把页面内部状态、业务动作和浏览器操作开放给 Agent。
它的核心价值是让 Agent 不再靠 UI、DOM 或异步时机猜结果，而是读取应用主动暴露的
可信运行时事实。状态验证、状态获取和业务动作结果都应以这些信号为准，同时配套
CLI 可以完成打开、操作、读取、等待和诊断等纯 CLI 自动化流程。

OpenRuntime 提供 CLI 读取 `targets`、`snapshot`、`events` 和 `actions`，
执行页面声明的 action，等待 target 到达目标状态。它也能打开页面、跳转、点击、
填写、读取浏览器 console、DOM/window、截图和关闭页面。

本 skill 只在已经选择 OpenRuntime 路径后约束浏览器操作。没有使用 OpenRuntime、
也不需要 OpenRuntime 证据的任务，不要因为本 skill 改变 Agent 原本的工具选择。

## 什么时候使用

遇到下面情况，使用 OpenRuntime：

- 用户明确要求使用 OpenRuntime，或项目已经/准备接入 OpenRuntime。

- 需要将页面、组件或业务状态暴露给 Agent，而不是依赖 UI、DOM 或截图推断当前状态。

- 需要设计或补充 OpenRuntime 的 target、snapshot、event 或 action。

- 需要确认页面、路由、loader、组件、业务、远程模块或共享依赖是否已经 ready。

- 需要执行页面声明的 action，并等待目标状态完成。

- 需要通过 CLI 或 Browser Bridge 打开页面、跳转、点击、填写、读取 console、DOM/window、截图，并结合 OpenRuntime 的结构化状态完成验证。

- 需要排查 Modern.js、Garfish、Module Federation 或其他前端运行时问题，并结合 OpenRuntime 提供的状态、日志或全局变量进行定位。

- 需要验证某项改动是否生效，或确认某个问题是否已经修复，并通过 OpenRuntime 提供的状态、日志或运行时信息作为验收依据。
如果任务只是普通浏览器自动化，且没有要求 OpenRuntime、项目也没有 OpenRuntime
上下文，不要因为本 skill 改变 Agent 原本的工具选择。

## 项目接入和命令入口

先判断项目当前处于哪一步：还没接入、正在接入，还是已经接入。

### 包分工

- `@openruntime/core`：页面侧注册 target、更新 snapshot、注册 action。
- `@openruntime/bridge`：让页面 runtime 和 Agent 侧 CLI 跨进程通信。
- `@openruntime/cli`：Agent 侧读取状态、执行 action、等待 target。
- `@openruntime/modern-plugin`：Modern.js `>=3.4.0` 或 preview 项目自动暴露 route、loader、SSR、hydration 等状态；它不转导出 `@openruntime/core` API。
- `@openruntime/modern-plugin` 的 Garfish 工具：主应用接入后暴露 Garfish 子应用加载、执行、挂载和错误状态。
- `@module-federation/observability-plugin`：MF 或 Vmok 消费者项目接入后，OpenRuntime 才能稳定读取 remote、expose、shared 和报告信息。

### 安装选择

项目还没接入时，优先运行内置脚本读取项目 `package.json`，不要手工逐项猜依赖：

```bash
node skills/openruntime/scripts/resolve-integration.mjs <path-to-package.json>
```

脚本只输出应安装和使用的包集合。后续按脚本输出执行；只有脚本无法读取项目依赖时，
才手工检查下面的规则：

只要当前任务需要基于 OpenRuntime 读取结构化运行时事实，并且能找到目标应用的
`package.json`，就先运行这个脚本；这是接入判断步骤，不是可选建议。执行过程中必须
先确认并保留这些事实，后续判断只能基于这些事实：

- `resolve-integration`: executed / failed / skipped。
- 使用的 `package.json` 路径。
- 脚本输出的 `install` / `use` 摘要。
- 按输出安装、接入了哪些包；没有安装或没有接入时，写清具体原因。

如果找不到目标应用的 `package.json`、依赖安装失败、用户禁止改源码、版本不满足、
或任务只允许一次性浏览器取证，可以跳过安装或接入，但必须先记录原因。
不要在没有说明这些原因的情况下，直接把 `eval`、`network` 或 `console` 结果当成
OpenRuntime / MF 结构化证据。

- EdenX/Modern 项目先读 `@modern-js/runtime`、`@modern-js/plugin` 或
  `@modern-js/app-tools` 版本。版本 `>=3.4.0`，或版本字符串包含 `preview` 时，默认
  安装并使用 `@openruntime/modern-plugin`。
- 使用 `@openruntime/modern-plugin` 后，如果业务代码还要直接注册 target、更新 snapshot、
  注册 action，或读取 window 上的 runtime，再把 `@openruntime/core` 作为直接依赖安装。
- Modern 版本低于 `3.4.0` 且不是 preview 时，不要为了排查默认接入
  `@openruntime/modern-plugin`。旧版本缺少必要 hook，可能只能看到基础 target 或
  `modern:app` 停在 `rendering`，不能据此判断 route ready、loader、组件错误或 hydration。
  这种场景改用 `@openruntime/core` 在业务稳定位置补最小 target/action/snapshot。
- 项目 `package.json` 里出现 Module Federation 或 Vmok 相关依赖时，安装并使用
  `@module-federation/observability-plugin`。Vmok 按 MF 加载链路处理，不要求同时出现
  直接的 `@module-federation/*` 依赖；常见 Vmok 信号包括 `@edenx/plugin-vmok`、
  `@vmok/*`、`@byted-goofy/vmok`，以及包名中包含 `vmok` 的依赖。MF observability
  不设版本门槛，也不额外要求安装 `@openruntime/core`。

### 如何连接

`open-runtime open` 会启动或复用本机 Bridge 并打开页面，但不会替业务页面创建有意义的
runtime target。安装包之后还必须让页面 runtime 连接 Bridge。

Modern `>=3.4.0` 或 preview 项目使用 `@openruntime/modern-plugin` 时，在
`src/modern.runtime.ts` 使用插件，并通过 `bridge` 参数连接：

```ts
import { defineRuntimeConfig } from "@modern-js/runtime";
import { openRuntimeModernPlugin } from "@openruntime/modern-plugin";

export default defineRuntimeConfig({
  plugins: [
    openRuntimeModernPlugin({
      bridge: {
        port: 17321,
      },
    }),
  ],
});
```

不走 Modern 插件或项目不是 Modern 时，在项目入口安装 Core runtime，注册最小 target，
再调用 `connectBridge`：

```ts
import { createOpenRuntime, installOpenRuntimeOnWindow } from "@openruntime/core";

const runtime = installOpenRuntimeOnWindow(createOpenRuntime());

runtime.registerTarget({
  id: "app:ready",
  type: "app",
  statuses: ["ready", "error"],
  source: "app",
});

runtime.updateSnapshot({
  id: "app:ready",
  status: "ready",
});

runtime.connectBridge({
  port: 17321,
});
```

只安装 `@openruntime/core` 不会自动连接 Bridge；页面侧必须调用 `connectBridge`，否则
`runtimes` 为空，`targets`、`snapshot` 和 `wait-for` 都读不到这个页面 runtime。

如果项目已经有 `window.__OPEN_RUNTIME__`，但源码里还没有连接 Bridge，可以用浏览器
`eval` 临时连接已有 runtime。这只是临时补救，不是 Modern 插件的默认接入方式：

```bash
pnpm exec openruntime eval '(() => { const runtime = window.__OPEN_RUNTIME__; if (!runtime || typeof runtime.connectBridge !== "function") return { connected: false, reason: "missing window.__OPEN_RUNTIME__" }; runtime.connectBridge({ port: 17321 }); return { connected: true }; })()'
pnpm exec openruntime runtimes
```

不要在 `eval` 里临时创建一个空 runtime；空 runtime 没有业务 target，会误导后续判断。

连接失败时按下面顺序处理：

- `eval` 返回 `missing window.__OPEN_RUNTIME__`，或页面对象没有 `connectBridge`：
  页面没有可用的 OpenRuntime Core runtime。Modern `>=3.4.0` 或 preview 项目先把
  `@openruntime/modern-plugin` 接进 `modern.runtime` 并传 `bridge`；低版本 Modern
  或手写 Core 接入才在源码入口补最小 runtime。
- `openruntime runtimes` 为空，且页面也没有可连接的 `window.__OPEN_RUNTIME__`：
  不能继续把 `targets`、`snapshot`、`events` 或 `wait-for` 写成已使用。源码可改时，
  回到 `resolve-integration` 输出，先接入推荐的 runtime 包；源码不可改或接入失败时，
  把结构化 runtime 证据标记为 unavailable，并写清阻塞原因。之后才能退回到
  `eval` / `wait-eval` / `network` / `console` 做普通浏览器取证。
- `eval` 返回 `{ connected: true }` 但 `runtimes` 为空：优先怀疑 Bridge 端口不一致。
  用当前 `open` / `start` 的 `--port` 或 `--bridge` 值重跑连接脚本，不要先改业务源码。
- `runtimes` 有值但没有目标 target：说明 Bridge 已连上，但插件或业务 target 没有暴露。
  Modern 项目检查 `@openruntime/modern-plugin` 接入；MF/Vmok 检查
  `@module-federation/observability-plugin` 是否接到消费者配置，Vmok 项目按
  `package.json` 里的 Vmok 相关依赖判断；业务验收缺 target 时，
  源码可改且需要反复验证、跨刷新/重启验证，或这个信号会被继续使用时，先补最小业务 target 并
  用 `wait-for` 验收。不能改源码或一次性简单验收时，才用一次 `eval` / `wait-eval`。
- 多 tab、刷新或 HMR 导致 runtime 变化时，不要反复重开页面；优先用默认跟随模式，
  或在明确等待下一次连接时使用 `--next`。

### 命令入口

项目已安装 CLI 后，常用入口是：

```bash
pnpm exec openruntime <command>
```

用 OpenRuntime CLI 打开或操作页面。页面打开后，先找已连接 runtime：

```bash
pnpm exec openruntime runtimes
```

确认 runtime 后，进入“使用和排查验证”选择一条最短路径。完整命令表见文末
“CLI 命令”。

## 使用和排查验证

先区分 OpenRuntime CLI 托管的进程和项目自己的应用进程：

- `pnpm exec openruntime start --port <port>` 启动或复用 Bridge。这个命令会返回，Bridge 会作为 CLI 托管进程常驻；后续用 `pnpm exec openruntime stop --port <port>` 停止。
- `pnpm exec openruntime open/goto/click/fill/eval/wait-eval/snapshot/targets/events/actions/wait-for` 都是一次性 CLI 操作，可以在普通 shell 里执行。
- `pnpm dev`、`pnpm start`、`pnpm start:app`、`pnpm start:app:bridge` 这类项目应用服务不是 OpenRuntime CLI 托管的常驻进程。不要把它们用普通 shell 后台 `&` 丢进一次性命令后就继续验证；shell 结束后服务可能退出。应用 dev server 必须由当前 agent 的长运行命令会话、平台服务管理器，或项目明确提供的 daemon/serve 脚本保持存活。

推荐启动顺序：

```bash
pnpm exec openruntime start --port 17321
```

然后在一个会保持运行的会话里启动应用，例如：

```bash
OPENRUNTIME_BRIDGE_PORT=17321 pnpm start:app:bridge ops-console
```

应用可访问后，再打开页面并确认 runtime：

```bash
pnpm exec openruntime open http://localhost:4412 --bridge http://localhost:17321
pnpm exec openruntime runtimes --bridge http://localhost:17321
```

`open` 默认使用静默浏览器，不打开可见 UI。只有需要人工观察、布局、截图、动画、
视觉问题或真实点击路径时，才显式使用 `pnpm exec openruntime open <url> --ui`。
如果已有浏览器进程在运行，先 `pnpm exec openruntime close`，再用 `--ui` 重新打开。

确认 CLI、Bridge 和页面 runtime 能正常连接后，直接选择下面的一条最短验收路径。

## 最短验收路径

使用 OpenRuntime 不应增加验收步骤。先把任务结果翻译成一个事实，然后只选一条能证明
该事实的路径。事实已经证明后立即停止，不要为了整理说明或“再确认一下”继续收集证据。

- 业务 target 默认不会凭空存在。源码可改、结果需要反复验证、要跨刷新/重启验证，
  或这个事实会被反复验证时，先主动在稳定业务位置补最小 target，再用
  `wait-for <target-id> ready` 验收。
- 已有或刚补了能代表业务事实的 target：直接 `wait-for <target-id> ready`。
  成功后结束；不要再查完整 `snapshot`、`events`、`network`、截图或重复 `eval`。
- 不能改源码、只是临时探索，或一次性简单 UI/文本结果不值得改代码时，用一次
  `wait-eval` 或 `eval` 证明目标 DOM、文本或 window 状态即可结束。这等价于普通 UI 验收通过。
- 如果任务要求 OpenRuntime 结构化证据，但 runtime 没连上、没有 target、或 MF
  observability 不可用，先按“安装选择”和“如何连接”处理。只有记录清楚不可用原因后，
  才能把 `eval` / `wait-eval` 作为 fallback 证据；这些 fallback 证据不能标记为
  `targets` / `snapshot` / `events` / `wait-for` 证据。
- 如果任务本身是确认浏览器错误消失，或 `wait-for` / `eval` 失败后需要排错，进入
  失败定位后再按需查一次 `console --level error --limit 50`。
- `snapshot`、`events`、`targets`、`network`、`page-snapshot`、`screenshot` 不是普通
  功能验收默认步骤。它们只用于发现/定位失败、资源链路问题、真实点击路径、可访问性、
  视觉、布局或截图类任务。

常用最短验收命令：

```bash
pnpm exec openruntime wait-for business:orders:risk-panel ready --timeout 10000
pnpm exec openruntime wait-eval 'document.body.textContent.includes("Risk ready")' --timeout 10000
pnpm exec openruntime eval '({ pathname: location.pathname, ready: Boolean(document.querySelector("[data-testid=remote-order-panel]")) })'
```

只保留已经用于得出结论的命令和结果。不要为了填“证据”“关键命令”这类字段而
额外执行 `snapshot`、`events`、`network`、截图或重复页面查询。

## 补最小信号

业务 target 默认不会存在；源码可改、结果需要反复验证、要跨刷新/重启验证、
这个信号会被继续使用，或当前失败无法通过已有信号定位时，要主动补最小
OpenRuntime target。只有不能改源码、只是临时探索，或一次 DOM/window 查询已经足以
达到普通验收标准时，才直接使用页面查询能力。

补最小信号时，只暴露能证明结论的状态，不要把整页 DOM 或完整业务数据塞进 snapshot。
例如验证订单风险组件，就注册 `business:orders:risk-panel` 这类最小 target。目标组件
可能失败到连自己都注册不了时，在必定能加载的上一级注册或更新验证 target，例如页面、
路由容器、稳定父组件。父级先写 `pending`，子组件成功时写 `ready`，父级捕获错误、
超时或缺失时写 `error`。

```ts
runtime.registerTarget({
  id: "debug:orders:remote-panel",
  type: "debug.component",
  statuses: ["pending", "ready", "error"],
  source: "debug",
});

runtime.updateSnapshot({
  id: "debug:orders:remote-panel",
  status: "ready",
  data: { remotePanelReady: true },
});
```

`updateSnapshot` 用于标记真实状态，例如组件 ready/error、loader 数据可用、
Garfish 子应用 mounted/error、MF 加载结果和复杂 action 的执行结果。动作是否触发看
`run-action` 或 events，结果是否正确看 snapshot / `wait-for`。
如果这些 OpenRuntime API 只是为了本次排查，验证后删除；对后续 Agent 或运维有价值再保留。

添加后，用 CLI 先执行 `wait-for`，然后从最小复现范围开始验证。不要因为当前没有业务
target 就直接放弃结构化验收；先判断源码是否可改、这个信号是否会被反复使用。

常见反例要避免：

- 只等 `modern:route ready`，就把业务组件或业务结果当成 ready。
- 每一步都读取完整 `snapshot` 和完整 `events`。
- `wait-for` 失败后用 `|| true` 跳过，再用 DOM 找到元素就当成功。
- 需要反复验证时，因为没有现成业务 target 就一直用 `eval` / console 代替补最小 target。
- 一次性简单验收时，为了使用 OpenRuntime 强行补 target，而不是用一次 `eval` 达到普通 UI 验收标准。
- 为了补充材料额外执行 `network`、`page-snapshot`、`screenshot` 或重复 `eval`。
- OpenRuntime 已经给出明确 error 后，继续等不存在的按钮、截图或重复查询同一批元素。

## 运行时边界

已有 target 时，优先用 target 的语义判断它自己负责的层级：

- `modern:route ready` 只说明路由 ready，不等于业务组件、远程模块、接口数据或业务动作 ready。
- Garfish target 只说明子应用加载、脚本执行、provider render、挂载或卸载状态，不等于子应用业务 UI ready。
- MF target 只说明 remote、expose、shared 或报告状态，不等于消费方业务组件 ready。
- 业务结果必须看对应业务 target、loader 状态、MF expose/shared target 或 action 结果 target。
  没有业务 target 时，先按“补最小信号”判断是否应该主动补；只有不能改源码或一次性
  简单验收时，才用一次页面 `eval` / `wait-eval` 验证。

如果远程模块问题来自 Module Federation 或 Vmok，但查不到 `mf.remote`、`mf.remote.expose`、
`mf.shared` 或 `mf.shared.conflict` target，先判断项目是否缺少
`@module-federation/observability-plugin`。源码可改时，先接入 MF observability，再继续定位；
源码不可改或接入失败时，把 MF observability 标记为 unavailable，并说明原因。不要在缺少
MF target 或 observability report 的情况下直接用 DOM 猜 remote/shared/expose 的加载结果；最多写成
普通浏览器现象，不能写成 MF 结构化结论。

## 失败定位

只有最短验收路径失败、目标不明确，或任务本身是定位问题时，才进入失败定位。先判断
失败发生在页面连接、route、loader、业务组件、MF/Garfish 加载、业务 action 结果中的哪一段，
再只在失败段内继续查源码、事件或补信号。已通过阶段不要重复验证。

定位时先收窄查询范围：

```bash
pnpm exec openruntime targets --query <keyword>
pnpm exec openruntime snapshot --query <keyword>
pnpm exec openruntime snapshot --id <target-id>
pnpm exec openruntime events --query <keyword> --limit 50
pnpm exec openruntime events --target-id <target-id> --limit 50
pnpm exec openruntime console --query <keyword> --limit 50
```

完整 `snapshot` 或最近 `events` 只在目标未知时读取一次，用于发现当前有哪些 target 和
错误。一旦确定目标，后续必须按 `--id`、`--target-id`、`--type`、`--source`、`--status`
或 `--query` 收窄范围。

如果怀疑某个库、remote、shared、资源或运行时来源有问题，用关键词查询相关错误和状态。
找到具体 target 后，后续优先用 `events --target-id <target-id> --limit 50`。
Module Federation shared 单例多版本冲突会暴露为
`mf:shared-conflict:<name>:<scope>`，例如 `mf:shared-conflict:react:default`。
如果 `snapshot --query react` 或 `snapshot --query shared` 已经看到这个 target，
就把它作为结构化证据，按 shared 版本、来源和 scope 排查，不要再通过 UI 或 DOM
重复猜测是否存在多实例问题。

`wait-for --where` 的 value 会按 JSON 字面量解析：`data.mounted=true` 匹配布尔值，
`data.matchedCount=1` 匹配数字，`data.optional=null` 匹配 null；
`pathname=/orders` 仍按字符串匹配。

判断 `wait-for` 时必须看输出里的 `result.success` 和 target 状态。
`success: false`、timeout、target `error` 都是失败证据，不要因为命令输出了 JSON、
后续有 snapshot，或页面里还能找到 DOM，就写成 ready。如果 `wait-for` 条件失败，
但 `snapshot` 另有明确结论，要说明为“wait 条件未满足，snapshot 显示……”，不要写成
`wait-for` 成功。不要用 `|| true` 吞掉 `wait-for` 失败；失败后先读返回的 reason、
当前 snapshot 和相关 events，再决定是否继续。

如果 `snapshot` 或 `events` 已经显示 `modern:route`、SSR、hydration、MF target、
Garfish target 或业务 target 是 `error`，并且错误已经说明当前页面或功能失败，就直接
以这个错误为结论。不要继续点击、等待 DOM、截图或查询同一批 UI 元素来重复确认。

执行行为时，不需要把所有操作都改成 action。简单用户路径、按钮点击、表单填写、
页面跳转和 DOM/window 探索，直接使用浏览器能力：

```bash
pnpm exec openruntime page-snapshot --url <url>
pnpm exec openruntime click '刷新订单'
pnpm exec openruntime fill '[name=keyword]' 'risk'
pnpm exec openruntime goto <url>
pnpm exec openruntime wait-eval 'Boolean(document.querySelector("[data-testid=remote-order-panel]"))' --timeout 10000
pnpm exec openruntime eval '({ pathname: location.pathname, title: document.title })'
```

如果已经通过 `page-snapshot` 拿到 `[ref=eN]`，点击时优先用 ref，例如
`pnpm exec openruntime click e7`。裸文本点击会优先匹配可交互元素的精确文本；
文本不唯一、目标难区分或已经有 ref 时，不要重复走一轮文本点击。

代码修改、页面状态污染或需要重新走初始化流程时，可以刷新或重开页面。已知会产生新
runtime 时，先执行 `wait-for <target-id> <status> --next`，再刷新或重开页面。
刷新后如果 URL 带有 `openruntimeSessionId=<session-id>`，新的 runtime 会继续归属同一个 session。
不要为了同一个已证明的事实反复执行 `open -> wait -> eval -> snapshot -> events`。

需要参数、多步骤、跨系统状态、无稳定 UI 入口，或需要反复复现并等待明确结果的动作，
再用页面声明的 action：

```bash
pnpm exec openruntime run-action --url <url> orders.refresh --payload '{"scope":"current"}'
pnpm exec openruntime wait-for business:orders:risk-panel ready --url <url> --timeout 10000
```

复杂 action 只说明“动作被执行”还不够，动作结果必须落到最小 target 的 snapshot 上，
再用 `wait-for` 等待这个 target。

Modern.js 的 route、loader、SSR、hydration 和业务 ready helper 用法见
`references/modernjs.md`。Garfish 子应用 runtime 观测和接入方式见
`references/garfish.md`。Module Federation remote、expose、shared 和
observability report 用法见 `references/module-federation.md`。只有排查对应
运行时状态时再读取这些文件。

## CLI 命令

<!-- This section is generated by scripts/sync-openruntime-cli-docs.mjs. Do not edit by hand. -->

完整 CLI 清单见 `docs/cli-reference.md`。这里仅保留 OpenRuntime skill 最常用入口。

普通验收优先选择一条最短路径：能改源码且需要反复验证时先补最小业务 target，再用 `wait-for`；不能改源码或一次性简单页面结果用 `eval` / `wait-eval`。`snapshot`、`events`、`targets` 和 `console` 主要用于定位失败原因。
- `open-runtime start [--port <port>]` - 启动或复用 CLI 管理的 Bridge；命令返回后 Bridge 会作为 CLI 托管进程常驻。
- `open-runtime open <url> [--bridge <url>] [--port <port>] [--session <id>] [--no-bridge] [--ui]` - 打开页面，默认会先准备 Bridge，并以静默浏览器模式运行；--ui 打开可见浏览器。
- `open-runtime runtimes [--bridge <url>]` - 列出连接到 Bridge 的 runtime。
- `open-runtime wait-for [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] <target-id> <status> [--where <path=value>] [--timeout <ms>] [--open] [--strict] [--next]` - 等待 target 到达指定状态；--where 的 value 会按 JSON 字面量解析，可匹配 number、boolean、null。
- `open-runtime wait-eval <script> [--timeout <ms>]` - 轮询页面表达式，直到结果为 true。
- `open-runtime eval <script>` - 在页面内执行脚本，也支持 --file <path> 读取脚本文件。
- `open-runtime console [--level <level>] [--query <keyword>] [--limit <n>]` - 读取当前页面浏览器 console 日志，支持按级别、关键词和数量过滤。
- `open-runtime targets [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--id <id>] [--type <type>] [--source <source>] [--status <status>] [--query <keyword>]` - 读取所选 runtime 注册的 target 定义。
- `open-runtime snapshot [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--id <id>] [--type <type>] [--source <source>] [--status <status>] [--query <keyword>]` - 读取当前 runtime snapshot 状态。
- `open-runtime events [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--target-id <id>] [--type <type>] [--source <source>] [--status <status>] [--action <name>] [--since <event-id>] [--limit <n>] [--query <keyword>]` - 读取 runtime event 历史。
