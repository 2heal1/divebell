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
- 导入和导出浏览器 Profile

浏览器能力负责进入页面和收集外部信息。

Runtime API 则负责提供页面内部真实的运行状态。

对于 Agent，更推荐优先读取 Runtime API，再结合浏览器能力完成验证，而不是完全依赖浏览器自动化。

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

## CLI 扩展

OpenRuntime CLI 支持加载本地扩展文件。团队可以用它增加自己的工作流命令，而不需要修改 OpenRuntime 源码。

外部扩展默认从这里读取：

```text
~/.openruntime/extensions
```

可以用环境变量改目录：

```sh
OPENRUNTIME_EXTENSIONS_DIR=/path/to/extensions openruntime extensions list
```

也可以关闭外部扩展：

```sh
OPENRUNTIME_DISABLE_EXTERNAL_EXTENSIONS=1 openruntime --help
```

支持两种文件形式：

```text
~/.openruntime/extensions/foo.mjs
~/.openruntime/extensions/foo/index.mjs
```

扩展文件必须默认导出固定结构：

```js
export default {
  schemaVersion: 1,
  name: "foo",
  displayName: "Foo",
  description: "Foo extension",
  commandReferences: [
    {
      category: "Extensions",
      usage: "openruntime foo ping",
      description: "Runs the Foo command."
    }
  ],
  exampleReferences: [
    {
      command: "openruntime foo ping",
      description: "Runs the Foo command."
    }
  ],
  async run(options) {
    const location = await options.openruntime.browser.eval("window.location.href");
    const snapshot = await options.openruntime.snapshot({ query: "ready" });
    options.stdout.write(JSON.stringify({ location, snapshot }, null, 2));
    options.stdout.write("\n");
    return 0;
  }
};
```

扩展里通过 `options.openruntime` 调用 OpenRuntime 能力，不需要自己 spawn CLI。`snapshot`、`targets`、`events`、`actions`、`runAction`、`waitFor` 会直接访问 Bridge；`browser.open`、`browser.eval`、`browser.network`、`browser.console` 是 OpenRuntime 对当前浏览器 runner 的稳定封装。

外部扩展会在 help 里单独展示，并标注来源：

```text
External Extensions:
  openruntime foo ping [external: foo]
```

查看当前加载结果：

```sh
openruntime extensions list
```

如果外部扩展和内置命令或内部扩展重名，OpenRuntime 会跳过外部扩展并打印警告。扩展加载失败也不会导致 CLI 崩溃，可以通过 `extensions list` 查看失败原因。

外部扩展会执行本机代码，只加载可信文件。

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
