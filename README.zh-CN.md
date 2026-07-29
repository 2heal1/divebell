<p align="center">
  <img src="./assets/divebell.png" width="160" alt="Divebell" />
</p>

<h1 align="center">Divebell</h1>

<p align="center">
<b>Go below the surface.</b>
<br/>
面向 Coding Agent 的可扩展工具包，用于调试、理解和验证真实 Web 应用。
</p>

---

中文 | [English](./README.md)

Agent 使用入口：[Divebell Skill](./skills/divebell/SKILL.md)

# Divebell

Divebell 是面向 Coding Agent 的**可扩展工具包，用于调试、理解和验证真实 Web 应用**。

Divebell 将 Web 页面作为 Coding Agent 的工作入口，将页面上下文、浏览器能力和团队已有的开发调试工具连接起来，让 Agent 可以直接在真实 Web 场景中完成问题复现、诊断和验证。

Agent 可以基于当前页面调用已有的 SDK、OpenAPI、CLI 和诊断能力，不再需要人先提取页面信息，再帮助它串联不同工具。

Coding Agent 负责阅读和修改代码；Divebell 负责准备可复用的浏览器上下文，并把页面操作、浏览器诊断和结果验证封装成可以直接调用的能力。团队可以通过 Extension 接入自己的账号、环境、内部平台、专项诊断和验证流程。

---

## Quick Start

先全局安装一次 Divebell CLI：

```bash
npm install --global @divebell/cli
divebell check --fix
divebell --help
```

直接体验 Module Federation Playground remote，不需要克隆仓库、获取源码或安装浏览器扩展：

