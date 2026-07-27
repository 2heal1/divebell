# 定制和接入 OpenRuntime

只在根 `SKILL.md` 把任务分流到“接入扩展”后读取本文件。目标是让新增能力能够被 CLI
发现、查询或执行，并通过与改动相匹配的验证。

没有待修复故障时，不运行 troubleshooting 状态机，也不把“证明问题已经修好”当作完成条件。

## 1. 判断定制类型

先区分用户要增加哪一类能力：

- **Extension**：增加测试账号、环境准备、技术栈识别、专项诊断、验证命令或 Skill。
- **自动化脚本**：由脚本自己打开页面、等待、操作、查询并按需停止浏览器和 Bridge。
- **项目接入**：让页面 runtime 连接 Bridge，并暴露 Modern.js、MF 或 Garfish 状态。
- **业务能力**：增加 target、snapshot、event、action 或可等待的长期业务状态。

只实现用户需要的类型。页面外部能完成的需求优先使用 Extension；只有需要应用内部事实时才做项目或
业务接入。不要因为要增加一个外部命令，就顺带改造整个应用的运行时接入。

## 2. 项目接入

先检查项目已有的 OpenRuntime 初始化、框架配置、依赖和相邻代码。不要重复创建 runtime，
也不要同时安装多条互相竞争的接入路径。

需要判断推荐接入时，运行当前 skill 的实际路径：

```bash
node <openruntime-skill-dir>/scripts/resolve-integration.mjs <path-to-package.json>
```

根据输出继续：

- Modern.js 满足当前插件条件时，使用 `@openruntime/modern-plugin`；读取
  同目录的 `modernjs.md`。
- 较旧的 Modern.js 或普通前端项目需要页面侧能力时，使用 `@openruntime/core`；
  读取同目录的 `core.md`。
- Module Federation 项目使用 MF observability 接入；读取
  同目录的 `module-federation.md`。任务涉及 MF 时，同时遵循当前环境提供的 MF skill。
- Garfish 项目使用 Modern plugin 提供的 Garfish 能力；读取同目录的 `garfish.md`。

优先使用框架或 observability 已暴露的 hook。现有 hook 不够时，判断应该在框架、MF
observability 或 OpenRuntime SDK 中补正式能力；不要用 DOM、Console 或 Network 探测伪造
框架生命周期。

只通过源码或正式插件完成连接。不要用浏览器 `eval` 临时连接 Bridge 来冒充项目已经接入。

## 3. 设计 target、snapshot 和 event

读取同目录的 `core.md`，并遵守这些边界：

- 用 target 回答“页面里有什么可以被引用或等待”。
- 用 snapshot 回答“当前是什么状态”。
- 用 event 回答“状态和 action 是怎么变化过来的”。
- 由接入方声明 target 的 `type` 和 `statuses`，不要假设 Core 内置固定类型或状态。
- 先注册 target，再更新 snapshot；只记录证明当前事实需要的数据。
- 把 `dependsOn` 放在 snapshot 中表达当前阻塞线索。
- 不要从 DOM、Console 或 Network 反推并伪装成页面主动声明的业务事实。

只有任务目标需要稳定的业务验收信号时才增加 `business:*` target。普通框架接入、命令开发
或功能介绍不必为了满足 troubleshooting 规则补一个虚假的业务 target。

## 4. 设计 action

读取同目录的 `core.md` 中的 action 和 input options 说明：

- 只声明页面允许 Agent 执行的稳定动作。
- 明确动作风险、是否启用、输入约束和动态候选。
- 让 `runAction` 只执行动作并记录 action event，不自动把执行结果写入 snapshot。
- 需要验证动作结果时，继续使用 target 和 `waitFor`，不要把 action 返回值当作最终状态。

## 5. 开发 CLI 扩展

页面命令只操作最近一次 `openruntime open <url>` 建立的当前页面，不自己打开、跳转、关闭
或替换浏览器会话，也不自己选择 Bridge 或 Runtime。

Extension 可以提供测试账号选择、环境准备、技术栈识别、性能/内存/代码使用分析和团队验收流程。
Agent 通过 CLI 命令使用这些能力；扩展实现通过 `options.openruntime` 使用 Extension API。

如果当前仓库包含 CLI 扩展开发文档，优先读取 `docs/cli-extensions.md` 或对应中文版本。
实现时必须：

- 使用扩展入口声明 commands、hooks 和 skills，实际实现通过 `await import()` 按需加载。
- 提供准确的命令说明和示例，让 `openruntime --help` 可以发现真实用法。
- 校验当前页面是否存在、URL 是否受支持以及必要输入是否完整。
- 用统一输出表示成功、需要输入和预期错误；数据类命令不要混入进度文本。
- 页面已暴露与任务相关的稳定 target/action 时优先复用；没有 Runtime 时正常使用浏览器 API，
  不要求命令为了读取页面而先改造应用。
- 只加载可信的外部扩展。

复杂命令需要专门的多步说明、领域知识或引用资料时，最多为它提供一个本地 `SKILL.md`：

- 把命令、`SKILL.md` 和它引用的资料放在同一个命令目录中一起分发。
- 通过命令定义中的 `skill.path` 声明指向现有 `SKILL.md` 的绝对路径。
- 保证 `openruntime --help` 显示该命令有可用 skill。
- 保证 `openruntime <command> --skill` 只输出路径，不执行命令业务逻辑。
- 把 `--skill` 保留给 skill 发现，不要复用成业务参数。
- 保持命令 skill 只描述完成该命令需要的内容，不复制整个 OpenRuntime 排查流程。

默认外部扩展目录是 `~/.openruntime/extensions`。在项目内开发和测试时，优先通过
`OPENRUNTIME_EXTENSIONS_DIR` 指向受版本管理的临时目录，不要直接覆盖用户已有扩展。

## 6. 编写自动化脚本

只有流程需要自己管理完整浏览器生命周期时才编写独立自动化脚本。如果任务只操作一个已经
打开的页面，优先写页面命令。

如果当前仓库包含自动化文档，读取 `docs/cli-automation-scripts.md` 或对应中文版本。把流程拆成：

1. 接收 URL、session 和 timeout 等输入。
2. 打开页面并等待可操作状态。
3. 执行页面操作或声明 action。
4. 使用与任务匹配的 Extension、Runtime 状态或明确页面结果检查结果。
5. 输出单一、稳定的结果对象。
6. 只有脚本拥有本次浏览器生命周期时才执行 stop。

## 7. 验证完成

根据改动类型实际运行：

- 项目接入：运行 typecheck/build，启动应用，执行 `openruntime open`，确认 runtime connected，
  并读取至少一个由新增接入提供的 target 或 snapshot。
- target/action：查询刚增加的定义和状态；对 action 使用代表性输入执行，并用 target/waitFor
  验证结果。
- 页面命令：运行定义校验和相关测试，再通过 `OPENRUNTIME_EXTENSIONS_DIR` 加载命令，确认 help
  可发现，并用代表性页面执行一次成功路径和一次输入或页面错误路径。命令声明 skill 时，
  额外确认 `--skill` 返回正确绝对路径且没有执行业务逻辑。
- 自动化脚本：使用真实或有代表性的 URL 跑完整流程，检查退出码和最终输出。

只有验证发现真实故障、且用户目标包含修复时，才返回根 `SKILL.md` 并切换到
`references/troubleshoot.md`。
