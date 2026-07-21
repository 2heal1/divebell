# 使用 OpenRuntime CLI 编写自动化脚本

English version: [Automating with OpenRuntime CLI](cli-automation-scripts.md)

这份文档讲的是独立自动化脚本：脚本自己负责打开页面、等待页面、操作页面、读取 Runtime 信息，并在需要时停止 CLI 管理的浏览器和 Bridge。和 [`OpenRuntime CLI 命令开发指南`](cli-extensions.zh-CN.md) 里的页面命令不同，自动化脚本可以管理浏览器生命周期。

## 适用场景

OpenRuntime CLI 自动化脚本适合把一段完整页面流程写成可重复执行的本机脚本、CI 脚本或 agent 工具脚本。

典型场景包括：

- 导入并复用测试账号登录状态，在同一个 session 中运行受保护页面流程。
- 打开一个本地或线上页面并等待它可用。
- 对页面做点击、输入、截图、Console、Network 等浏览器检查。
- 页面已经接入 OpenRuntime Target / Action，需要读取结构化状态或执行业务动作。
- 在 CI 或本机任务里跑一段稳定的页面验收流程。
- 把多个 OpenRuntime CLI 命令组合成一个更高层的自动化入口。

如果页面已经暴露与任务相关的稳定 Target 或 Action，脚本可以调用 `snapshot`、`run-action`、`wait-for`，或使用 `verify` 检查已有 business target。普通页面可以直接使用明确的页面、请求或 Extension 结果，不需要为了编写脚本先接入 Runtime Core。

脚本确实要验证已有 business target 时，先安装提供 `verify` 的扩展包：

```sh
openruntime extensions add @openruntime/extension-troubleshooting
```

## 为什么用 OpenRuntime 写脚本

把固定流程写成 OpenRuntime CLI 自动化脚本，核心收益是稳定和离线化。

- 稳定：脚本把流程拆成明确步骤，每一步都有命令、等待条件和退出码。
- 可重复：同一套流程可以在本机、CI 或 agent 环境里反复执行。
- 可离线化：流程沉淀成本地脚本后，不需要 agent 每次重新规划页面操作。
- 可观测：脚本可以输出 JSON，也可以在失败时保留 screenshot、console、network 信息。
- 更可靠：页面接入 Runtime 后，脚本可以用 Target 和 Action 判断业务状态，而不是只依赖 DOM。

## 从固定流程到自动化脚本

编写脚本时，先把人工流程拆成 OpenRuntime CLI 步骤：

1. 确认输入：页面 URL、session、timeout。
2. 打开页面：`openruntime open <url>`。
3. 等待页面稳定：`wait-eval` 或 `wait-for`。
4. 执行操作：`click`、`fill`、`eval` 或 `run-action`。
5. 验证结果：选择与任务匹配的 Extension、Runtime 状态、页面结果或请求结果。
6. 整理输出：脚本最终输出一个 JSON 对象。

每一步都应该有明确的成功条件。不要只写“打开页面后马上点击”，要先等页面或业务状态到达可操作状态。

## 安装与运行

Shell 脚本只需要当前环境能执行 `openruntime`：

```sh
openruntime --help
```

Node.js 脚本需要能解析 `@openruntime/cli`：

```js
import { runCli } from "@openruntime/cli";
```

脚本可以放在项目自己的 `scripts/` 目录，例如：

```text
scripts/check-home.sh
scripts/check-home.mjs
scripts/release-latest.mjs
```

运行方式示例：

```sh
bash scripts/check-home.sh http://localhost:3000
node scripts/check-home.mjs http://localhost:3000
```

## 依赖处理

如果脚本只在当前项目里运行，推荐把 `@openruntime/cli` 放进项目依赖，让脚本和项目使用同一套版本：

```sh
pnpm add -D @openruntime/cli
```

如果脚本只通过 Shell 调用 `openruntime`，也可以依赖全局安装或 CI 里预装的 CLI，但需要在运行前检查：

```sh
openruntime --help
```

OpenRuntime CLI 的浏览器能力依赖 Playwright 运行环境。CI 或干净机器上需要提前准备浏览器依赖；项目内脚本建议把安装步骤写进项目的安装或 CI 流程。是否把 Playwright 和浏览器一起打包，取决于脚本分发方式：

