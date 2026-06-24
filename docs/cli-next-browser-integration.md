# CLI Browser Integration With OpenRuntime

## 摘要

OpenRuntime CLI 集成 `@vercel/next-browser` 后，可以直接启动和操作浏览器，同时继续使用 Runtime Core 判断页面状态、执行声明动作和等待结果。

这次集成的边界是：

- 浏览器层负责打开页面、点击、填写、截图、读取 `window` 变量。
- Runtime Core 负责结构化状态、声明动作、等待和事件证据。
- 未接入 OpenRuntime 的页面，可以用浏览器层能力读取变量或等待 eval 条件。
- 已接入 OpenRuntime 的页面，优先用 `wait-for`、`run-action`、`snapshot` 和 `events` 做稳定判断。

OpenRuntime 不把 `@vercel/next-browser` 的内部会话协议暴露给 Core，也不把临时页面脚本伪装成 Runtime action。

## CLI 命令

当前完整命令清单由 `pnpm run docs:cli` 从 CLI 源码生成，见
`docs/cli-reference.md`。本文件只说明浏览器集成行为和使用边界。

`open-runtime` 同时提供 `opr` 缩写，日常可以写成：

```txt
opr start
opr open http://localhost:8080/route-a
opr wait-for --url http://localhost:8080/route-a modern:route ready --where pathname=/route-a
opr stop
```

`snapshot` 继续表示 OpenRuntime 的结构化状态；浏览器页面快照命名为 `page-snapshot`，避免和 Runtime Snapshot 混淆。

## 行为规则

`open-runtime start` 会在后台启动 Bridge，确认可用后命令立即结束。再次执行时，如果 Bridge 已经可用，直接返回当前运行状态。

`open-runtime stop` 会先调用浏览器层 `close` 关闭浏览器会话，再关闭 CLI 自己启动的 Bridge。它只关闭 OpenRuntime CLI 记录过的进程，不会按端口强杀其他服务。

`open-runtime open <url>` 默认检查 Bridge 是否可用；不可用则自动在后台启动 Bridge。

浏览器登录态、Cookie 和本地存储默认保存在 `~/.openruntime/browser-profile`。再次执行 `open-runtime open <url>` 或关闭后重新打开时，会继续使用这份 OpenRuntime 自己的 profile。

CLI 打开页面时不直接复用系统 Chrome 的默认 profile，避免和用户正在使用的 Chrome 互相锁定或污染日常浏览数据。如需指定独立 profile 目录，可以设置 `OPENRUNTIME_BROWSER_PROFILE_DIR=/path/to/profile` 后再启动 CLI。切换 profile 目录前需要先执行 `open-runtime close`。

`open-runtime export-profile` 默认从本机 Google Chrome 的最近使用 profile 导出账号状态，包含 Cookie、本地存储和 IndexedDB。导出内容较短时会直接打印；内容较长时会自动写入临时文件并打印文件路径。另一台机器或另一个 Agent 侧执行 `open-runtime import-profile <content>` 或 `open-runtime import-profile --input <path>` 后，后续 `open-runtime open <url>` 会默认带上这份账号状态。

如果 Chrome 里有多个 profile，可以用 `open-runtime export-profile --chrome-profile <name>` 指定目录名、显示名或邮箱。也可以用 `--chrome-user-data-dir <path>` 指定 Chrome 用户数据目录。不带 `--domain` 的全量导出需要 Chrome profile 没有被正在运行的 Chrome 锁住；如果失败，先关闭 Google Chrome 后重试。

可以用 `open-runtime export-profile --domain github.com` 只导出指定站点相关的 Cookie、本地存储和 IndexedDB。这个模式会先复制一份临时 Chrome profile，再用 `https://<domain>/` 的本地空页面读取对应站点状态，避免真实访问目标站点，也避免扫描全量站点存储，通常不需要退出正在使用的 Chrome。这个参数可以重复使用，例如同时导出 `github.com` 和 `githubusercontent.com`。如果需要固定文件路径，可以加 `--output <path>`，再用 `open-runtime import-profile --input <path>` 导入。

