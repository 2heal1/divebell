# OpenRuntime CLI 扩展开发指南

English version: [OpenRuntime CLI Extension Development](cli-extensions.md)

## 扩展可以提供什么

OpenRuntime 扩展是统一的安装和加载单位。一个扩展可以同时提供：

- `commands`：挂载到 `openruntime` 下的自定义命令。
- `hooks.open`：页面真正打开前执行，可提供需要提前注入的脚本。
- `hooks.detectStack`：由 `openruntime stack` 按需执行，识别当前页面技术栈。
- `hooks.close`：页面关闭时清理这个扩展在 `open` 阶段创建的额外资源。
- 命令对应的本地 `SKILL.md`。

页面命令只操作最近一次 `openruntime open <url>` 打开的页面。需要自己管理完整浏览器流程时，使用[自动化脚本](cli-automation-scripts.zh-CN.md)。

## 安装与管理

```sh
openruntime extensions add @scope/package
openruntime extensions list
openruntime extensions update @scope/package
openruntime extensions remove @scope/package
```

扩展默认安装到：

```text
~/.openruntime/extensions
```

可以修改目录或关闭外部扩展加载：

```sh
OPENRUNTIME_EXTENSIONS_DIR=/path/to/extensions openruntime --help
OPENRUNTIME_DISABLE_EXTENSIONS=1 openruntime --help
```

扩展会执行本机代码，只安装和加载可信内容。

## npm 包入口

扩展包不能声明运行依赖，发布内容必须包含运行所需代码。`package.json` 使用 `openruntime.extensions` 声明一个或多个扩展入口：

```json
{
  "name": "@scope/package",
  "version": "1.0.0",
  "type": "module",
  "openruntime": {
    "schemaVersion": 1,
    "extensions": ["./dist/extension.js"]
  }
}
```

本机开发也可以直接使用：

```text
~/.openruntime/extensions/foo.mjs
~/.openruntime/extensions/foo/index.mjs
```

## 扩展声明

OpenRuntime 启动时会读取所有扩展入口，因此入口必须保持轻量，只做声明。真正的命令和 Hook 实现使用 `await import()` 按需加载。

```ts
import type { OpenRuntimeExtensionDefinition } from "@openruntime/cli";

const extension = {
  schemaVersion: 1,
  name: "foo",
  description: "Foo 页面能力",
  commands: [{
    name: "foo",
    commandReferences: [{
      category: "Extensions",
      usage: "openruntime foo ping",
      description: "执行 Foo 页面操作。"
    }],
    run: async options =>
      await (await import("./commands/foo.js")).runFoo(options)
  }],
  hooks: {
    open: async options =>
      await (await import("./hooks/open.js")).open(options),
    detectStack: async options =>
      await (await import("./hooks/detect-stack.js")).detectStack(options),
    close: async options =>
      await (await import("./hooks/close.js")).close(options)
  }
} satisfies OpenRuntimeExtensionDefinition;

export default extension;
```

入口文件不得直接引用实际实现，也不要在顶层执行初始化、文件读取、网络请求或 `await`。相对动态导入必须带 `.js` 后缀。

测试或 CI 可以调用 `validateExtension(...)` 校验默认导出。

## Hook 约定

### `open`

`open` 在浏览器真正打开 URL 前执行。它可以返回一个或多个页面初始化脚本：

```ts
export async function open() {
  return {
    scripts: ["globalThis.__TEAM_MARKER__ = true;"]
  };
}
```

多个扩展的脚本会和 OpenRuntime 自身的初始化脚本合并。某个扩展失败不会阻止其他扩展或页面继续打开。

### `detectStack`

`detectStack` 只在运行 `openruntime stack` 时执行，不会拖慢 `openruntime open`。

```ts
export async function detectStack({ openruntime }) {
  const detected = await openruntime.browser.eval(
    "globalThis._MODERNJS_ROUTE_MANIFEST != null"
  );
  if (!detected) return;
  return {
    id: "modernjs",
    name: "Modern.js",
    evidence: ["window._MODERNJS_ROUTE_MANIFEST"],
    recommendedExtensions: ["@scope/modern-tools"]
  };
}
```

结果可以包含 `id`、`name`、可选版本、简单判断依据和推荐扩展。不要返回页面里的完整配置或其他敏感内容。多个识别器并行执行，结果统一由 `openruntime stack` 汇总。

相同页面和相同识别器集合会复用最近结果；使用 `openruntime stack --refresh` 强制重新识别。

### `close`

`close` 只会通知本次 `open` 时成功参与过的扩展。清理失败会被记录，但不会阻止浏览器关闭。

## 自定义命令

命令的 `run(options)` 可以使用：

| 字段 | 用途 |
| --- | --- |
| `options.args` | 已解析的命令和参数。 |
| `options.page` | 最近一次成功打开的页面信息。 |
| `options.output` | 输出统一的成功、补充输入或错误结果。 |
| `options.openruntime` | 读取 Runtime、操作当前页面和等待结果。 |
| `options.stdout` / `options.stderr` | 少量需要原始文本或进度日志的场景。 |

页面操作入口包括 `browser.eval`、`browser.evalFile`、`browser.getWindow`、`browser.click`、`browser.fill`、截图、网络和 Console。结构化业务状态优先使用 `snapshot`、`runAction` 和 `waitFor`。

## Skill

命令可以声明一个绝对路径指向现有 `SKILL.md`：

```ts
{
  name: "foo",
  skill: { path: fileURLToPath(new URL("./SKILL.md", import.meta.url)) },
  run: async options => await (await import("./foo.js")).runFoo(options)
}
```

`openruntime foo --skill` 只输出这个文件的路径，不执行命令。

## 验证要求

- 确认运行无关命令时，实际实现没有被加载。
- 分别验证 `open`、`stack` 和 `close` 只触发对应 Hook。
- 验证一个 Hook 失败时其他扩展仍能工作。
- 页面类命令先运行 `openruntime open <url>`，再用真实或代表性页面验证结果。
