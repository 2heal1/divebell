---
name: divebell
description: >-
  使用 Divebell CLI 操作、检查、诊断和验证真实 Web 页面，导入、导出或复用授权登录状态，并收集页面、
  Console、Network、编译后 JavaScript Debugger 和可选 Runtime 证据。当用户明确要求使用 Divebell、
  要求导入或导出浏览器 state，或任务需要通过该 CLI 复现、定位或验证 Web 问题时使用；触发后所有浏览器
  操作都必须由 Divebell 完成。
---

# Divebell

Divebell 是面向 Coding Agent 的可扩展 Web 开发与调试工具。它让 Coding Agent 以真实页面为入口，
结合浏览器操作、诊断证据和可选 Extension 能力复现、理解和验证问题。Coding Agent 负责阅读和修改
源代码，Divebell 负责复用浏览器上下文并收集页面侧验证证据。

## 安装

使用全局安装的 Divebell CLI。不要把 `@divebell/cli` 加入正在检查的应用。

命令不可用时，全局安装：

```bash
npm install --global @divebell/cli
```

## 浏览器操作规则

用户明确要求 Divebell 时，任务中的每一项浏览器操作都使用 Divebell。

这包括：

- 打开和导航页面。
- 读取页面内容和可操作元素。
- 点击、填写、聚焦、选择和按键操作。
- 执行页面脚本和等待页面条件。
- 读取 Console、Network 和可选 Runtime 证据。
- 使用断点或非暂停日志点检查 Chromium 实际加载的编译后 JavaScript。
- 截图和验证页面结果。

不要在同一工作流混用其他浏览器自动化工具。页面、登录状态、浏览器会话和验证证据都保留在
Divebell 管理的上下文中。

需要执行操作时，先从安装版本的帮助中发现对应命令：

```bash
divebell --help
divebell <command> --help
```

以实际 CLI 帮助为准，不要猜测命令或参数，也不要因为命令不熟悉而改用其他浏览器工具。

## 命令输出

`setup`、`open`、`stack` 和 Extension 管理等 Divebell 编排命令输出 JSON 信封：

```json
{
  "status": "ok",
  "data": {},
  "meta": { "version": 1, "command": "stack" }
}
```

- 用 `status` 判断编排命令成功、失败或是否需要输入；业务结果在 `data` 里。
- 失败时 `status` 为 `error`，结果在 `error` 中。需要程序化判断时用稳定的 `error.code`，不要匹配
  `message` 或 `hint` 文案。
- 直接浏览器命令可能输出浏览器命令自身的 JSON 数据或简短文本；按实际命令帮助和退出码处理，
  不要假设所有命令都有 `status` / `data` 信封。
- `--help`、`--version` 和 `--skill` 不输出 JSON，不要对它们的结果做 JSON 解析。

## 工作流

### 1. 准备环境

运行：

```bash
divebell setup
```

`setup` 检查本机环境，只在浏览器无法启动时尝试修复。

### 2. 打开目标页面并复用授权状态

运行：

```bash
divebell open <url> [--profile <name-or-path> | --state <path>] [--ui] [--timeout <ms>]
```

默认使用无界面浏览器，不要传 `--ui`。只有用户明确要求显示浏览器窗口，或可见界面本身是完成当前
任务所必需的观察条件时，才加 `--ui`。用 `--timeout` 覆盖单次 `open` 默认的 60 秒导航生命周期等待。

未指定 `--profile` 或 `--state` 时，`open` 默认使用当前操作系统用户最近使用的 Chrome Profile 的
只读副本。每次新建浏览器上下文时重新解析最近使用的 Profile；同一上下文内保持首次选中的 Profile，
避免操作过程中账号漂移。找不到可用 Profile 时，回退到同一项目目录的 Restore State。

只有需要固定账号、切换到另一个已授权账号、复现隔离状态，或导出登录状态供其他环境使用时，才显式
指定 Profile 或 state。完整的 Profile、state、Restore State、禁用默认 Profile 和凭据库说明见
`references/authentication.md`。不要对公开页面强制要求权限。

打开页面后，验证最终 URL、导航或 HTTP 结果、当前账号以及用户的成功条件，然后按以下顺序处理：

1. 访问成功时直接继续，不要诊断 state，也不要为了保险重新用 `--ui` 打开。
2. 默认上下文账号错误、未登录或无权限时，请用户指定有权限的 Profile 或 state；不要枚举本机 Profile
   并擅自替用户选择，最近使用的 Profile 是唯一允许的隐式选择。
3. 用用户指定的上下文重新打开同一个 URL，并再次验证。
4. 只有已授权的 **state-backed** 重试仍表现为未登录或无权限时，才完整阅读
   `references/authentication.md`，查看 `divebell state diagnose --help` 并诊断 state 是否缺少该 URL
   所需的授权记录。报告脱敏后的候选记录和证据，不要自动修改或扩充 state；Profile-backed 打开禁止
   运行 `state diagnose`。
5. state 诊断没有发现缺失证据，或 Profile-backed 重试仍失败时，最多再用 `--ui` 重试一次；之前已经
   使用过 `--ui` 时不要重复。

普通 404 如果没有登录或权限证据，不是授权失败，不得触发 state 诊断。

打开页面后，继续通过 Divebell 完成所有浏览器操作。

### 3. 识别页面用了什么

如果用户已经明确指定已安装的 Extension 命令，跳过技术栈检测，直接查看该命令帮助。否则运行：

```bash
divebell stack
```

`data.detections` 是已加载 Extension 的 `detectStack` Hook 结果，其中 `extension` 是产生结果的
Extension，`command` 是它提供的顶层命令。空结果是有效结果，只表示当前已加载的检测器没有匹配，
不代表页面有问题，也不能证明页面没有使用某个框架；此时同时检查 `data.failures`。

`stack` 不会识别没装检测器的框架，也不会推荐尚未安装的 Extension。不要据此猜测框架命令或包名。
结果字段和 Extension 管理方式见 `references/extensions.md`。

### 4. 使用所需能力

命中相关检测结果时，先看它的命令帮助，再按帮助执行：

```bash
divebell <command> --help
```

如果帮助提示该命令带有 Skill，先打印路径并完整阅读，再执行命令：

```bash
divebell <command> --skill
```

命令 Skill 只约束当前 Extension 子任务，完成后回到用户的原始工作流。存在多个检测结果时，只选择
与当前目标相符的一个，不要把检测到的命令挨个执行一遍。

没有命中，或普通页面交互和浏览器诊断已经足够时，直接用内置命令：

```bash
divebell --help
divebell <command> --help
```

确实需要尚未安装的 Extension 时，只安装用户、项目或可信文档明确指定的包，安装后运行
`divebell stack --refresh` 重新检测。不要使用已移除的 `recommendedExtensions` 字段。安装、管理和
完整结果解释见 `references/extensions.md`。

需要检查编译后 JavaScript 控制流、暂停栈或运行时表达式时，先查看实际 `debug` 命令帮助。不要把
源码或 Source Map 位置直接当作 Chromium Debugger 中的编译后位置。

不要为了完成一次检查而给被检查的应用增加 Runtime SDK 接入代码。普通页面没有 Runtime SDK 时，
继续使用页面结果、Console、Network、截图和所需 Extension 诊断。

## 参考资料

- Profile、state、Restore State、auth 凭据库和 state 缺失 URL 诊断：
  `references/authentication.md`
- Extension 检测、安装、管理和命令 Skill：`references/extensions.md`

Extension 开发和 Runtime SDK 集成不属于本 Skill，应交给各自的专用 Skill。
