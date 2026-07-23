<p align="center">
  <img src="./assets/openruntime.svg" width="120" alt="OpenRuntime" />
</p>

<h1 align="center">OpenRuntime</h1>

<p align="center">
<b>让 Coding Agent 在真实 Web 场景中自主调试和验证。</b>
<br/>
面向 Coding Agent 的 Web 开发调试工具。
</p>

---

中文 | [English](./README.md)

Agent 使用入口：[OpenRuntime Skill](./skills/openruntime/SKILL.md)

# OpenRuntime

OpenRuntime 是面向 Coding Agent 的 **Web 开发调试工具**。

它帮助 Agent 在真实、已授权、可重复的浏览器场景中完成问题复现、诊断和验证，尽量减少开发过程中需要人登录、授权、演示和确认的次数。

OpenRuntime 不替代 Coding Agent 修改代码，也不是后端调试器。它负责提供代码修改前后所需的浏览器上下文、调试能力和验证依据，让 Agent 能在代码与真实页面之间持续工作。

---

## 为什么需要 OpenRuntime

OpenRuntime 主要解决四个问题：

1. 通用浏览器工具每次都要重新识别页面、规划操作和处理等待。页面越复杂、链路越长，这种从头推理的方式就越慢。
2. 用户从网页发现问题，诊断工具却往往在 CLI 中，通常需要人提取网页信息、交给 Agent，再把 CLI 结果带回网页。OpenRuntime 让 Agent 在同一个页面和会话中完成这段串联。
3. 已经跑通的登录方式、用户路径、诊断和验收流程可以保存成 Auth Profile、脚本、Extension 或 Skill，供其他 Agent 和 CI 继续复用，形成长期积累。
4. 真实场景不只有 URL，还需要测试账号、登录状态、目标环境、准备数据和成功标准。OpenRuntime 可以提前准备并复用这些条件，让 Agent 从复现、诊断、修改一直走到复验。

这里的目标不是绕过授权，而是让授权、测试账号和可执行动作的边界能够被提前配置、重复使用和清楚检查。

## 一个真实的开发调试流程

以一个只有登录后才能访问的订单页面为例：

1. 团队提前导入测试账号的登录状态，或者用 Extension 提供测试账号和环境准备能力。
2. Agent 使用固定会话打开真实页面，复现用户操作。
3. OpenRuntime 读取页面报错、请求、页面状态、内存或代码执行情况；页面已经接入 Runtime Core 时，还可以读取应用内部状态。
4. Coding Agent 根据证据修改源码。
5. OpenRuntime 复用原来的账号、会话和页面上下文重新加载并验证结果。
6. 有长期价值的排查或验收方法可以沉淀成 Extension、自动化脚本或 Runtime Core 信号。

浏览器操作只是这条流程的基础。OpenRuntime 的重点是让 Agent 能进入真实场景、持续保留开发上下文、使用专项调试能力，并在修改后完成可重复的验证。

完整流程见 [Coding Agent 开发调试闭环](./docs/agent-devloop.zh-CN.md)。

## 核心能力

| 模块 | 职责 | 使用入口 | 是否需要页面接入 |
| --- | --- | --- | --- |
| Auth Profiles | 导出、导入和复用浏览器登录状态 | `openruntime auth` | 否 |
| Browser Session & Diagnostics | 管理页面会话，执行页面操作，读取 Console、Network、截图和代码执行情况 | OpenRuntime CLI | 否 |
| Extensions | 增加账号与环境准备、技术栈识别、专项诊断、验证命令和 Skill | CLI 命令、Extension API | 否 |
| Runtime Core | 提供应用内部状态、事件、声明动作和等待条件 | `@openruntime/core`、框架插件 | 是 |

### Auth Profiles

Auth Profile 保存已经获得授权的浏览器登录状态，不负责创建账号或绕过授权。`auth export`、`auth import`、`auth list` 和 `auth clear` 用于管理登录状态；后续 `openruntime open` 会自动复用已导入的状态。

[浏览器登录态 Profile](./docs/auth-profiles.zh-CN.md)

