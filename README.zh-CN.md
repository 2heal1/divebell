<p align="center">
  <img src="./assets/openruntime.svg" width="120" alt="OpenRuntime" />
</p>

<h1 align="center">OpenRuntime</h1>

<p align="center">
<b>Expose your application's runtime to AI Agents.</b>
<br/>
Runtime API for AI-powered development.
</p>

---

中文 | [English](./README.md)

Agent 使用入口：[OpenRuntime Skill](./skills/openruntime/SKILL.md)

# OpenRuntime

OpenRuntime 是一套面向 Agent 的前端 **Runtime API**。

它定义了一组统一的运行时接口，让应用能够把自己的运行状态、关键事件以及可执行动作，以结构化方式开放给 Agent，而不是让 Agent 只能依赖 DOM、截图、Console 或 Network 去猜测页面当前发生了什么。

OpenRuntime 定义了五类核心 Runtime API：

- **Target** —— 声明页面里有哪些对象可以被引用、等待或观测
- **Snapshot** —— 读取页面当前运行状态
- **Event** —— 读取运行过程中的关键事件
- **Action** —— 声明页面允许 Agent 调用的业务动作
- **waitFor** —— 等待指定 Target 到达目标状态

这些 API 组成了一套统一的 Runtime 协议。

无论页面使用 React、Modern.js、Module Federation、Garfish，还是普通前端项目，都可以通过 OpenRuntime 暴露自己的运行时语义，让不同 Agent 使用同一套 API 完成验证、调试和自动化。

---

## Why OpenRuntime

今天，大多数 AI Coding Agent 已经能够：

- 修改代码
- 启动项目
- 打开浏览器
- 操作页面

但在验证页面是否真正修复时，它们仍然主要依赖：

- DOM
- Screenshot
- Console
- Network
- Browser Automation

这些信息只能反映页面表现，却很难回答真正重要的问题：

- 页面现在真正处于什么状态？
- 哪一步没有完成？
- 哪个模块阻塞了页面？
- 哪些动作允许 Agent 执行？
- Agent 应该等待什么，而不是不断轮询页面？

因此，大量验证过程仍然建立在"猜测"之上。

OpenRuntime 希望把这些业务语义直接开放出来，让 Agent 可以依据 Runtime，而不是依据页面外观做判断。

---

## Runtime API + Browser Control

Runtime API 是 OpenRuntime 的核心能力。

除此之外，OpenRuntime 还提供 CLI 与本地 Bridge，让 Agent 可以直接访问这些 Runtime API。

CLI 同时提供浏览器控制能力，包括：

- 打开页面
- 页面跳转
- 点击
- 输入
- 截图
- 查看 Network
- 查看 Console
- 导入和导出浏览器登录状态

浏览器能力负责进入页面和收集外部信息。

Runtime API 则负责提供页面内部真实的运行状态。

对于 Agent，更推荐优先读取 Runtime API，再结合浏览器能力完成验证，而不是完全依赖浏览器自动化。

浏览器登录态的导出、导入、查看和清理用法见 [浏览器登录态 Profile](docs/auth-profiles.zh-CN.md)。英文文档见 [Browser Auth Profiles](docs/auth-profiles.md)。

---

## 录制浏览器流程

OpenRuntime 提供了一个可以安装到 Agent 的 skill，用来把一次人工浏览器演示转换成可重复运行的 JavaScript 脚本草稿。

skill 会打开可见浏览器。用户可以正常跳转页面、点击、输入，并通过语音补充最终想要的结果。用户说“结束”后，Agent 会关闭浏览器，把操作过程、页面状态和语音时间对应起来，再生成可以检查和重新运行的脚本。

当一个任务“演示起来比从头描述更容易”时，这个流程尤其适合。第一版优先生成 JavaScript 脚本，而不是直接生成新 skill，便于先运行、验证和修正。

- Skill：[`record-openruntime-workflow`](./skills/record-openruntime-workflow/SKILL.md)
- 使用指南：[录制浏览器操作并生成脚本](./docs/record-browser-workflows.zh-CN.md)

**演示视频**

https://github.com/user-attachments/assets/45669f30-0c10-4a04-9926-5b796c4be946


---

## Example

