# Coding Agent 开发调试闭环

English version: [Coding Agent Development Debugging Loop](agent-devloop.md)

Divebell 用来帮助 Coding Agent 在真实 Web 场景中完成问题复现、诊断和验证。Coding Agent 负责阅读和修改代码；Divebell 负责准备可复用的浏览器上下文，并把页面操作、浏览器诊断和结果验证封装成 Agent 可以像调用普通开发工具一样直接使用的能力。团队还可以通过 Extension 将领域知识和已有服务接入这条开发闭环。

团队可以通过 Extension 从当前页面识别开发上下文，调用已有的 SDK、OpenAPI、CLI 或内部平台。

这条闭环的目标是减少人的中途介入。它不是绕过授权，而是让团队提前准备测试账号、登录状态、可访问环境和允许执行的动作，让 Agent 在明确边界内持续工作。

## 完整流程

```text
准备账号与环境
      ↓
打开真实页面并保持会话
      ↓
识别应用、环境和相关资源
      ↓
调用已有服务并收集证据
      ↓
Coding Agent 修改代码
      ↓
复用原会话重新验证
      ↓
沉淀值得复用的调试能力
```

## 1. 准备访问条件

受保护页面不应每次都要求人重新登录。团队可以直接复用测试账号的 Chrome Profile，或载入准备好的 agent-browser state：

```sh
divebell open https://example.com/orders --profile "Test Account" --ui
# 或
divebell open https://example.com/orders --state /path/to/test-account.json --ui
```

后续 `divebell open` 会自动恢复同一项目的浏览器状态。需要生成可迁移文件或只保留一个网址时，使用 `state save`；具体账号和权限仍应在目标页面中确认。

如果团队需要动态选择测试账号、切换环境、获取临时凭证或执行内部准备步骤，可以把它们封装成 Extension。Extension 应只提供授权范围内的账号和环境，不应绕过权限检查或输出敏感值。

详细用法见 [浏览器登录与状态复用](browser-auth.zh-CN.md)。

## 2. 打开真实页面并保持上下文

使用固定 `session` 打开目标页面：

```sh
divebell open https://example.com/orders --session orders-debug --ui
```

后续页面命令和 Extension 会默认复用**当前工作目录**最近一次打开的页面、会话和登录状态。除非任务拥有完整浏览器生命周期，否则不要在中间步骤随意 `stop`，避免丢失仍有价值的页面上下文。

Divebell 能调试没有接入 Runtime Core 的普通页面。页面没有 connected runtime 时，继续使用浏览器侧能力，不要为了开始排查而先修改应用。

## 3. 发现可用能力

先查看当前 CLI 和已安装的 Extensions：

```sh
divebell --help
divebell extensions list
divebell stack
```

`stack` 由 Extensions 提供技术栈识别。识别结果可以推荐更适合当前项目的专项 Extension。只有命令描述和当前问题匹配时才使用，避免无目的地运行所有诊断。

团队常见的 Extension 可以包括：

- 测试账号和环境准备
- 从当前页面识别应用、环境、部署和其他领域资源
- 调用已有 SDK、OpenAPI、CLI 或内部平台
- 框架或微前端状态检查
- 页面性能、内存和代码使用分析
- 业务专项诊断和验收
- 复杂命令对应的 Agent Skill

## 4. 复现并诊断

先选择与问题最直接相关的证据：

```sh
divebell page-snapshot
divebell console --level error
divebell network --url /api/orders
divebell screenshot orders-error --full-page
```

页面性能、内存或代码执行问题应优先使用对应 Extension，让 Extension 负责采集、计算、报告和清理。例如内存检查可以重复同一段真实操作，比较清理后的内存、DOM 节点和监听器趋势，而不是只看某一个瞬间的数值。

如果页面已经接入 Runtime Core，可以补充读取：

```sh
divebell snapshot --session orders-debug
divebell events --session orders-debug --limit 30
```

Runtime 信息是可选的深层证据。它有用时优先使用；没有接入或没有相关信号时，立即回到页面、Console、Network 或专项 Extension，不要反复查询空的 Runtime。

诊断完成时，应能把问题收敛到具体源码、配置、依赖、请求或运行状态，而不是只记录“页面不正常”。

## 5. 修改代码

Coding Agent 根据诊断证据修改源码。Divebell 不负责替代代码编辑，但应保留打开的页面、登录状态和诊断产物，供修改后的复验使用。

如果改动影响构建配置、依赖解析、开发服务器或页面初始化，重新启动目标应用。只有普通页面代码变化且开发服务器能够正确热更新时，才直接复用现有服务。

## 6. 使用同一场景复验

复验应回到与问题相同的账号、环境、入口和用户路径。不要因为修改后首页能打开，就宣称受保护的订单流程已经修复。

按下面顺序选择验证依据：

1. 当前任务已有的专项 Extension 检查，例如内存增长、代码使用或框架诊断。
2. 页面已经提供的 Runtime Target、Snapshot 和 `waitFor`。
3. 明确的页面结果、请求结果和无错误条件。
4. 截图作为视觉确认或留档，不单独替代需要交互或状态判断的验收。

普通页面不需要为了最终验证强制增加 Runtime Core 接入。只有下面情况才值得补稳定的 Target 或 Action：

- 页面表面很难可靠判断真实业务状态。
- 同一结果会被多个 Agent、脚本或 CI 长期验证。
- 团队需要明确等待异步业务流程，而不是依赖固定延时。
- 动作需要声明输入、风险和允许范围。

验证失败时，保留同一会话回到诊断阶段；验证通过后停止重复取证。

## 7. 沉淀有价值的流程

一次性问题不需要留下额外接入。对团队长期有价值的能力再选择合适形式：

| 需求 | 建议形式 |
| --- | --- |
| 从当前页面识别领域资源并调用已有服务 | Extension 命令或 Hook |
| 操作当前已打开页面并输出诊断结果 | Extension 命令 |
| 准备账号、环境或页面初始化条件 | Extension Hook 或命令 |
| 管理完整浏览器生命周期并重复用户路径 | 自动化脚本 |
| 暴露页面内部状态、事件和允许动作 | Runtime Core API |
| 说明复杂命令的使用和判断方法 | Extension 附带的 Skill |

不要为了展示 Divebell 而给每个页面增加 Target，也不要把一次性的浏览器命令都包装成 Extension。只有能减少未来人工介入或提高稳定性的内容才值得沉淀。

## 完成标准

一次开发调试任务完成时应满足：

- 使用了与真实问题一致的账号、环境和用户路径。
- 诊断证据能解释为什么要修改这些代码。
- 修改后的应用已经在真实浏览器中重新运行。
- 验证依据与问题类型匹配，而不是只看页面是否能打开。
- 没有为了使用 Divebell 增加与任务无关的应用接入。
- 敏感登录状态和调试产物仍保存在可信环境中。
