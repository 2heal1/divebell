<p align="center">
  <img src="./assets/openruntime.svg" width="120" alt="OpenRuntime" />
</p>

<h1 align="center">OpenRuntime</h1>

<p align="center">
<b>帮助 Coding Agent 在真实 Web 场景中完成问题复现、诊断和验证。</b>
<br/>
面向 Coding Agent 的 Web 开发调试工具。
</p>

---

中文 | [English](./README.md)

Agent 使用入口：[OpenRuntime Skill](./skills/openruntime/SKILL.md)

# OpenRuntime

OpenRuntime 是面向 Coding Agent 的 **Web 开发调试工具**。

OpenRuntime 将 Web 页面作为 Coding Agent 的工作入口，将页面上下文、浏览器能力和团队已有的开发调试工具连接起来，让 Agent 可以直接在真实 Web 场景中完成问题复现、诊断和验证。

Agent 可以基于当前页面调用已有的 SDK、OpenAPI、CLI 和诊断能力，不再需要人先提取页面信息，再帮助它串联不同工具。

Coding Agent 负责阅读和修改代码；OpenRuntime 负责准备可复用的浏览器上下文，并把页面操作、浏览器诊断和结果验证封装成可以直接调用的能力。团队可以通过 Extension 接入自己的账号、环境、内部平台、专项诊断和验证流程。

---

## 为什么需要 OpenRuntime

Coding Agent 已经可以阅读和修改代码，也可以调用各种开发工具。但真实 Web 开发中的问题通常发生在页面场景中：用户看到的是一个页面，而定位问题需要结合页面状态、运行环境、业务上下文以及团队已有的诊断能力。

这些信息和能力通常分散在不同地方：

- 页面中的用户操作和运行状态
- 浏览器提供的 Console、Network 等调试信息
- 团队已有的 SDK、OpenAPI、CLI 和内部平台

Agent 往往还需要人帮助它理解当前页面代表什么，以及接下来应该调用哪些能力。

OpenRuntime 将 Web 页面作为 Agent 的工作入口，连接页面上下文、浏览器诊断能力和团队已有工具，让 Agent 可以直接在真实场景中完成问题复现、诊断和验证。

团队可以通过 Extension 将已有能力接入当前页面场景，而不需要重新建设一套 Agent 工具体系。已经跑通的方法可以继续交给其他 Agent 和 CI 使用，形成长期积累。

## OpenRuntime 改变了什么

<p align="center">
  <img src="./assets/openruntime-workflow.zh-CN.svg" width="900" alt="OpenRuntime 工作流" />
</p>

OpenRuntime 降低了 Web 页面和 Agent 能力之间的连接成本，用户不再需要充当页面、开发工具和 Agent 之间的上下文搬运者。

## 一个真实的 Web 问题调试流程

以用户反馈“点击提交后页面报错”为例：

1. Agent 打开真实 Web 页面，进入对应的用户操作路径并复现问题。
2. OpenRuntime 获取页面上下文、Console、Network、截图和运行状态等诊断信息。
3. 如果需要业务信息，Extension 根据当前页面连接已有的 SDK、OpenAPI、CLI 或内部平台。
4. Coding Agent 根据诊断结果修改源码。
5. OpenRuntime 回到相同页面场景验证修改结果。

OpenRuntime 的核心不是让 Agent 学会操作浏览器，而是让 Web 页面成为 Agent 可以直接工作的场景入口。

完整流程见 [Coding Agent 开发调试闭环](./docs/agent-devloop.zh-CN.md)。

## 核心能力

| 模块 | 职责 | 使用入口 | 是否需要页面接入 |
| --- | --- | --- | --- |
| Web Context & Diagnostics | 将真实 Web 页面作为 Agent 工作入口，提供页面上下文、浏览器诊断和同场景验证 | OpenRuntime CLI | 否 |
| Extensions | 连接 Web 页面和团队已有的开发调试能力 | CLI 命令、Extension API | 否 |
| Runtime Core | 暴露浏览器信息无法稳定表达的应用内部事实 | `@openruntime/core`、框架插件 | 是 |

### Web Context & Diagnostics

OpenRuntime 将真实 Web 页面作为 Agent 的工作入口，提供页面上下文、页面操作、浏览器诊断以及修改后的同场景验证能力。

这些能力包括当前页面和用户路径，`click`、`fill`、`eval` 等页面操作，以及 Console、Network、Screenshot 和 Coverage 等诊断信息。Agent 可以通过 OpenRuntime CLI 直接调用，不依赖 Runtime Core。

[CLI 命令参考](./docs/cli-reference.zh-CN.md)

完整浏览器流程需要由脚本管理时，见 [使用 OpenRuntime CLI 编写自动化脚本](./docs/cli-automation-scripts.zh-CN.md)。

### Extensions

Extension 是连接 Web 页面和团队已有开发能力的扩展机制。