例如，一个已经接入 OpenRuntime 的 Release Notes 页面可以声明：

Target：

```text
docs:release-notes
```

Action：

```text
release-note.list-latest
```

Agent 获取最新 Release Notes 时，可以按固定流程执行：

```sh
openruntime commands add @openruntime/command-trobule-shooting
openruntime start

openruntime open \
  https://example.com/openruntime/release-notes

openruntime verify \
  docs:release-notes ready \
  --url https://example.com/openruntime/release-notes

openruntime run-action \
  --url https://example.com/openruntime/release-notes \
  release-note.list-latest \
  --payload '{"limit":3}'
```

这里的 Target 和 Action 都由页面声明。

Agent 不需要分析 DOM，也不需要寻找按钮，只需要调用统一 Runtime API 即可获得结果。
`verify` 会保持保守：只有声明出来的业务 Target 才能作为最终验收，不会把框架或加载状态 Target 直接当成业务成功。
只想等待某个 Target 状态时用 `wait-for`；要做最终验收时用 `verify`。

团队也可以进一步把这些步骤封装成自己的命令：

```sh
openruntime release-note latest --limit 3
```

这样，页面能力就真正成为 Agent 可以稳定调用的 Runtime，而不是一次性的浏览器脚本。

---

## CLI 命令

OpenRuntime CLI 支持加载本地命令文件。团队可以用它增加自己的页面操作命令，而不需要修改 OpenRuntime 源码。

这里说的是页面命令开发：先由 agent 运行 `openruntime open <url>`，命令只操作当前已打开页面。需要自己打开浏览器并管理自动化流程时，应写独立自动化脚本。

命令导出格式、`run(options)` 参数、完整 `options.openruntime` API 和 GitHub release 示例见 [CLI 命令开发](docs/cli-extensions.zh-CN.md)。英文文档见 [CLI Command Development](docs/cli-extensions.md)。

如果要写包含打开浏览器、等待页面和操作页面的独立自动化脚本，见 [使用 OpenRuntime CLI 编写自动化脚本](docs/cli-automation-scripts.zh-CN.md)。

浏览器如何自动连接 Bridge，以及微前端页面中如何查看和选择多个 Runtime，见 [浏览器连接与多 Runtime 使用指南](docs/runtime-connections.zh-CN.md)。英文文档见 [Browser Connections and Multiple Runtimes](docs/runtime-connections.md)。

命令文件默认从这里读取：

```text
~/.openruntime/commands
```

可以用环境变量改目录：

```sh
OPENRUNTIME_COMMANDS_DIR=/path/to/commands openruntime --help
```

也可以关闭外部命令加载：

```sh
OPENRUNTIME_DISABLE_COMMANDS=1 openruntime --help
```

支持两种文件形式：

```text
~/.openruntime/commands/foo.mjs
~/.openruntime/commands/foo/index.mjs
```

外部命令会在 help 里单独展示：

```text
External Commands:
  openruntime foo ping - Runs Foo.
```

复杂命令可以声明一个本地 `SKILL.md`。Help 会列出哪些命令提供 skill，下面的命令会输出它的绝对路径：

```sh
openruntime foo --skill
```

如果外部命令和内置命令或内部命令重名，OpenRuntime 会跳过外部命令并打印警告。命令加载失败也不会导致 CLI 崩溃，加载命令时会直接打印失败原因。

在命令文件、测试或 CI 里调用 `defineCommand(...)` 和 `validateCommand(...)`，确保导出的命令格式有效。

外部命令会执行本机代码，只加载可信文件。

---

## Architecture

```text
                    Application
                         │
                         ▼
                  OpenRuntime SDK
                         │
                         ▼
                   Runtime Center
      ┌──────────────────────────────────┐
      │ Target                           │
      │ Snapshot                         │
      │ Event                            │
      │ Action                           │
      │ waitFor                          │
      └──────────────────────────────────┘
                         │
                   Bridge Protocol
                         │
                         ▼
                    OpenRuntime CLI
      ┌──────────────────────────────────┐
      │ Runtime API                      │
      │ Browser Control                  │
      │ Screenshot                       │
      │ Network                          │
      │ Console                          │
      │ Browser Profile                  │
      └──────────────────────────────────┘
```
