# OpenRuntime CLI 资源

本 skill 自带 OpenRuntime CLI 的本地包资源，避免用户机器没有全局 `openruntime`
命令时直接失败。

## 统一入口

录制前先用 probe 做快速检测：

```bash
node <skill-dir>/scripts/probe-openruntime-cli.mjs
```

probe 只检查环境，不安装依赖，不打开浏览器。它总是输出 JSON，`candidates`
描述可复用的本机 CLI，`bundled` 描述 skill 自带 CLI 资源。

真正执行 OpenRuntime 命令时，通过 wrapper 调用 CLI：

```bash
node <skill-dir>/scripts/openruntime-cli.mjs <openruntime-args>
```

例如：

```bash
node <skill-dir>/scripts/openruntime-cli.mjs record start --mic
node <skill-dir>/scripts/openruntime-cli.mjs record stop --out <start-output-path>
```

## wrapper 行为

1. 如果设置了 `OPENRUNTIME_CLI`，直接使用该路径。
2. 如果已从 skill 资源安装过 CLI，直接使用缓存里的命令。
3. 如果未安装，会用离线模式从 `references/openruntime-cli/` 下的 tarball 安装：
   - `next-playwright-16.2.0-canary.80.tgz`
   - `source-map-js-1.2.1.tgz`
   - `playwright-core-1.60.0.tgz`
   - `playwright-1.60.0.tgz`
   - `vercel-next-browser-0.7.1.tgz`
   - `openruntime-core-0.1.0.tgz`
   - `openruntime-bridge-0.1.0.tgz`
   - `openruntime-cli-0.1.0.tgz`
4. 如果本地资源安装失败，再尝试系统里的 `openruntime` 或 `open-runtime`。

默认安装缓存目录：

```text
~/.cache/record-openruntime-workflow/openruntime-cli
```

需要改缓存目录时，设置：

```bash
OPENRUNTIME_SKILL_CLI_HOME=<path>
```

默认安装超时是 60 秒。需要调整时，设置：

```bash
OPENRUNTIME_SKILL_CLI_INSTALL_TIMEOUT_MS=<milliseconds>
```

## 生成脚本

`record stop` 生成的 `generated-script.mjs` 默认读取 `OPENRUNTIME_CLI`。
运行生成脚本时，优先这样指定 wrapper：

```bash
OPENRUNTIME_CLI="<skill-dir>/scripts/openruntime-cli.mjs" node generated-script.mjs
```

如果运行环境不能写入缓存目录，或缺少 npm，需要用户预先提供可用的
`OPENRUNTIME_CLI` 路径。wrapper 默认设置 `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`，
不会在准备 CLI 时下载浏览器。
