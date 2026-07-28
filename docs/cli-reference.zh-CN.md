# Divebell CLI 命令参考

English version: [Divebell CLI Reference](cli-reference.md)

<!-- 本文件由 scripts/sync-divebell-cli-docs.mjs 生成，请勿手工修改。 -->

本文档根据 `packages/cli/src/commands/help.ts` 中的当前命令表生成。

## 可执行命令

- `divebell`

## 命令

### Bridge 与浏览器

- `divebell check [--fix]` - 显示 Node 与浏览器信息，并检查 Divebell 能否正常打开和控制浏览器；--fix 会连接已安装的 Chrome，只有未找到 Chrome 时才会安装。
- `divebell start [--port <port>]` - 显式启动或复用 CLI 管理的 Bridge；大多数命令会自动准备它。
- `divebell stop [--port <port>]` - 关闭浏览器会话，然后停止 CLI 管理的 Bridge。
- `divebell profiles` - 列出 agent-browser 可以使用的本机 Chrome Profile。
- `divebell state save <path> [--url <url>]` - 保存 agent-browser state；指定 --url 时，只保留该网址会用到的 Cookie 和网页存储。
- `divebell state load <path>` - 把 agent-browser state 文件载入当前浏览器会话。
- `divebell state <list|show|rename|clear|clean> [args]` - 查看和管理 agent-browser 保存的 state。
- `divebell auth save <name> --url <url> --username <user> --password-stdin` - 把登录凭据加密保存在 agent-browser 的凭据库中。
- `divebell auth login <name>` - 打开保存的登录页，让 agent-browser 填写并提交匹配的登录表单。
- `divebell auth <list|show|delete> [name]` - 查看或删除 agent-browser 的凭据条目；不会显示密码。
- `divebell open <url> [--headers <json>] [--profile <name|path>] [--state <path>] [--bridge <url>] [--port <port>] [--session <id>] [--no-bridge] [--ui]` - 为当前目录打开独立页面并自动分配专属 Bridge 端口，也可传入仅对目标网址来源生效的 HTTP header、Chrome Profile、state 文件或显式指定 Bridge。
- `divebell stack [--refresh]` - 运行已安装扩展中的技术栈识别器，并汇总当前页面的结果。
- `divebell page-snapshot` - 读取当前页面快照，包括可操作元素的引用。
- `divebell click <ref|selector|text>` - 通过页面引用、选择器或可见文字点击元素。
- `divebell fill <ref|selector> <value>` - 通过页面引用或选择器填写输入框。
- `divebell eval <script>` - 在页面中运行脚本，也可以通过 --file <path> 读取脚本文件。
- `divebell wait-eval <script> [--timeout <ms>]` - 轮询页面表达式，直到它返回 true。
- `divebell get-window <path>` - 读取 window/globalThis 上的点分路径，例如 gf_data_v1。
- `divebell screenshot [name] [--full-page]` - 通过 Divebell 浏览器层截图。
- `divebell network [--url <query>]` - 列出当前页面的网络请求，并可按 URL 文字过滤。
- `divebell console [--level <level>] [--query <keyword>] [--limit <n>]` - 读取浏览器 Console 日志作为补充；结构化验证和排查优先使用 snapshot --query。
- `divebell coverage <status|start|take|stop|cancel> [path] [--label <name>] [--max-size <bytes>]` - 分阶段记录当前页面执行过的代码，用于识别已加载但未使用的业务和第三方代码。

### Runtime

- `divebell runtimes [--bridge <url>]` - 列出当前目录已打开页面中的 Runtime，也可显式指定其他 Bridge。
- `divebell targets [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--id <id>] [--type <type>] [--source <source>] [--status <status>] [--query <keyword>]` - 读取所选 Runtime 注册的 Target 定义。
- `divebell snapshot [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--id <id>] [--type <type>] [--source <source>] [--status <status>] [--query <keyword>]` - 读取所选 Runtime 的当前 Snapshot 状态。
- `divebell events [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--target-id <id>] [--type <type>] [--source <source>] [--status <status>] [--action <name>] [--since <event-id>] [--limit <n>] [--query <keyword>]` - 读取 Runtime 的事件历史。
- `divebell actions [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--name <name>] [--source <source>] [--risk <risk>] [--enabled <true|false>] [--query <keyword>]` - 列出页面声明的 Runtime Action。
- `divebell input-options [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] --action <name> --input <name> [--payload <json>] [--timeout <ms>]` - 读取 Action 输入项的动态可选值。
- `divebell run-action [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] <action-name> [--payload <json>]` - 执行页面声明的 Runtime Action。
- `divebell wait-for [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] <target-id> <status> [--where <path=value>] [--timeout <ms>] [--strict] [--next]` - 等待 Target 到达指定状态；--where 的值按 JSON 字面量解析，可匹配数字、布尔值或 null。

### 扩展

- `divebell extensions add <package-or-path> [--extensions-dir <path>]` - 检查并从 npm 包或本地路径安装一个不含运行依赖的 Divebell Extension。
- `divebell extensions list [--extensions-dir <path>]` - 列出已安装的 Divebell 扩展包、命令和 Hook。
- `divebell extensions update <package> [--extensions-dir <path>]` - 下载并启用扩展包的最新版本；更新失败时保留当前版本。
- `divebell extensions remove <package> [--extensions-dir <path>]` - 卸载指定扩展包。
