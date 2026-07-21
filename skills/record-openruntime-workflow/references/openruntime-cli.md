# OpenRuntime CLI 运行包

本 skill 自带 CLI wrapper 和固定版本清单，不把 `.tgz` 二进制提交到 Git。
用户机器没有全局 `openruntime` 时，wrapper 会从清单指向的 GitHub Release
下载一个运行包，校验 SHA-256，并按版本缓存。

## 统一入口

录制前先用 probe 做快速检测：

```bash
node <skill-dir>/scripts/probe-openruntime-cli.mjs
```

probe 只检查环境，不安装依赖，不打开浏览器。它总是输出 JSON，`candidates`
描述可复用的本机 CLI，`bundled` 描述 Release 运行包版本、下载地址和缓存状态。
`bundled.cached` 为 `false` 时，真正调用 wrapper 才会下载。

真正执行 OpenRuntime 命令时，通过 wrapper 调用 CLI：

```bash
node <skill-dir>/scripts/openruntime-cli.mjs <openruntime-args>
```

例如：

```bash
node <skill-dir>/scripts/openruntime-cli.mjs record start --mic
node <skill-dir>/scripts/openruntime-cli.mjs record stop --out <start-output-path>
node <skill-dir>/scripts/openruntime-cli.mjs record transcribe --input <start-output-path>
```

## wrapper 行为

1. 如果设置了 `OPENRUNTIME_CLI`，直接使用该路径。
2. 如果当前运行包版本已经安装，直接使用缓存里的命令。
3. 如果尚未安装，读取 `references/openruntime-cli-runtime.json`，下载 Release 运行包和 `.sha256` 文件。
4. SHA-256 校验通过后解压包资源，并用 npm 离线安装到当前版本缓存目录。
5. 如果下载或安装失败，再尝试系统里的 `openruntime` 或 `open-runtime`。

默认安装缓存目录：

```text
~/.cache/record-openruntime-workflow/openruntime-cli/<runtime-version>
```

需要改缓存目录时，设置：

```bash
OPENRUNTIME_SKILL_CLI_HOME=<path>
```

需要使用镜像地址时，设置：

```bash
OPENRUNTIME_SKILL_RUNTIME_URL=<runtime-tgz-url>
OPENRUNTIME_SKILL_RUNTIME_SHA256_URL=<sha256-url>
```

私有仓库下载需要令牌时，设置：

```bash
OPENRUNTIME_SKILL_RUNTIME_TOKEN=<github-token>
```

离线环境可以提前准备运行包及同名 `.sha256` 文件，再设置：

```bash
OPENRUNTIME_SKILL_RUNTIME_ARCHIVE=/absolute/path/openruntime-recording-runtime-<version>.tgz
```

也可以直接设置校验值：

```bash
OPENRUNTIME_SKILL_RUNTIME_SHA256=<64-char-sha256>
```

默认安装超时是 60 秒。需要调整时，设置：

```bash
OPENRUNTIME_SKILL_CLI_INSTALL_TIMEOUT_MS=<milliseconds>
```

默认下载超时是 120 秒。需要调整时，设置：

```bash
OPENRUNTIME_SKILL_RUNTIME_DOWNLOAD_TIMEOUT_MS=<milliseconds>
```

统一发布流程见仓库文档 `docs/release.zh-CN.md`。

## 语音转写

`record start --mic` 会保存 `audio.webm`、`audio-chunks.jsonl` 和
`audio-events.jsonl`。浏览器支持时，录音页会同步写入语音识别结果，
`record stop` 会汇总到 `transcript.json`。`record stop` 不默认访问外部服务。

需要把录音转成文字时间轴时运行：

```bash
node <skill-dir>/scripts/openruntime-cli.mjs record transcribe --input <start-output-path>
```

默认读取 `OPENAI_API_KEY`，也可以传 `--api-key <key>`。默认模型是
`whisper-1`，用于生成带时间节点的 `transcript.json`。

如果 `audio.webm` 存在但 `transcript.json` 没有文字，后续脚本只能算导航草稿，
不能当成完整业务脚本。

## 生成脚本

`record stop` 生成的 `generated-script.mjs` 默认读取 `OPENRUNTIME_CLI`。
运行生成脚本时，优先这样指定 wrapper：

```bash
OPENRUNTIME_CLI="<skill-dir>/scripts/openruntime-cli.mjs" node generated-script.mjs
```

如果运行环境不能写入缓存目录，或缺少 npm，需要用户预先提供可用的
`OPENRUNTIME_CLI` 路径。wrapper 默认设置 `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`，
不会在准备 CLI 时下载浏览器。
