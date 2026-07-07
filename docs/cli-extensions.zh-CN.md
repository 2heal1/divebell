# OpenRuntime CLI 扩展开发

English version: [OpenRuntime CLI Extension Development](cli-extensions.md)

OpenRuntime CLI 扩展可以在不修改 CLI 主流程的情况下，增加项目、团队或本机工作流命令。

当一个流程需要 agent 反复调用时，适合做成扩展。例如“打开站点、收集 release 信息、输出结构化 JSON”。如果页面本身可以暴露稳定的 Target 或 Action，优先在应用里接入 OpenRuntime Target / Action，然后在扩展里调用 `snapshot`、`runAction` 或 `waitFor`。

## 加载方式

外部扩展默认从这里加载：

```text
~/.openruntime/extensions
```

可以用环境变量覆盖目录：

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

外部命令会在 help 里单独展示，并标注来源：

```text
External Extensions:
  openruntime foo ping [external: foo]
```

查看当前加载结果：

```sh
openruntime extensions list
```

如果外部扩展和内置命令或内部扩展重名，OpenRuntime 会跳过这个外部扩展并打印警告。扩展加载失败也不会导致 CLI 崩溃，可以通过 `extensions list` 查看失败原因。

外部扩展会执行本机代码，只加载可信文件。

## 导出格式

扩展文件必须默认导出这个结构：

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
    options.stdout.write("pong\n");
    return 0;
  }
};
```

导出的对象对应 [`packages/cli/src/index.ts`](../packages/cli/src/index.ts) 里的 `OpenRuntimeCliExtension` 接口。`options.openruntime` 对应 [`packages/cli/src/extension-api.ts`](../packages/cli/src/extension-api.ts)。

## `run(options)` 参数

`run(options)` 会收到：

| 字段 | 用途 |
| --- | --- |
| `options.args` | 已解析的 CLI 输入。位置参数在 `options.args.command`，flag 在 `options.args.options`。 |
| `options.stdout` / `options.stderr` | 写命令输出。数据类命令建议 stdout 输出结构化 JSON。 |
| `options.bridgeUrl` | CLI 参数解析后的 Bridge 地址。 |
| `options.runtimeSelector` | 来自 `--runtime`、`--session`、`--url` 的 runtime 选择条件。 |
| `options.openruntime` | 稳定的 Runtime、Bridge 和浏览器 API。优先用它，不要为了调用 OpenRuntime 能力再 spawn 一次 CLI。 |
| `options.fetcher` | 低层 fetch 入口，主要用于测试和少数高级集成。大多数扩展不需要。 |
| `options.browserRunner` | 低层浏览器命令入口。除非需要未封装的浏览器命令，否则优先用 `options.openruntime.browser`。 |

## `options.openruntime` API

### Bridge 和 Runtime 选择

| API | 用途 |
| --- | --- |
| `ensureBridge({ port?, timeout? })` | 当前选择的是本地 Bridge 时，启动或复用本地 Bridge。 |
| `runtimes()` | 列出已连接 runtime。 |
| `selectRuntime(selector?)` | 使用默认 CLI 选择条件或显式条件选择一个 runtime。 |

### Runtime 资源

这些 API 会通过 Bridge 查询选中的 runtime：

| API | 用途 |
| --- | --- |
| `targets(query?, selector?)` | 读取 target 定义。 |
| `snapshot(query?, selector?)` | 读取当前 target 状态。 |
| `events(query?, selector?)` | 读取 runtime event 历史。 |
| `actions(query?, selector?)` | 列出页面声明的 action。 |

`query` 对象对应 CLI 查询参数。常用字段包括 `id`、`type`、`source`、`status`、`query`、`targetId`、`action`、`since`、`limit`。

```js
const snapshot = await options.openruntime.snapshot({
  id: "business:checkout:summary"
});

