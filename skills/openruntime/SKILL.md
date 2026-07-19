---
name: openruntime
description: >-
  使用、接入、评测或排查 OpenRuntime/@openruntime，包括通过 openruntime/opr
  内置命令或扩展命令查询信息、操作当前页面、读取 target/action/snapshot/event、
  编写自动化或页面命令，以及为 Modern.js、Garfish、Vmok、Module Federation 和
  普通前端项目补运行时接入、定位故障并完成业务验收。Use when a task explicitly
  mentions OpenRuntime, asks what its CLI can do, asks to run an OpenRuntime subcommand
  and then resume another workflow, or needs structured runtime evidence for frontend behavior.
---

# OpenRuntime

OpenRuntime 让页面主动暴露运行时事实和声明动作。先判断用户要“使用功能”、
“排查问题”还是“接入扩展”，再只读取对应流程。不要让一次普通命令调用自动进入
完整排查，也不要因为任务涉及 OpenRuntime 就预防性加载所有参考资料。

## 选择流程

### 功能使用

遇到下面任一情况，读取 `references/use-cli.md`：

- 询问 OpenRuntime 有哪些能力、命令或参数。
- 要求运行内置命令或扩展命令查询信息，然后返回原来的主流程。
- 读取当前页面、runtime、target、snapshot、event、action 或账号状态。
- 执行一次页面 action、页面操作或等待，但没有要求定位和修复故障。

普通命令失败时，先根据结构化错误修正输入或页面上下文。只有用户要求修复故障，
或故障不修就无法完成原任务时，才切换到“问题排查”。

### 问题排查

用户要求定位、修复或验证页面故障，并明确使用 OpenRuntime 或需要结构化运行时证据时，
读取 `references/troubleshoot.md`。这个流程保留当前完整要求：检查连接、按项目类型补最小
接入、获取证据、修改源码、补或复用 `business:*` target，并通过 workflow 最终验收。

不要因为项目安装了 OpenRuntime、Modern.js、Garfish、Vmok 或 Module Federation 就自动
进入排查；必须存在待定位、待修复或待验证的问题。

### 接入扩展

遇到下面任一情况，读取 `references/integrate.md`：

- 给项目接入 OpenRuntime、Modern plugin、MF observability 或 Garfish 能力。
- 注册或设计 target、snapshot、event、action、waitFor 或业务验收信号。
- 开发、修改或说明 OpenRuntime 外部命令和自动化脚本。

没有实际故障时，不进入问题排查状态机，也不强制补一个用于“证明修复”的 business target。
接入任务应验证新增能力本身可以被发现和使用。

## 多意图任务

- 把用户的最终目标作为主流程；OpenRuntime 查询只是其中一步时，执行后立即回到主流程。
- 功能查询发现真实故障，且修复属于用户目标时，明确切换到问题排查并从连接检查开始。
- 排查过程中发现缺少接入时，继续留在问题排查流程，按其中的 `CONNECTED` 要求补最小接入；
  不要跳出排查流程另起一套验收标准。
- 用户同时要求接入和排查时，以问题排查为主，接入只是达到 connected 的必要步骤。

## 共同规则

- 需要确认当前命令、参数、示例或扩展命令时，运行当前环境实际可用的
  `openruntime --help`、`opr --help` 或项目内等价命令。扩展命令以 help 中的
  `External Commands` 描述为准，不根据命令名、文件名或旧文档猜测用法。
- `verify` 不在 help 中时，先运行
  `openruntime commands add @openruntime/command-trobule-shooting`，再进入最终业务验收。
- 如果 help 显示某个命令有可用 skill，先运行 `openruntime <command> --skill` 获取其
  `SKILL.md` 路径，完整读取并遵循后再执行该命令。命令 skill 只约束这段子任务；完成后
  继续根 `SKILL.md` 选定的主流程。
- 页面已经暴露稳定 target/action 时，优先使用结构化状态和声明动作；普通页面交互、
  Console、Network 和截图用于页面操作或兜底定位。
- 连接 Bridge、注册 target、更新 snapshot 和记录 event 只暴露事实，不得借此改变接口、
  路由、业务状态或渲染分支。
- 如果只是普通浏览器自动化，用户没有要求 OpenRuntime，项目也没有 OpenRuntime 上下文，
  不要因为本 skill 改变原本工具选择。

## 按需参考

只在对应流程明确需要时读取：

- 普通 CLI 查询、动作和扩展命令：`references/use-cli.md`
- 故障定位、修复和最终业务验收：`references/troubleshoot.md`
- 项目接入、target/action 设计、命令和脚本开发：`references/integrate.md`
- `@openruntime/core` 页面侧 API：`references/core.md`
- Modern.js / EdenX 接入、route、loader：`references/modernjs.md`
- Module Federation / Vmok observability、remote、shared：`references/module-federation.md`
- Garfish 子应用生命周期和 custom loader：`references/garfish.md`