- 项目内使用：把 `@openruntime/cli` 放到项目依赖，CI 安装依赖和浏览器。
- 本机工具脚本：要求使用者先安装 CLI 和浏览器运行环境。
- 独立分发脚本：提供明确的安装脚本或安装文档，不要假设机器上已经有浏览器依赖。

## 脚本文件结构

Shell 脚本通常包含：

- 输入参数解析。
- `openruntime open <url>`。
- 等待与页面操作。
- Runtime 查询或浏览器检查。
- 统一输出结果。
- 可选的 `openruntime stop`。

Node.js 脚本建议封装一个小的 `opr(args)` helper，用来捕获 stdout、stderr 和退出码：

```js
import { runCli } from "@openruntime/cli";

async function opr(args) {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(args, {
    stdout: {
      write(chunk) {
        stdout += chunk;
      }
    },
    stderr: {
      write(chunk) {
        stderr += chunk;
      }
    }
  });

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `openruntime ${args.join(" ")} failed`);
  }

  return stdout.trim();
}
```

## 编写脚本步骤

完整 CLI 命令和参数见 [`CLI Reference`](cli-reference.md)。Bridge 自动连接和多 Runtime 选择见 [浏览器连接与多 Runtime 使用指南](runtime-connections.zh-CN.md)。本教程只展示把固定流程写成脚本时最常用的步骤。

### 准备脚本输入

自动化脚本主要围绕这些输入组织：

| 参数 | 用途 |
| --- | --- |
| `url` | 要打开的页面地址。 |
| `session` | 当前脚本使用的会话标识；并发或 Runtime 查询时建议显式设置。 |
| `timeout` | 等待页面或 Runtime 状态的超时时间。 |
| `headless/ui` | 默认静默运行；需要可见浏览器时给 `open` 加 `--ui`。 |
| `bridge` | 默认自动准备本地 Bridge，并在跳转前放入连接管理器，连接页面注册的所有 runtime；需要连接指定 Bridge 时传 `--bridge <url>`，不需要连接时传 `--no-bridge`。 |

### 打开页面

基础写法：

```sh
openruntime open http://localhost:3000
```

带 session：

```sh
openruntime open http://localhost:3000 --session check-home
```

打开可见浏览器：

```sh
openruntime open http://localhost:3000 --ui
```

`open` 成功时会输出统一 JSON，`data` 里包含：

| 字段 | 含义 |
| --- | --- |
| `url` | 传给 `open` 的原始 URL。 |
| `openedUrl` | 实际打开的 URL，可能包含 OpenRuntime session 参数。 |
| `normalizedUrl` | 用于匹配当前页面的规范化 URL。 |
| `bridgeUrl` | 本次 open 使用的 Bridge 地址；`--no-bridge` 时为 `null`。 |
| `sessionId` | 本次 open 使用的 session。 |
| `openedAt` | 打开页面的时间戳。 |

### 页面等待与操作

等待页面完成基础加载：

```sh
openruntime wait-eval "document.readyState === 'complete'" --timeout 10000
```

等待页面出现指定文本：

```sh
openruntime wait-eval "document.body.innerText.includes('Ready')" --timeout 10000
```

截图：

```sh
openruntime screenshot home-ready
```

读取页面可交互元素：

```sh
openruntime page-snapshot
```

点击和输入：

```sh
openruntime click "Submit"
openruntime fill "#email" "dev@example.com"
```

### 可选的 Runtime 查询与动作

下面命令只用于已经接入 Runtime Core、并且信号与当前任务相关的页面。普通页面跳过本节，继续使用浏览器或 Extension 验证。

读取当前页面 snapshot：

```sh
openruntime snapshot --session check-home
```

等待业务 Target ready：

```sh
openruntime wait-for business:home ready --session check-home --timeout 10000
```

执行业务 Action：

```sh
openruntime run-action release-note.list-latest --session check-home --payload '{"limit":3}'
```

页面已经有 business target、并且安装了 troubleshooting Extension 时，可以执行：

```sh
openruntime verify business:home ready --session check-home --timeout 10000
```

### 输出和错误约定

脚本内部可以调用多条 `openruntime` 命令，但脚本最终建议只输出一个 JSON 对象，方便 agent 或 CI 读取。

