# Divebell CLI 命令参考

English version: [Divebell CLI Reference](cli-reference.md)

<!-- 本文件由 scripts/sync-divebell-cli-docs.mjs 生成，请勿手工修改。 -->

本文档根据 `packages/cli/src/commands/help.ts` 中的当前命令表生成。

## 可执行命令

- `divebell`

## 命令

### 浏览器

- `divebell setup` - 准备当前电脑上的 Divebell：检查运行环境，并只在浏览器尚未准备好时修复。
- `divebell start [--port <port>]` - 显式启动或复用 CLI 管理的 Bridge；大多数命令会自动准备它。
- `divebell stop [--port <port>]` - 关闭浏览器会话，然后停止 CLI 管理的 Bridge。
- `divebell profiles` - 列出 agent-browser 可以使用的本机 Chrome Profile。
- `divebell state save <path> [--url <url>]` - 保存 agent-browser state；指定 --url 时，只保留该网址会用到的 Cookie 和网页存储。
- `divebell state load <path>` - 把 agent-browser state 文件载入当前浏览器会话。
- `divebell state <list|show|rename|clear|clean> [args]` - 查看和管理 agent-browser 保存的 state。
- `divebell auth save <name> --url <url> --username <user> --password-stdin` - 把登录凭据加密保存在 agent-browser 的凭据库中。
- `divebell auth login <name>` - 打开保存的登录页，让 agent-browser 填写并提交匹配的登录表单。
- `divebell auth <list|show|delete> [name]` - 查看或删除 agent-browser 的凭据条目；不会显示密码。
- `divebell open <url> [--headers <json>] [--profile <name|path>] [--state <path>] [--bridge <url>] [--port <port>] [--session <id>] [--no-bridge] [--ui] [--enable <feature>] [--init-script <path>] [--proxy <url>] [--allowed-domains <list>] [--engine <name>]` - 在 Divebell 管理的页面生命周期中打开网址，并支持常用的 agent-browser 启动选项。
- `divebell goto <url>` - 在不替换浏览器会话的情况下，把当前 Divebell 页面跳转到另一个网址。
- `divebell navigate <url>` - divebell goto 的别名。
- `divebell back` - 返回当前页面历史中的上一页。
- `divebell forward` - 前进到当前页面历史中的下一页。
- `divebell reload` - 重新加载当前页面。
- `divebell pushstate <url>` - 请求当前单页应用执行客户端路由跳转。
- `divebell read [url] [--filter <text>] [--outline] [--llms <index|full>]` - 读取当前页面，或从网址获取适合 Agent 阅读的文字。
- `divebell dblclick <ref|selector>` - 双击元素。
- `divebell type <ref|selector> <text>` - 在不清空原值的情况下继续输入文字。
- `divebell keyboard <type|inserttext> <text>` - 不指定元素，直接通过浏览器键盘输入文字。
- `divebell keydown <key>` - 按住键盘按键。
- `divebell keyup <key>` - 松开已按住的键盘按键。
- `divebell hover <ref|selector>` - 把鼠标悬停在元素上。
- `divebell tap <ref|selector>` - 在触屏浏览器中点按元素。
- `divebell swipe <up|down|left|right> [pixels]` - 在支持的移动浏览器中执行滑动手势。
- `divebell check-element <ref|selector>` - 勾选复选框；使用独立名称以避免复用已删除的 Divebell 环境检查命令。
- `divebell uncheck <ref|selector>` - 取消勾选复选框。
- `divebell drag <source-ref|selector> <target-ref|selector>` - 把一个元素拖到另一个元素上。
- `divebell upload <ref|selector> <file...>` - 通过文件输入框上传一个或多个文件。
- `divebell download <ref|selector> <path>` - 点击元素并把下载内容保存到指定位置。
- `divebell scroll <up|down|left|right> [pixels]` - 滚动当前页面。
- `divebell scrollintoview <ref|selector>` - 滚动页面，直到指定元素进入可见区域。
- `divebell wait <ref|selector|milliseconds> [--text <text>] [--url <glob>] [--load <state>] [--fn <script>]` - 等待元素、文字、网址、加载状态、指定时长或页面条件。
- `divebell get <text|html|value|attr|title|url|count|box|styles|cdp-url> [ref|selector] [name]` - 读取页面或元素信息。
- `divebell is <visible|enabled|checked> <ref|selector>` - 检查元素是否可见、可用或已勾选。
- `divebell find <role|text|label|placeholder|alt|title|testid|first|last|nth> <value> <action> [text]` - 按语义查找元素并执行操作。
- `divebell mouse <move|down|up|wheel> [args]` - 控制浏览器鼠标。
- `divebell set <viewport|device|geo|offline|headers|credentials|media> [value...]` - 调整当前浏览器页面的显示、网络、位置或认证设置。
- `divebell device list` - 列出可用的移动浏览器设备。
- `divebell cookies [get|set|clear] [args]` - 查看或修改当前浏览器会话中的 Cookie。
- `divebell storage <local|session> [get|set|clear] [args]` - 查看或修改网页本地存储或会话存储。
- `divebell tab [new|list|close|<id-or-label>] [url]` - 新建、列出、切换或关闭浏览器标签页。
- `divebell window new` - 打开新的浏览器窗口。
- `divebell frame <ref|selector|main>` - 切换到 iframe，或回到主页面。
- `divebell dialog <accept|dismiss|status> [text]` - 查看或处理浏览器弹窗。
- `divebell pdf <path>` - 把当前页面保存为 PDF。
- `divebell diff <snapshot|screenshot|url> [args]` - 比较页面快照、截图或网址。
- `divebell network <route|unroute|requests|request|har> [args]` - 检查、记录、拦截、阻断或模拟网络请求。
- `divebell errors [--clear]` - 读取或清空页面错误。
- `divebell console --clear` - 清空浏览器 Console 日志。
- `divebell highlight <ref|selector>` - 在浏览器中高亮元素。
- `divebell trace <start|stop> [path]` - 记录浏览器性能轨迹。
- `divebell profiler <start|stop> [path]` - 记录浏览器性能分析文件。
- `divebell video <start|stop|restart> [path]` - 录制当前浏览器页面视频；使用独立名称避免与工作流录制 Extension 冲突。
- `divebell inspect` - 为当前页面打开浏览器开发者工具。
- `divebell clipboard <read|write|copy|paste> [text]` - 读取或修改浏览器剪贴板。
- `divebell stream <enable|disable|status> [--port <number>]` - 管理当前会话的浏览器实时画面流。
- `divebell react <tree|inspect|renders|suspense> [args]` - 在页面启用了 React DevTools 时检查 React 状态。
- `divebell vitals [url] [--json]` - 测量 Core Web Vitals 和页面接管耗时。
- `divebell a11y [url] [--tags <tags>] [--selector <selector>] [--json]` - 运行网页无障碍检查。
- `divebell addinitscript <script>` - 在当前浏览器会话中注册页面初始化脚本。
- `divebell removeinitscript <id>` - 移除已注册的页面初始化脚本。
- `divebell confirm <id>` - 批准一个正在等待明确确认的浏览器操作。
- `divebell deny <id>` - 拒绝一个正在等待明确确认的浏览器操作。
- `divebell stack [--refresh]` - 运行已安装扩展中的技术栈识别器，并汇总当前页面的结果。
- `divebell page-snapshot [--interactive] [--compact] [--depth <depth>] [--selector <selector>]` - 读取当前页面快照，包括可操作元素的引用，并可限制范围和详细程度。
- `divebell click <ref|selector|text>` - 通过页面引用、选择器或可见文字点击元素。
- `divebell fill <ref|selector> <value>` - 通过页面引用或选择器填写输入框。
- `divebell focus <ref|selector>` - 通过页面引用或选择器聚焦元素。
- `divebell press <key>` - 在当前聚焦的元素中按下键盘按键或组合键。
- `divebell select <ref|selector> <value...>` - 通过值或文字选择原生下拉框中的一个或多个选项。
- `divebell eval [<script> | --file <path> | --base64 <encoded> | --stdin]` - 在页面中运行脚本，也可以从文件、标准输入或 Base64 编码内容读取 JavaScript。
- `divebell wait-eval <script> [--timeout <ms>]` - 轮询页面表达式，直到它返回 true。
- `divebell get-window <path>` - 读取 window/globalThis 上的点分路径，例如 gf_data_v1。
- `divebell screenshot [name] [--full-page] [--annotate]` - 通过 Divebell 浏览器层截图，并可生成整页或带元素标记的截图。
- `divebell network [--url <query>]` - 列出当前页面的网络请求，并可按 URL 文字过滤。
- `divebell console [--level <level>] [--query <keyword>] [--limit <n>]` - 读取浏览器 Console 日志作为补充；结构化验证和排查优先使用 snapshot --query。
- `divebell coverage <status|start|take|stop|cancel> [path] [--label <name>] [--max-size <bytes>]` - 分阶段记录当前页面执行过的代码，用于识别已加载但未使用的业务和第三方代码。