[打开 Module Federation Playground](https://module-federation.io/playground/index.html) ·
[查看 Agent 引导流程](./docs/quick-start.zh-CN.md)

安装 CLI 和 [Divebell Skill](./skills/divebell/SKILL.md) 后，对 Agent 说：

```text
使用 Divebell 完成官方 Quick Start：打开 Module Federation Playground，
用故意错误的 props 加载 Divebell remote，读取 Playground Terminal 报错，
把 props 改成要求的 config，并确认页面渲染出可交互的诊断小游戏。
```

## 为什么需要 Divebell

Coding Agent 已经可以阅读和修改代码，也可以调用各种开发工具。但真实 Web 开发中的问题通常发生在页面场景中：用户看到的是一个页面，而定位问题需要结合页面状态、运行环境、业务上下文以及团队已有的诊断能力。

这些信息和能力通常分散在不同地方：

- 页面中的用户操作和运行状态
- 浏览器提供的 Console、Network 等调试信息
- 团队已有的 SDK、OpenAPI、CLI 和内部平台

Agent 往往还需要人帮助它理解当前页面代表什么，以及接下来应该调用哪些能力。

Divebell 将 Web 页面作为 Agent 的工作入口，连接页面上下文、浏览器诊断能力和团队已有工具，让 Agent 可以直接在真实场景中完成问题复现、诊断和验证。

团队可以通过 Extension 将已有能力接入当前页面场景，而不需要重新建设一套 Agent 工具体系。已经跑通的方法可以继续交给其他 Agent 和 CI 使用，形成长期积累。

## 核心能力

| 模块 | 职责 | 使用入口 | 是否需要页面接入 |
| --- | --- | --- | --- |
| Web Context & Diagnostics | 将真实 Web 页面作为 Agent 工作入口，提供页面上下文、浏览器诊断和同场景验证 | Divebell CLI | 否 |
| Extensions | 连接 Web 页面和团队已有的开发调试能力 | CLI 命令、Extension API | 否 |
| Runtime SDK | 暴露浏览器信息无法稳定表达的应用内部事实 | `@divebell/core`、框架插件 | 是 |

### Web Context & Diagnostics

Divebell 将真实 Web 页面作为 Agent 的工作入口，提供页面上下文、页面操作、浏览器诊断以及修改后的同场景验证能力。

这些能力包括当前页面和用户路径，`click`、`fill`、`eval` 等页面操作，以及 Console、Network、Screenshot 和 Coverage 等诊断信息。Agent 可以通过 Divebell CLI 直接调用，不依赖 Runtime SDK。

[CLI 命令参考](./docs/cli-reference.zh-CN.md)

对于需要登录的页面，Divebell 可以复用已有的 Chrome Profile、浏览器状态或用户明确提供的加密登录凭据，在原有权限范围内完成调试和验证。

[浏览器登录与状态复用](./docs/browser-auth.zh-CN.md)

完整浏览器流程需要由脚本管理时，见 [使用 Divebell CLI 编写自动化脚本](./docs/cli-automation-scripts.zh-CN.md)。

### Extensions

Extension 是连接 Web 页面和团队已有开发能力的扩展机制。

它可以根据当前页面识别应用、环境和资源，调用已有的 SDK、OpenAPI、CLI 或内部平台，将原本需要人工串联的诊断和验证流程提供给 Agent。

[Extension 使用指南](./docs/extensions.zh-CN.md) · [CLI Extension 开发指南](./docs/cli-extensions.zh-CN.md) · [Extension API 参考](./docs/extension-api.zh-CN.md)

#### 官方扩展

专项能力以可选包发布，需要时再单独安装。CLI Extension 在页面外增加命令；框架接入运行在应用内部，暴露框架本来就知道的事实：

| 扩展包 | 入口 | 用途 | 指南 |
| --- | --- | --- | --- |
| `@divebell/extension-memory` | `divebell memory` | 重复真实页面流程，检查内存、DOM 节点和监听器是否持续增长。 | [内存分析](./docs/memory-analysis.zh-CN.md) |
| `@divebell/extension-code-usage` | `divebell code-usage` | 把页面中的代码执行情况还原到分块、源码文件和依赖包。 | [代码使用分析](./docs/code-usage-analysis.zh-CN.md) |
| `@divebell/extension-imitate` | `divebell record` | 录制一次浏览器操作并生成可执行、可验证的 JavaScript 回放。 | [录制浏览器操作](./docs/record-browser-workflows.zh-CN.md) |
| `@divebell/extension-troubleshooting` | `divebell verify` | 验证页面声明的业务目标是否到达预期结果。 | [Runtime SDK API](./docs/runtime-sdk-api.zh-CN.md) |
| `@divebell/modern-plugin` | Modern.js runtime plugin（WIP） | 规划中的框架状态接入。在包含所需生命周期 hook 的 Modern.js 新版本发布前，请勿正式接入。 | [Modern.js 接入](./docs/modernjs-integration.zh-CN.md) |
| `@module-federation/observability-plugin` | Module Federation runtime plugin | 通过 MF observability 记录 consumer、remote、manifest、remoteEntry、expose、shared 依赖和运行时错误证据。 | [Module Federation 可观测接入](./docs/module-federation-observability.zh-CN.md) |

安装 CLI Extension：

```bash
divebell extensions add @divebell/extension-memory
```

安装后的扩展命令会出现在 `divebell --help` 中，并复用同一个 CLI、浏览器会话和登录状态。框架接入包是应用依赖，需要在对应框架中配置，本身不会增加一条 CLI 命令。

### Runtime SDK

Runtime SDK 是可选的页面侧 API。当页面 DOM、Console、Network 等浏览器信息无法稳定表达应用状态时，Runtime SDK 可以向 Agent 暴露更细粒度的应用内部事实。

它支持注册 Target、更新 Snapshot、记录 Event、声明 Action 和执行 `waitFor`。没有 Runtime SDK 也可以使用 Divebell，普通页面不需要接入。

[Runtime SDK API](./docs/runtime-sdk-api.zh-CN.md)

## Examples

下面的例子按照用户可以完成的结果组织。可以先选择与当前任务最接近的例子体验完整流程，再查看背后的命令和接入方式。

### 直接体验

#### [完成 Module Federation Playground Quick Start](./docs/quick-start.zh-CN.md)

在公开的 Module Federation Playground 中加载已发布的 remote，从浏览器证据定位运行时
props 报错，修复 props，并确认 Divebell 诊断小游戏正常渲染，全程不需要克隆源码仓库。

#### [录制一次真实操作并生成可重复脚本](./docs/record-browser-workflows.zh-CN.md)

在可见浏览器中演示一次流程，让 Agent 根据操作元素和事件顺序生成、运行并验证 JavaScript 回放；语音说明是可选项。

> [下载并安装录制 Extension](./docs/record-browser-workflows.zh-CN.md#安装)，然后让 Agent 执行 `divebell record --skill`，并按返回的 skill 开始录制。

**演示视频**

https://github.com/user-attachments/assets/45669f30-0c10-4a04-9926-5b796c4be946

#### [检查真实页面流程中的内存增长](./docs/memory-analysis.zh-CN.md)

重复同一段用户操作，判断 JavaScript 内存、DOM 节点和事件监听器是否持续增长。

#### [分析页面加载和实际执行的代码](./docs/code-usage-analysis.zh-CN.md)

对比首屏与后续操作，查看分块、源码文件和依赖包的加载与执行情况。

### 接入参考

#### [让 Agent 读取应用状态并执行页面声明的动作](./demos/bridge-readonly/README.md)

运行一个订单页面，读取状态和事件，执行页面允许的刷新动作并等待最终结果。

#### [把团队已有工具接到当前页面](./demos/cli-extension/README.md)

创建一个本地 Extension，读取当前页面并参与页面打开、技术栈识别和关闭流程。

## 参与贡献

请阅读 [贡献指南](./CONTRIBUTING.zh-CN.md) 来共同参与 Divebell 的建设。

## Credits

Divebell 使用 [agent-browser](https://github.com/vercel-labs/agent-browser) 作为默认的浏览器执行能力。感谢 agent-browser 的作者和贡献者。

Extensions 会执行本机代码，只安装和加载可信内容。登录状态文件包含敏感信息，应只保存在可信环境中。

## 许可证

Divebell 基于 [MIT 许可证](./LICENSE) 发布。