options.stdout.write(`${JSON.stringify({ result: snapshot }, null, 2)}\n`);
```

### Runtime Action

| API | 用途 |
| --- | --- |
| `inputOptions(actionName, inputName, { payload?, timeout?, selector? })` | 读取 action 某个输入项的动态候选值。 |
| `runAction(actionName, payload?, selector?)` | 执行页面声明的 action。 |
| `waitFor(targetId, status, { where?, timeout?, selector? })` | 等待 target 到达指定状态。 |

```js
const result = await options.openruntime.runAction("release-note.list-latest", {
  limit: 3
});
```

### Browser

Browser API 操作当前 OpenRuntime 浏览器会话：

| API | 用途 |
| --- | --- |
| `browser.open(url, { noBridge?, sessionId?, cookies?, ui? })` | 打开页面。默认会准备 Bridge，除非 `noBridge` 为 true。 |
| `browser.goto(url, { sessionId? })` | 让当前页面跳转。 |
| `browser.pageSnapshot()` | 读取当前页面快照。 |
| `browser.click(target)` | 按浏览器 runner 支持的 ref、选择器或文本点击。 |
| `browser.fill(target, value)` | 按 ref 或选择器填写输入框。 |
| `browser.eval(script)` | 在页面里执行 JavaScript 表达式并解析 JSON 输出。 |
| `browser.evalFile(path)` | 在页面里执行 JavaScript 文件，适合较大的脚本。 |
| `browser.waitEval(script, { timeout? })` | 轮询页面表达式，直到结果为 true。 |
| `browser.getWindow(path)` | 从 `window` / `globalThis` 读取点分路径。 |
| `browser.screenshot(name?, { fullPage? })` | 截图。 |
| `browser.network({ url? })` | 读取已记录的网络请求，可按 URL 文本过滤。 |
| `browser.console({ levels?, query?, limit? })` | 读取浏览器 console。 |
| `browser.close()` | 关闭浏览器会话。 |

页面导航和兜底检查用 Browser API。页面已经暴露结构化 Target 或 Action 时，优先用 Runtime API。

## 示例：读取 GitHub 最新 Release

创建 `~/.openruntime/extensions/github-release.mjs`：

```js
export default {
  schemaVersion: 1,
  name: "github-release",
  displayName: "GitHub Release",
  description: "Finds the latest release for module-federation/core.",
  commandReferences: [
    {
      category: "Extensions",
      usage: "openruntime github-release latest",
      description: "Open GitHub, find module-federation/core, and print the latest release."
    }
  ],
  exampleReferences: [
    {
      command: "openruntime github-release latest",
      description: "Print the latest module-federation/core release."
    }
  ],
  async run(options) {
    if (options.args.command[1] !== "latest") {
      throw new Error("Usage: openruntime github-release latest");
    }

    const browser = options.openruntime.browser;

    await browser.open("https://github.com", { noBridge: true });
    await browser.fill('input[name="q"], input[aria-label="Search GitHub"]', "module-federation/core");
    await browser.eval("document.querySelector('input[name=\"q\"], input[aria-label=\"Search GitHub\"]')?.form?.requestSubmit()");
    await browser.waitEval("location.href.includes('/search')", { timeout: 10000 });

    await browser.click('a[href="/module-federation/core"]');
    await browser.waitEval("location.pathname === '/module-federation/core' || location.pathname === '/module-federation/core/'", { timeout: 10000 });

    await browser.click('a[href="/module-federation/core/releases"]');
    const ready = await browser.waitEval("document.querySelector('a[href*=\"/module-federation/core/releases/tag/\"]') !== null", { timeout: 10000 });
    if (!ready.success) {
      throw new Error(ready.reason ?? "GitHub releases did not load.");
    }

    const latest = await browser.eval(`(() => {
      const releaseLink = document.querySelector('a[href*="/module-federation/core/releases/tag/"]');
      const release = releaseLink?.closest('[data-testid="release"]') ?? releaseLink?.closest('.Box') ?? document.body;
      const title = release?.querySelector('a[href*="/releases/tag/"], h1, h2')?.textContent?.replace(/\\s+/g, " ").trim() ?? "";
      const tag = releaseLink?.href.split("/releases/tag/").at(-1) ?? "";
      const publishedAt = release?.querySelector("relative-time")?.getAttribute("datetime") ?? "";
      const notesPreview = release?.querySelector(".markdown-body")?.textContent?.replace(/\\s+/g, " ").trim().slice(0, 500) ?? "";
      return {
        repository: "module-federation/core",
        title,
        tag,
        url: releaseLink?.href ?? location.href,
        publishedAt,
        notesPreview
      };
    })()`);

    options.stdout.write(`${JSON.stringify({ result: latest }, null, 2)}\n`);
    return 0;
  }
};
```

运行：

```sh
openruntime github-release latest
```

预期输出结构：

```json
{
  "result": {
    "repository": "module-federation/core",
    "title": "Release title",
    "tag": "v0.0.0",
    "url": "https://github.com/module-federation/core/releases/tag/v0.0.0",
    "publishedAt": "2026-01-01T00:00:00Z",
    "notesPreview": "..."
  }
}
```

## 开发规则

- 优先使用 `options.openruntime`，不要为了调用 OpenRuntime 能力再 spawn `openruntime`。
- 应用已经提供 Runtime Target 或 Action 时，优先用它们，不要解析 DOM。
- 页面导航、兜底检查、截图、console、network 使用 Browser API。
- 大段页面脚本用 `browser.evalFile`；小表达式用 `browser.eval`。
- 成功返回 `0`，失败时抛错或返回非零。
- 数据类命令的 stdout 保持机器可读。
- 补充 `commandReferences` 和 `exampleReferences`，保证 `openruntime --help` 有用。
