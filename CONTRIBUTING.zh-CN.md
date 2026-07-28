# 为 Divebell 做贡献

[English](./CONTRIBUTING.md) | 中文

感谢你参与 Divebell。本指南说明如何准备开发环境、开发各个包、运行当前仓库里的 CLI，以及提交
Pull Request 前如何验证改动。

## 环境要求

- Node.js 24.13.0。准确版本记录在 `.nvmrc` 和 `.node-version` 中。
- pnpm 10.18.1。根目录 `package.json` 记录了支持的版本范围。
- Git。

如果本机支持 Corepack，可以这样准备项目要求的 pnpm：

```bash
corepack enable
corepack prepare pnpm@10.18.1 --activate
```

## 初始化项目

克隆仓库，并安装根目录和各个正式包的依赖：

```bash
git clone https://github.com/2heal1/divebell.git
cd divebell
pnpm --filter . --filter "./packages/*" install --frozen-lockfile
pnpm build
```

这里使用的安装范围与 CI 一致，不会安装可能依赖其他本地框架仓库的可选演示项目。

## 运行当前仓库里的 CLI

在仓库根目录执行：

```bash
./divebell --help
```

`./divebell` 直接指向当前仓库的 `packages/cli/dist/bin.js`，不会误用电脑上全局安装或已经发布的
`divebell` 命令。

修改 CLI、Runtime SDK 或 Bridge 后，先重新构建 CLI 及其引用的包，再运行命令：

```bash
pnpm --filter @divebell/cli build
./divebell <command> [options]
```

CLI 会按当前工作目录保存页面和浏览器上下文。一般的 CLI 开发可以在仓库根目录使用
`./divebell`。如果测试场景需要使用其他工作目录，可以在那个目录直接运行同一个入口：

```bash
/absolute/path/to/divebell/divebell <command> [options]
```

## 目录结构

- `packages/core`：可选的页面侧 Runtime SDK API。
- `packages/bridge`：连接页面 Runtime 和 CLI。
- `packages/cli`：提供 `divebell` 命令。
- `packages/extension-*`：各类专项 Extension。
- `packages/chunk-map`、`packages/modern-plugin` 和 `packages/rspack-plugin`：构建和框架接入。
- `demos`：有代表性的应用和 Extension 示例。
- `docs`：中英文用户文档和开发文档。
- `skills`：供 Coding Agent 复用的说明和运行资源。
- `scripts`：项目检查、文档生成和发布工具。

## 日常开发流程

1. 基于最新的 `main` 创建一个范围清晰的分支。
2. 用尽可能小且完整的改动解决问题。
3. 在受影响的包中新增或更新测试。
4. 开发过程中持续构建并测试受影响的包。
5. 创建 Pull Request 前运行完整项目检查。

常用命令：

```bash
# 构建所有包
pnpm build

# 构建单个包
pnpm --filter @divebell/cli build

# 测试单个包
pnpm --filter @divebell/cli test

# 测试所有包
pnpm test

# 运行提交前的完整检查
pnpm check
```

每个包的测试放在对应的 `test` 目录中。测试应该可以稳定重复运行，不能依赖个人账号、未提交文件或
某台电脑上的固定路径。

## 文档和 CLI 帮助

修改已经写入文档的行为时，中英文文档需要保持一致。

CLI 命令参考由 CLI 帮助信息生成。修改命令名、选项或帮助文字后，执行：

```bash
pnpm docs:cli
pnpm docs:cli:check -- --no-build
```

不要手动修改 `docs/cli-reference.md` 或 `docs/cli-reference.zh-CN.md`。

## 设计边界

- Divebell 是面向 Coding Agent 的 Web 开发调试工具。不要重新使用旧的 “Agent Runtime”
  产品名。
- Runtime SDK 是可选能力。没有接入 Runtime SDK 的页面仍然必须可以使用浏览器操作、诊断、
  登录状态复用和 Extension。
- 可以在页面外完成并值得复用的能力优先做成 Extension。只有应用内部事实、声明动作和稳定等待条件
  才应该接入 Runtime SDK。
- Modern.js 接入应该放在 Modern.js plugin 中；Module Federation 接入应该放在 Module
  Federation observability plugin 中。优先使用框架提供的 hook，不要做脆弱的页面探测。
- 条件允许时，修改后应回到问题发生时相同的账号、环境和用户路径完成验证。

改动开发调试闭环、Extension 或 Runtime SDK 前，请先阅读：

- [Coding Agent 开发调试闭环](./docs/agent-devloop.zh-CN.md)
- [CLI Extension 开发指南](./docs/cli-extensions.zh-CN.md)
- [Runtime SDK API](./docs/runtime-sdk-api.zh-CN.md)

## Changeset

会影响已发布包的改动需要添加 changeset：

```bash
pnpm changeset
```

选择受影响的包，并用一句话说明用户可以感知到的结果。只改文档，或只增加 `./divebell` 这类
仓库内部入口时，不需要 changeset。

## Pull Request 提交清单

创建 Pull Request 前，请确认：

- 改动包含范围清晰的测试，并且测试已经通过；
- `pnpm check` 已经通过；
- 修改 CLI 帮助信息后，生成的命令参考已经更新；
- 中英文文档内容一致；
- 影响已发布包的改动包含 changeset；
- 没有提交登录信息、浏览器状态、本地产物或机器固定路径。

Pull Request 描述应直接说明问题、改动后的结果和实际验证依据。发布维护者的操作见
[发版流程](./docs/release.zh-CN.md)；普通贡献不应手动发布任何包。