`open-runtime export-profile --source openruntime` 会导出 OpenRuntime 自己浏览器里保存的账号状态，也支持配合 `--domain <domain>` 缩小导出范围。

如果默认端口被别的服务占用，命令会失败，并提示使用 `--bridge` 或 `--port` 换一个 Bridge 地址。

`--no-bridge` 只打开浏览器，不准备 Runtime 通道。这个模式适合只想截图、点击或读取页面变量的场景。

`open-runtime wait-for --url <url>` 默认只查找已经连接的 Runtime，不自动打开页面。没有匹配 Runtime 时直接失败，并提示可以加 `--open`。

`open-runtime wait-for --url <url> --open` 在没有匹配 Runtime 时先打开页面，再等待页面连接 Bridge，最后等待目标状态。

`wait-for --open` 不负责启动业务 dev server。如果页面服务不可达，命令会超时失败，并提示页面服务或 Runtime 连接有问题。

`get-window gf_data_v1` 直接读取 `window.gf_data_v1`，不要求页面注册 target 或 action。

`wait-eval` 是浏览器层等待，不写入 OpenRuntime snapshot 或 event，只作为未接入页面的兜底能力。

## Runtime 联动示例

页面已接入 OpenRuntime，等 route-a 加载后读取变量：

```txt
open-runtime open http://localhost:8080/route-a
open-runtime wait-for --url http://localhost:8080/route-a modern:route ready --where pathname=/route-a --timeout 10000
open-runtime get-window gf_data_v1
```

页面未接入 OpenRuntime，使用浏览器层等待：

```txt
open-runtime open http://localhost:8080/route-a
open-runtime wait-eval "location.pathname === '/route-a' && window.gf_data_v1 != null" --timeout 10000
open-runtime get-window gf_data_v1
```

页面未打开，但希望等待时自动打开：

```txt
open-runtime wait-for --url http://localhost:8080/route-a modern:route ready --where pathname=/route-a --open --timeout 10000
```

页面已声明 OpenRuntime action：

```txt
open-runtime actions --url http://localhost:8080/route-a
open-runtime run-action --url http://localhost:8080/route-a <action-name> --payload <json>
open-runtime wait-for --url http://localhost:8080/route-a <target-id> <status> --timeout 10000
open-runtime events --url http://localhost:8080/route-a --limit 20
```

## 用户自定义脚本与 Action 的边界

如果用户只是想读 `window.gf_data_v1`，直接使用：

```txt
open-runtime get-window gf_data_v1
```

这不要求业务按 OpenRuntime 规则注册 target，也不要求业务声明 action。

如果业务希望这件事变成可复用、可等待、可解释的诊断能力，再由页面、框架 adapter 或业务代码注册 OpenRuntime action 和 target。那时才使用：

```txt
open-runtime run-action <action-name>
open-runtime wait-for <target-id> <status>
```

因此，临时读取变量是浏览器能力；稳定诊断动作才进入 Runtime Core。

## 实现边界

CLI 内部调用 `@vercel/next-browser`，但只依赖它的公开命令，不读取或复用它的内部 daemon 协议。

`@vercel/next-browser` 作为 `@openruntime/cli` 的依赖，由 lockfile 固定版本。后续升级时只需要回归 CLI 浏览器命令。

Core、Bridge、Modern.js plugin 和 MF runtimePlugin 的数据模型不因为这次集成改变。

## 验收标准

- `open-runtime open <url>` 能自动准备 Bridge 并打开页面。
- `open-runtime get-window gf_data_v1` 能读取未接入 OpenRuntime 页面里的 `window.gf_data_v1`。
- `open-runtime wait-for --url <url>` 在无 Runtime 时直接失败，并提示可使用 `--open`。
- `open-runtime wait-for --url <url> --open` 能先打开页面，再等待 Runtime 状态。
- 已接入页面可以先等 `modern:route ready`，再读取 `gf_data_v1`。
- 未接入页面可以用 `wait-eval` 等待浏览器条件成立。
- 现有 `snapshot / actions / run-action / wait-for / events` 行为不回退。