成功示例：

```json
{
  "status": "ok",
  "url": "http://localhost:3000",
  "session": "check-home",
  "ready": true
}
```

失败时返回非零退出码，并把错误信息写到 stderr。Shell 脚本可以用 `set -euo pipefail`；Node.js 脚本可以在 helper 里检查 `exitCode`。

## Node.js API

Node.js 脚本使用 `@openruntime/cli` 导出的 `runCli(args, options)`。它和命令行使用同一套参数，区别是不用启动子进程，可以直接在脚本里捕获输出。

```js
import { runCli } from "@openruntime/cli";

const exitCode = await runCli(["open", "http://localhost:3000"]);
```

推荐封装一个 helper，统一处理 stdout、stderr 和退出码：

```js
import { runCli } from "@openruntime/cli";

async function opr(args) {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(args, {
    stdout: {
      write(chunk) {
        stdout += chunk;
      }
    },
    stderr: {
      write(chunk) {
        stderr += chunk;
      }
    }
  });

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `openruntime ${args.join(" ")} failed`);
  }

  return stdout.trim();
}

const opened = JSON.parse(await opr(["open", "http://localhost:3000"]));
```

`args` 的写法和命令行一致：

```js
await opr(["open", url, "--session", session]);
await opr(["wait-eval", "document.readyState === 'complete'", "--timeout", "10000"]);
await opr(["snapshot", "--session", session]);
await opr(["run-action", "release-note.list-latest", "--payload", "{\"limit\":3}"]);
```

当前没有单独的 `open()` 函数。Node.js 脚本里打开页面时，使用 `runCli(["open", url])`。

## 完整示例：打开页面、等待并截图

创建 `scripts/check-home.mjs`：

```js
import { runCli } from "@openruntime/cli";

async function opr(args) {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(args, {
    stdout: {
      write(chunk) {
        stdout += chunk;
      }
    },
    stderr: {
      write(chunk) {
        stderr += chunk;
      }
    }
  });

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `openruntime ${args.join(" ")} failed`);
  }

  return stdout.trim();
}

async function main() {
  const url = process.argv[2] ?? "http://localhost:3000";
  const session = `check-home-${Date.now()}`;

  const opened = JSON.parse(await opr(["open", url, "--session", session]));
  const ready = JSON.parse(await opr([
    "wait-eval",
    "document.readyState === 'complete'",
    "--timeout",
    "10000"
  ]));

  await opr(["screenshot", "home-ready"]);

  let targetCount = null;
  try {
    const snapshot = JSON.parse(await opr(["snapshot", "--session", session]));
    targetCount = Object.keys(snapshot.result?.targets ?? {}).length;
  } catch {
    targetCount = null;
  }

  console.log(JSON.stringify({
    status: "ok",
    url: opened.data.url,
    session: opened.data.sessionId,
    ready: ready.success === true,
    targetCount
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
```

运行：

```sh
node scripts/check-home.mjs http://localhost:3000
```

输出示例：

```json
{
  "status": "ok",
  "url": "http://localhost:3000",
  "session": "check-home-1760000000000",
  "ready": true,
  "targetCount": 4
}
```

如果页面没有接入 OpenRuntime Runtime，`targetCount` 会是 `null`，浏览器层检查仍然可以继续工作。

## Shell / CI 最小写法

如果流程很简单，只是想在 CI 或本机检查里串几条 `openruntime` 命令，不需要写 Node.js 脚本。下面这个 Shell 脚本做三件事：打开页面、等待页面加载完成、截图并输出最终 JSON。

创建 `scripts/check-home.sh`：

```sh
#!/usr/bin/env bash
set -euo pipefail

URL="${1:-http://localhost:3000}"
SESSION="check-home-$(date +%s)"

openruntime open "$URL" --session "$SESSION"
openruntime wait-eval "document.readyState === 'complete'" --timeout 10000
openruntime screenshot home-ready

printf '{"status":"ok","url":"%s","session":"%s"}\n' "$URL" "$SESSION"
```

运行：

```sh
bash scripts/check-home.sh http://localhost:3000
```

复杂流程建议使用上面的 Node.js 写法。Shell 更适合这种线性的最小检查脚本。
