# CLI Extension 本地开发 Demo

English version: [CLI Extension Local Development Demo](README.md)

这份 demo 对应[中文开发指南](../../docs/cli-extensions.zh-CN.md)，字段和方法说明见 [Extension API 参考](../../docs/extension-api.zh-CN.md)。它展示：

- 入口只声明命令和 Hook，实际实现按需加载。
- 从 `options.args` 读取子命令和重复选项。
- 通过 `options.output` 返回成功或需要补充操作的结果。
- 检查 `options.page`，并通过 `options.openruntime.browser` 读取当前页面。
- 使用 `open`、`detectStack` 和 `close` Hook。

## 在仓库中运行

先在仓库根目录安装依赖并构建 CLI：

```sh
pnpm install
pnpm --filter @openruntime/cli build
```

加载 demo 并检查命令是否出现：

```sh
OPENRUNTIME_EXTENSIONS_DIR="$PWD/demos/cli-extension/index.mjs" \
  node packages/cli/dist/bin.js --help
```

运行不需要页面的命令：

```sh
OPENRUNTIME_EXTENSIONS_DIR="$PWD/demos/cli-extension/index.mjs" \
  node packages/cli/dist/bin.js extension-demo hello --name Codex
```

再验证页面流程：

```sh
export OPENRUNTIME_EXTENSIONS_DIR="$PWD/demos/cli-extension/index.mjs"
node packages/cli/dist/bin.js open https://example.com --no-bridge
node packages/cli/dist/bin.js extension-demo page
node packages/cli/dist/bin.js stack --refresh
node packages/cli/dist/bin.js close
```

`page` 会返回页面地址、标题以及 `open` Hook 注入的标记；`stack` 会识别出 `OpenRuntime CLI Extension Demo`。

## 运行 demo 测试

```sh
pnpm --dir demos/cli-extension test
```

测试不启动浏览器，用代表性输入检查参数、输出、页面缺失和 Hook。发布真实扩展前，还需要按开发指南在目标页面上走一遍完整流程。