### Browser Session & Diagnostics

`openruntime open` 创建可复用的页面上下文，`--session` 用于标识会话。页面操作和诊断命令包括 `page-snapshot`、`click`、`fill`、`eval`、`wait-eval`、`console`、`network`、`screenshot` 和 `coverage`。

这些能力适用于普通页面，不依赖 Runtime Core。

[CLI 命令参考](./docs/cli-reference.zh-CN.md)

### Extensions

Extension 是 OpenRuntime CLI 的扩展机制，用于为 Agent 增加账号与环境准备、技术栈识别、专项诊断和可重复验证能力。一个 Extension 可以提供 CLI 命令、页面打开与识别阶段的 Hook，以及 Agent 可读取的 Skill。

[Extension 使用指南](./docs/extensions.zh-CN.md) · [CLI Extension 开发指南](./docs/cli-extensions.zh-CN.md) · [Extension API 参考](./docs/extension-api.zh-CN.md)

### 官方扩展

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

Runtime Core 是可选的页面侧 API，用于注册 Target、更新 Snapshot、记录 Event、声明 Action 和执行 `waitFor`。它只在需要应用内部事实或稳定业务信号时接入，不是使用 OpenRuntime CLI、Auth Profiles 或 Extensions 的前置条件。

[Runtime Core API](./docs/runtime-core-api.zh-CN.md)

完整浏览器流程需要由脚本管理时，见 [使用 OpenRuntime CLI 编写自动化脚本](./docs/cli-automation-scripts.zh-CN.md)。

## 专项调试场景

- [内存分析](./docs/memory-analysis.zh-CN.md)：用真实页面操作判断内存、DOM 节点和监听器是否持续增长。
- [分块与代码使用分析](./docs/code-usage-analysis.zh-CN.md)：把浏览器中的代码执行情况还原到分块、源码文件和依赖包。
- [录制浏览器操作并生成脚本](./docs/record-browser-workflows.zh-CN.md)：把一次人工演示转换成可继续检查和验证的脚本草稿。
- [浏览器连接与多 Runtime](./docs/runtime-connections.zh-CN.md)：在微前端页面中复用会话并选择正确的 Runtime。

## 发版流程

普通功能和修复合并请求不会发布 OpenRuntime。维护者需要手动启动发版准备流程，检查自动创建的发版合并请求，并在 CI 通过后合入。合入后，所有公开包会使用同一个版本发布，同时创建对应的 GitHub Release。

准备、发布、失败重试、本地检查以及临时 OpenRuntime 版 `agent-browser` 的说明见 [OpenRuntime 发版流程](./docs/release.zh-CN.md)。

## 组成

```text
                  Coding Agent
                       │
                修改代码与制定计划
                       │
                       ▼
                OpenRuntime CLI
      ┌──────────────────────────────────┐
      │ 登录状态与持续会话               │
      │ 页面操作、Console、Network       │
      │ 性能、内存、代码执行与调试产物   │
      │ Extensions 与可重复验证          │
      └──────────────────────────────────┘
                       │
                真实浏览器与页面
                       │
             可选的 Runtime Core API
      ┌──────────────────────────────────┐
      │ Target / Snapshot / Event        │
      │ Action / waitFor                 │
      └──────────────────────────────────┘
```

## 文档

- [Coding Agent 开发调试闭环](./docs/agent-devloop.zh-CN.md)
- [CLI 命令参考](./docs/cli-reference.zh-CN.md)
- [浏览器登录态 Profile](./docs/auth-profiles.zh-CN.md)
- [Extension 使用指南](./docs/extensions.zh-CN.md)
- [CLI Extension 开发指南](./docs/cli-extensions.zh-CN.md)
- [Extension API 参考](./docs/extension-api.zh-CN.md)
- [Runtime Core API](./docs/runtime-core-api.zh-CN.md)
- [自动化脚本](./docs/cli-automation-scripts.zh-CN.md)
- [发版流程](./docs/release.zh-CN.md)

Extensions 会执行本机代码，只安装和加载可信内容。登录状态文件包含敏感信息，应只保存在可信环境中。
