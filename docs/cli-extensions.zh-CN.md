# OpenRuntime CLI 命令开发指南

English version: [OpenRuntime CLI Command Development](cli-extensions.md)

## 适用场景

OpenRuntime 命令适合把项目、团队或本机工作流封装成可重复调用的页面操作命令，而不需要修改 OpenRuntime CLI 主流程。

这份指南讲的是挂载到 `openruntime` 下的页面命令。命令只操作已经由 `openruntime open <url>` 打开的页面；如果要开发一个完全独立的 CLI 命令，并且由命令自己决定打开、跳转或关闭浏览器，需要单独设计另一套能力。

典型场景包括：

- agent 需要反复执行同一套页面流程。
- 命令需要读取当前页面信息并输出结构化 JSON。
- 页面已经接入 OpenRuntime Target / Action，命令只负责查询或执行这些声明能力。
- 团队希望把项目内的常用页面操作沉淀成稳定命令。

如果页面本身可以暴露稳定的 Target 或 Action，优先在应用里接入 OpenRuntime Target / Action，然后在命令里调用 `snapshot`、`runAction` 或 `waitFor`。

## 执行边界

页面类命令只操作当前已打开页面。agent 应该先运行：

```sh
openruntime open <url>
```

然后再调用命令：

```sh
openruntime <command>
```

命令不要在内部打开、跳转、关闭或替换浏览器会话，也不需要自己选择 Bridge 或 Runtime。CLI 会把 `openruntime open <url>` 建立的页面上下文传给命令，并作为默认页面操作目标。

如果命令只支持特定 URL，在命令开头校验 `options.page.url`；不匹配时抛出 `PAGE_URL_UNSUPPORTED`：

```js
import { createError } from "@openruntime/cli";

if (options.page === undefined || !isSupportedPage(options.page.url)) {
  throw createError({
    code: "PAGE_URL_UNSUPPORTED",
    kind: "validation",
    message: "这个命令只支持 module-federation/core releases 页面。",
    hint: "运行 `openruntime open https://github.com/module-federation/core/releases`。",
    details: {
      actualUrl: options.page?.url,
      expectedUrl: "https://github.com/module-federation/core/releases"
    }
  });
}
```

## 安装与加载

命令文件默认从这里加载：

```text
~/.openruntime/commands
```

可以用环境变量覆盖目录：

```sh
OPENRUNTIME_COMMANDS_DIR=/path/to/commands openruntime commands list
```

也可以关闭外部命令加载：

```sh
OPENRUNTIME_DISABLE_COMMANDS=1 openruntime --help
```

查看当前加载结果：

```sh
openruntime commands list
```

外部命令会在 help 里单独展示，并标注来源：

```text
External Commands:
  openruntime foo ping [external: foo]
```

如果外部命令和内置命令或内部命令重名，OpenRuntime 会跳过这个外部命令并打印警告。命令加载失败也不会导致 CLI 崩溃，可以通过 `commands list` 查看失败原因。

外部命令会执行本机代码，只加载可信文件。

## 命令文件结构

支持两种文件形式：

```text
~/.openruntime/commands/foo.mjs
~/.openruntime/commands/foo/index.mjs
```

命令文件必须默认导出这个结构。推荐使用 `defineCommand(...)`，这样可以固定格式并获得类型提示：

```js
import { defineCommand } from "@openruntime/cli";