它可以根据当前页面识别应用、环境和资源，调用已有的 SDK、OpenAPI、CLI 或内部平台，将原本需要人工串联的诊断和验证流程提供给 Agent。

[Extension 使用指南](./docs/extensions.zh-CN.md) · [CLI Extension 开发指南](./docs/cli-extensions.zh-CN.md) · [Extension API 参考](./docs/extension-api.zh-CN.md)

#### 官方扩展

专项能力以可选扩展包发布，需要时再单独安装：

| 扩展包 | 命令 | 用途 | 指南 |
| --- | --- | --- | --- |
| `@openruntime/extension-memory` | `openruntime memory` | 重复真实页面流程，检查内存、DOM 节点和监听器是否持续增长。 | [内存分析](./docs/memory-analysis.zh-CN.md) |
| `@openruntime/extension-code-usage` | `openruntime code-usage` | 把页面中的代码执行情况还原到分块、源码文件和依赖包。 | [代码使用分析](./docs/code-usage-analysis.zh-CN.md) |
| `@openruntime/extension-imitate` | `openruntime record` | 录制一次浏览器操作并生成可以继续检查的脚本草稿。 | [录制浏览器操作](./docs/record-browser-workflows.zh-CN.md) |
| `@openruntime/extension-troubleshooting` | `openruntime verify` | 验证页面声明的业务目标是否到达预期结果。 | [Runtime Core API](./docs/runtime-core-api.zh-CN.md) |

安装扩展：

```bash
openruntime extensions add @openruntime/extension-memory
```

安装后的扩展命令会出现在 `openruntime --help` 中，并复用同一个 CLI、浏览器会话和登录状态。

### Runtime Core

Runtime Core 是可选的页面侧 API。当页面 DOM、Console、Network 等浏览器信息无法稳定表达应用状态时，Runtime Core 可以向 Agent 暴露更细粒度的应用内部事实。

它支持注册 Target、更新 Snapshot、记录 Event、声明 Action 和执行 `waitFor`。没有 Runtime Core 也可以使用 OpenRuntime，普通页面不需要接入。

[Runtime Core API](./docs/runtime-core-api.zh-CN.md)

## 环境准备

### 浏览器授权

OpenRuntime 可以复用已有的 Chrome Profile 或浏览器状态，也可以使用用户明确提供的加密登录凭据，帮助 Agent 进入真实 Web 环境。这些能力不会绕过授权。

[浏览器登录与状态复用](./docs/browser-auth.zh-CN.md)

## 专项调试场景

- [内存分析](./docs/memory-analysis.zh-CN.md)：用真实页面操作判断内存、DOM 节点和监听器是否持续增长。
- [分块与代码使用分析](./docs/code-usage-analysis.zh-CN.md)：把浏览器中的代码执行情况还原到分块、源码文件和依赖包。
- [录制浏览器操作并生成脚本](./docs/record-browser-workflows.zh-CN.md)：把一次人工演示转换成可继续检查和验证的脚本草稿。
- [浏览器连接与多 Runtime](./docs/runtime-connections.zh-CN.md)：在微前端页面中复用会话并选择正确的 Runtime。

## 组成

```text
                  Coding Agent
                       │
                       ▼
                  OpenRuntime
       ┌──────────────────────────────────┐
       │ Web 页面：Agent 的工作入口       │
       │                                  │
       │ 页面上下文、浏览器操作与诊断     │
       │ 修改前后的结果验证               │
       │                                  │
       │ Extensions                       │
       │ 连接团队已有 SDK / API / CLI     │
       │ 和内部平台                       │
       │                                  │
       │ Runtime Core                     │
       │ 获取应用内部事实                 │
       └──────────────────────────────────┘
```

## 文档

- [Coding Agent 开发调试闭环](./docs/agent-devloop.zh-CN.md)
- [CLI 命令参考](./docs/cli-reference.zh-CN.md)
- [浏览器登录与状态复用](./docs/browser-auth.zh-CN.md)
- [Extension 使用指南](./docs/extensions.zh-CN.md)
- [CLI Extension 开发指南](./docs/cli-extensions.zh-CN.md)
- [Extension API 参考](./docs/extension-api.zh-CN.md)
- [Runtime Core API](./docs/runtime-core-api.zh-CN.md)
- [自动化脚本](./docs/cli-automation-scripts.zh-CN.md)
- [发版流程](./docs/release.zh-CN.md)

## 参与贡献

请阅读 [贡献指南](./CONTRIBUTING.zh-CN.md) 来共同参与 OpenRuntime 的建设。

## Credits

OpenRuntime 使用 [agent-browser](https://github.com/vercel-labs/agent-browser) 作为默认的浏览器执行能力。感谢 agent-browser 的作者和贡献者。

Extensions 会执行本机代码，只安装和加载可信内容。登录状态文件包含敏感信息，应只保存在可信环境中。

## 许可证

OpenRuntime 基于 [MIT 许可证](./LICENSE) 发布。
