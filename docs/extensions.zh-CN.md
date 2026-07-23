# OpenRuntime Extension 使用指南

English version: [Using OpenRuntime Extensions](extensions.md)

本文面向安装和使用 Extension 的 Agent 与开发者。如果你要编写自己的 Extension，直接阅读 [CLI Extension 开发指南](cli-extensions.zh-CN.md)；查找字段和方法时，使用 [Extension API 参考](extension-api.zh-CN.md)。

## 什么是 Extension

OpenRuntime 默认提供通用的页面操作、浏览器诊断和可选 Runtime 能力。不同团队还会有自己的账号准备、环境切换、技术栈识别、专项排查和验证流程。Extension 把这些可重复使用的知识和流程封装成 Agent 可以发现和调用的能力。

一个 Extension 可以提供：

- Commands：挂载到 `openruntime` 下的命令。
- Hooks：在 `open`、`detectStack` 和 `close` 阶段执行逻辑。
- Skills：说明复杂命令的使用方式和判断标准。

Extension 适合团队会反复使用的开发调试流程。一次性的页面点击或临时检查直接使用现有 CLI 即可。如果能力必须由应用主动暴露内部状态、事件或允许动作，应使用 [Runtime Core API](runtime-core-api.zh-CN.md)。

## 安装 Extension

使用 npm 包名安装可信的 Extension：

```sh
openruntime extensions add @scope/package
```

官方 Extension 及其用途见 [README 的官方扩展列表](../README.zh-CN.md#官方扩展)。

Extension 会执行本机代码，只安装来源明确、内容可信的包。安装完成后，新命令会出现在：

```sh
openruntime --help
```

这些命令会复用 OpenRuntime 最近打开的页面、浏览器会话和登录状态。

## 管理 Extension

```sh
openruntime extensions list
openruntime extensions update @scope/package
openruntime extensions remove @scope/package
```

- `list` 查看已经安装的包、命令和 Hook。
- `update` 下载并启用最新版本；更新失败时保留当前版本。
- `remove` 卸载指定包。

扩展默认安装到：

```text
~/.openruntime/extensions
```

需要使用独立目录时，可以设置：

```sh
OPENRUNTIME_EXTENSIONS_DIR=/path/to/extensions openruntime --help
```

需要临时关闭外部 Extension 加载时，可以设置：

```sh
OPENRUNTIME_DISABLE_EXTENSIONS=1 openruntime --help
```

## 使用 Extension

先通过 `openruntime --help` 发现可用的一级命令，再通过 `openruntime <command> --help` 查看该命令的详细用法和参数。按当前任务选择匹配的能力，不要无目的地运行所有诊断命令。

页面类命令通常操作最近一次通过 `openruntime open <url>` 打开的页面：

```sh
openruntime open https://example.com
openruntime <extension-command>
```

`openruntime stack` 会运行 Extension 提供的技术栈识别器，并可能推荐更合适的专项 Extension：

```sh
openruntime stack
openruntime stack --refresh
```

复杂命令可以附带 Skill。使用下面的形式读取 Skill 路径，不执行命令：

```sh
openruntime <extension-command> --skill
```

如果一个流程需要自己管理页面打开、等待、操作和关闭的完整生命周期，应使用[自动化脚本](cli-automation-scripts.zh-CN.md)，而不是依赖最近打开页面的 Extension 命令。

## 安全与使用边界

- Extension 在本机执行，只加载可信来源。
- 不要把测试账号、登录状态、临时凭证或其他敏感信息写进扩展包和命令输出。
- Extension 只能在已经授权的账号、环境和页面范围内工作，不能绕过权限边界。
- 页面没有接入 Runtime Core 时，浏览器操作和诊断仍然可用；不要为了运行 Extension 强制修改应用。
- 执行动作后应继续读取页面结果或等待明确状态，不要仅凭命令已运行就宣布验证成功。