### Runtime

- `divebell runtimes [--bridge <url>]` - 列出当前目录已打开页面中的 Runtime，也可显式指定其他 Bridge。
- `divebell targets [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--id <id>] [--type <type>] [--source <source>] [--status <status>] [--query <keyword>]` - 读取所选 Runtime 注册的 Target 定义。
- `divebell snapshot [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--id <id>] [--type <type>] [--source <source>] [--status <status>] [--query <keyword>]` - 读取所选 Runtime 的当前 Snapshot 状态。
- `divebell events [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--target-id <id>] [--type <type>] [--source <source>] [--status <status>] [--action <name>] [--since <event-id>] [--limit <n>] [--query <keyword>]` - 读取 Runtime 的事件历史。
- `divebell actions [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] [--name <name>] [--source <source>] [--risk <risk>] [--enabled <true|false>] [--query <keyword>]` - 列出页面声明的 Runtime Action。
- `divebell run-action [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] <action-name> [--payload <json>]` - 执行页面声明的 Runtime Action。
- `divebell wait-for [--bridge <url>] [--runtime <id> | --session <id> | --url <url>] <target-id> <status> [--where <path=value>] [--timeout <ms>] [--strict] [--next]` - 等待 Target 到达指定状态；--where 的值按 JSON 字面量解析，可匹配数字、布尔值或 null。

### 扩展

- `divebell extensions add <package-or-path> [--extensions-dir <path>]` - 检查并从 npm 包或本地路径安装一个不含运行依赖的 Divebell Extension。
- `divebell extensions list [--extensions-dir <path>]` - 列出已安装的 Divebell 扩展包、命令和 Hook。
- `divebell extensions update <package> [--extensions-dir <path>]` - 下载并启用扩展包的最新版本；更新失败时保留当前版本。
- `divebell extensions remove <package> [--extensions-dir <path>]` - 卸载指定扩展包。
