---
name: openruntime
description: >-
  使用、定制、评测或排查 OpenRuntime/@openruntime。OpenRuntime 是面向 Coding Agent
  的 Web 开发调试工具，可通过 openruntime/opr 复用登录状态和浏览器会话、操作页面、
  读取 Console/Network/性能/内存/代码执行和 Runtime 信息、调用扩展命令、完成修改后的
  验证，以及为团队开发 Extension、自动化脚本或 Runtime Core 接入。Use when a task
  explicitly mentions OpenRuntime, asks to use its CLI or Extensions, or needs OpenRuntime
  evidence for a real web development debugging workflow.
---

# OpenRuntime

OpenRuntime 帮助 Coding Agent 在真实、已授权、可重复的 Web 场景中复现、诊断和验证问题。
Coding Agent 负责修改代码；OpenRuntime 负责准备和复用浏览器上下文、提供调试能力并保存验证依据。

先判断用户要“使用功能”、“排查并修复”还是“定制能力”，再只读取对应流程。不要因为任务涉及
OpenRuntime 就预防性读取所有参考资料，也不要为了使用 OpenRuntime 强制给普通页面增加 Runtime 接入。

## 选择流程

### 功能使用

遇到下面任一情况，读取 `references/use-cli.md`：

- 询问 OpenRuntime 有哪些能力、命令或参数。
- 查看或准备登录状态、测试账号和当前浏览器会话。
- 调用内置命令或扩展命令完成一次查询、页面操作或专项检查。
- 读取当前页面、Console、Network、runtime、target、snapshot、event 或 action。
- 执行一次页面 action 或等待，但没有要求定位和修复故障。

普通命令失败时，先根据结构化错误修正输入、登录状态或页面上下文。只有用户要求修复故障，
或故障不修就无法完成原任务时，才切换到“排查并修复”。

### 排查并修复

用户要求使用 OpenRuntime 定位、修复或验证 Web 页面问题时，读取
`references/troubleshoot.md`。流程应尽量复用已有登录状态和页面会话，先使用与问题匹配的
浏览器证据或 Extension，再在页面已经提供有效 Runtime 信息时使用结构化状态。

普通页面没有 connected runtime 时仍可正常排查。只有浏览器表面无法稳定判断、用户明确要求接入，
或同一能力值得长期复用时，才补 Runtime Core、框架插件或业务信号。

### 定制能力

遇到下面任一情况，读取 `references/integrate.md`：

- 开发或修改 OpenRuntime Extension，包括测试账号、环境准备、专项诊断和验证命令。
- 编写管理完整浏览器流程的自动化脚本。
- 给项目接入 Runtime Core、Modern plugin、MF observability 或 Garfish 能力。
- 注册或设计 target、snapshot、event、action、waitFor 或长期业务验收信号。

没有实际故障时，不进入问题排查流程。只实现用户需要的定制类型，不顺带改造整个应用。

## 多意图任务

- 把用户的最终目标作为主流程；OpenRuntime 查询只是其中一步时，执行后立即回到主流程。
- 功能查询发现真实故障，且修复属于用户目标时，明确切换到问题排查。
- 排查过程中发现缺少登录状态时，先复用已有 Profile 或请求最小必要输入，不让用户反复登录。
- 排查过程中发现 Runtime 信息不可用时，继续使用浏览器或 Extension；只有确实需要应用内部事实时才切换到接入。
- 用户同时要求接入和排查时，以真实故障为主，接入只解决当前证据或长期复用需求。

## 共同规则

- 需要确认当前命令或扩展命令时，先运行当前环境实际可用的
  `openruntime --help`、`opr --help` 或项目内等价命令；需要参数和详细用法时，再运行
  `openruntime <command> --help`。以实际 help 为准，不根据旧文档猜测。
- 扩展命令出现在 help 的 `Extensions` 或 `External Extensions`。只在命令描述明确匹配任务时使用。
- 如果 help 显示某个命令有可用 skill，先运行 `openruntime <command> --skill` 获取路径，完整读取
  并遵循后再执行该命令。命令 skill 只约束这段子任务。
- 受保护页面优先查看当前 open context 和可用的 agent-browser Profile/state。已有正确账号、页面和会话时直接复用，
  不要求用户再次授权。缺少授权时只请求完成任务所需的最小访问条件。
- 页面已经暴露相关 target/action 时，优先使用结构化状态和声明动作；没有 Runtime 时正常使用
  页面结果、Console、Network、截图和专项 Extension，不修改应用来制造证据。
- 验证必须回到与问题一致的账号、环境和用户路径。根据问题选择最可靠的现有证据，不强制所有任务
  使用 business target 或某一个固定 verify 命令。
- 连接 Bridge、注册 target、更新 snapshot 和记录 event 只暴露事实，不得借此改变接口、路由、
  业务状态或渲染分支。
- 修改后尽量复用原来的登录状态、会话和页面上下文。只有完整流程结束或任务拥有浏览器生命周期时才 stop。
- 登录状态和调试产物可能含敏感信息，只在可信环境中保存和使用。

## 按需参考

- 普通 CLI 查询、账号、页面操作和扩展命令：`references/use-cli.md`
- 故障定位、修复和修改后验证：`references/troubleshoot.md`
- Extension、自动化脚本和 Runtime 接入：`references/integrate.md`
- `@openruntime/core` 页面侧 API：`references/core.md`
- Modern.js / EdenX 接入、route、loader：`references/modernjs.md`
- Module Federation / Vmok observability、remote、shared：`references/module-federation.md`
- Garfish 子应用生命周期和 custom loader：`references/garfish.md`