export default defineCommand({
  schemaVersion: 1,
  name: "foo",
  displayName: "Foo",
  description: "Foo command",
  commandReferences: [
    {
      category: "Commands",
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
    options.output.ok({
      result: "pong"
    });
    return 0;
  }
});
```

导出的对象对应 `OpenRuntimeCommandDefinition`。`options.openruntime` 对应 [`packages/cli/src/extension-api.ts`](../packages/cli/src/extension-api.ts)。

如果需要在测试或 CI 中直接校验导出对象，可以使用 `validateCommand(...)`：

```js
import { validateCommand } from "@openruntime/cli";
import command from "./foo.mjs";

validateCommand(command);
```

## 运行上下文：`run(options)`

### 参数总览

`run(options)` 会收到：

| 字段 | 用途 |
| --- | --- |
| `options.args` | 已解析的 CLI 输入。位置参数在 `options.args.command`，flag 在 `options.args.options`。 |
| `options.page` | 当前页面信息，来自最近一次 `openruntime open <url>`。 |
| `options.output` | 统一 JSON 输出 helper，用来写 `ok`、`needs_input` 和 `error` 结果。 |
| `options.openruntime` | 当前页面查询、页面动作和页面交互能力。 |

还有几个低层字段会保留给测试、调试或代理外部工具使用，普通命令不建议依赖：

| 字段 | 什么时候用 |
| --- | --- |
| `options.stdout` | 命令明确要输出原始文本，或者透传另一个工具的 stdout。 |
| `options.stderr` | 命令需要打印进度日志，或者透传另一个工具的 stderr。 |
| `options.fetcher` | 测试或少数高级集成需要替换底层请求实现。 |

数据类命令应优先使用 `options.output`，不要直接写 `stdout`。

### `options.args`：命令输入

`options.args.command` 包含完整命令路径。例如执行：

```sh
openruntime github-release latest --limit 3
```

命令里会看到：

```js
options.args.command; // ["github-release", "latest"]
```

flag 会出现在 `options.args.options`。命令可以基于这些输入决定具体业务行为，但页面来源仍然由 `openruntime open <url>` 决定。

### `options.page`：当前页面信息

`options.page` 来自最近一次成功执行的 `openruntime open <url>`。页面类命令应使用它确认当前页面是否符合命令要求。

字段包括：

| 字段 | 含义 |
| --- | --- |
| `url` | 用户传给 `openruntime open` 的原始页面 URL。 |
| `openedUrl` | 实际打开的 URL，可能包含 OpenRuntime 注入的 session 参数。 |
| `normalizedUrl` | 用于匹配当前页面的规范化 URL。 |
| `bridgeUrl` | 这次 open 使用的 Bridge 地址；如果没有 Bridge，则为 `null`。 |
| `sessionId` | 这次 open 分配的会话 ID；如果没有会话，则为 `null`。 |
| `openedAt` | open 记录创建时间。 |

示例：

```js
if (options.page === undefined) {
  throw createError({
    code: "OPEN_CONTEXT_REQUIRED",
    kind: "validation",
    message: "请先打开页面。",
    hint: "先运行 `openruntime open <url>`。"
  });
}
```

### `options.output`：输出和错误约定

数据类命令的 stdout 应该只输出一个 JSON 对象。使用 `options.output`，可以保证成功、需要输入和错误三种结果格式一致。

成功输出：

```js
options.output.ok({
  release: "1.2.3"
}, "已找到最新 release。");
```

当命令需要 agent 或用户先选择再继续：

```js
options.output.needsInput("请选择要查看的 release。", [
  { label: "Release 1.2.3", value: "1.2.3" },
  { label: "Release 1.2.2", value: "1.2.2" }
]);
return 1;
```

对于预期内的失败，抛出 `createError(...)`。CLI 会捕获它，并输出统一的错误 JSON。

```js
import { createError } from "@openruntime/cli";

throw createError({
  code: "RELEASE_NOT_FOUND",
  kind: "not_found",
  message: "没有找到指定 release。",
  retryable: false,
  hint: "检查 release 名称，或不传 --release 重新运行以列出候选项。",
  details: {
    release: "1.2.3"
  }
});
```

如果命令自己处理错误而不是抛出，可以调用 `options.output.error(error)`，然后返回非 0 退出码：

```js
options.output.error(createError({
  code: "RELEASE_AUTH_FAILED",
  kind: "auth",
  message: "无法读取 release 数据。",
  retryable: true,
  hint: "登录后重试。"
}));
return 1;
```

### `options.openruntime`：OpenRuntime 能力

`options.openruntime` 面向当前已打开页面。命令直接使用当前页面上下文，不需要处理底层连接。

#### 页面状态与声明查询

这些 API 用来读取当前已打开页面暴露给 OpenRuntime 的信息。

| API | 用途 |
| --- | --- |
| `targets(query?)` | 读取 target 定义。 |
| `snapshot(query?)` | 读取当前 target 状态。 |
| `events(query?)` | 读取页面 event 历史。 |
| `actions(query?)` | 列出页面声明的 action。 |

`query` 对象对应 CLI 查询参数。常用字段包括 `id`、`type`、`source`、`status`、`query`、`targetId`、`action`、`since`、`limit`。

```js
const snapshot = await options.openruntime.snapshot({
  id: "business:checkout:summary"
});

options.output.ok({
  result: snapshot
});
```

#### 页面动作与状态等待

这些 API 用来执行当前已打开页面声明的动作，或等待页面状态变化。

| API | 用途 |
| --- | --- |
| `inputOptions(actionName, inputName, { payload?, timeout? })` | 读取 action 某个输入项的动态候选值。 |
| `runAction(actionName, payload?)` | 执行页面声明的 action。 |
| `waitFor(targetId, status, { where?, timeout? })` | 等待页面声明的 target 到达指定状态。 |

```js
const result = await options.openruntime.runAction("release-note.list-latest", {
  limit: 3
});

options.output.ok({
  result
});
```

#### Browser：当前页面交互

Browser API 操作当前 OpenRuntime 浏览器会话。命令不会收到打开页面、跳转、关闭或底层 browser runner API；调用命令前先运行 `openruntime open <url>`。

| API | 用途 |
| --- | --- |
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

页面交互和兜底检查用 Browser API。页面已经暴露结构化 Target 或 Action 时，优先用页面状态和页面动作 API。

## 完整示例：读取 GitHub 最新 Release

创建 `~/.openruntime/commands/github-release.mjs`：

```js
import { createError, defineCommand } from "@openruntime/cli";

export default defineCommand({
  schemaVersion: 1,
  name: "github-release",
  displayName: "GitHub Release",
  description: "Reads the latest release from the current module-federation/core releases page.",
  commandReferences: [
    {
      category: "Commands",
      usage: "openruntime github-release latest",
      description: "Read the latest release from the current GitHub releases page."
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

    if (options.page === undefined || !isModuleFederationReleasesPage(options.page.url)) {
      throw createError({
        code: "PAGE_URL_UNSUPPORTED",
        kind: "validation",
        message: "这个命令只支持 module-federation/core releases 页面。",
        hint: "运行 `openruntime open https://github.com/module-federation/core/releases`。",
        details: {
          actualUrl: options.page?.url,
          expectedUrl: "https://github.com/module-federation/core/releases"
        }
      });
    }

    const browser = options.openruntime.browser;

    const ready = await browser.waitEval(`
      document.querySelector('a[href*="/module-federation/core/releases/tag/"]') !== null
    `, { timeout: 10000 });
    if (!ready.success) {
      throw createError({
        code: "GITHUB_RELEASE_PAGE_REQUIRED",
        kind: "validation",
        message: "请先打开 module-federation/core releases 页面。",
        hint: "运行 `openruntime open https://github.com/module-federation/core/releases`。"
      });
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

    options.output.ok({
      result: latest
    });
    return 0;
  }
});

function isModuleFederationReleasesPage(input) {
  try {
    const url = new URL(input);
    return url.origin === "https://github.com" &&
      url.pathname.replace(/\/$/, "") === "/module-federation/core/releases";
  } catch {
    return false;
  }
}
```

运行：

```sh
openruntime open https://github.com/module-federation/core/releases
openruntime github-release latest
```

预期输出结构：

```json
{
  "status": "ok",
  "data": {
    "result": {
      "repository": "module-federation/core",
      "title": "Release title",
      "tag": "v0.0.0",
      "url": "https://github.com/module-federation/core/releases/tag/v0.0.0",
      "publishedAt": "2026-01-01T00:00:00Z",
      "notesPreview": "..."
    }
  }
}
```

## 最佳实践检查清单

- 需要页面状态的命令，先运行 `openruntime open <url>`。
- 命令只操作已打开页面，不要在命令内打开、跳转或关闭浏览器会话。
- 命令只支持特定页面时，先校验 `options.page.url`。
- 优先使用 `options.output` 输出结果，不要直接写 `stdout`。
- 应用已经提供 Target 或 Action 时，优先用它们，不要解析 DOM。
- 页面交互、兜底检查、截图、console、network 使用 Browser API。
- 大段页面脚本用 `browser.evalFile`；小表达式用 `browser.eval`。
- 成功返回 `0`，失败时抛错或返回非零。
- 使用 `defineCommand(...)` 导出命令，并在测试或 CI 里调用 `validateCommand(...)` 校验。
- 补充 `commandReferences` 和 `exampleReferences`，保证 `openruntime --help` 有用。
