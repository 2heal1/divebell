# Divebell 发版流程

English version: [Divebell Release Process](release.md)

Divebell 使用一条受控流程发布所有公开包和浏览器录制运行包。普通功能或修复合并请求进入 `main` 不会触发发布。

## 发布范围

一次发版会为以下内容使用同一个版本号：

- Runtime SDK、Bridge、Chunk Map、Modern.js 插件和 Rspack 插件；
- Divebell CLI；
- `@divebell/extension-code-usage`；
- `@divebell/extension-troubleshooting`；
- `@divebell/extension-imitate`；
- `@divebell/extension-memory`；
- `record-divebell-workflow` 使用的运行包。

GitHub Release 包含录制运行包和它的 SHA-256 校验文件。所有 npm 包成功发布后，GitHub Release 才会公开。

## 新包首次发布

npm 只能为已经存在的包配置可信发布。当包名是第一次使用时，需要先用维护者账号人工发布一次当前版本，再配置 GitHub Actions 的信任关系。
Divebell 的首次发布版本统一为 `0.0.0`。

执行前确认：

- 包目录、包名和发版脚本的重命名已经在本机完成；
- 当前账号对所有 npm 包都有写权限，并且已经开启账号级两步验证；
- 已安装 Node.js 24.x；
- npm 不低于 11.15.0。

登录、构建、检查发布包，然后发布第一个版本：

```bash
npm install --global npm@11.15.0
npm login
pnpm install --frozen-lockfile
pnpm run build
pnpm run release:npm:pack -- --output-dir /tmp/divebell-npm-bootstrap
pnpm run publish:packages -- --output-dir /tmp/divebell-npm-bootstrap --otp 123456
```

把 `123456` 替换成维护者验证器当前显示的一次性验证码。这个值会传给每一次 `npm publish`；如果全部包发完前验证码已经失效，换一个新验证码重新执行即可，已经成功发布的版本会自动跳过。

发版脚本会按依赖顺序检查全部公开包，已经存在的版本会跳过。四个新的 `@divebell/extension-*` 包创建成功后，为它们配置 GitHub Actions 可信发布；如果旧包还没有配置，也可以执行下面的完整清单：

```bash
npm trust github @divebell/core --repo 2heal1/divebell --file release.yml --allow-publish --yes
npm trust github @divebell/bridge --repo 2heal1/divebell --file release.yml --allow-publish --yes
npm trust github @divebell/chunk-map --repo 2heal1/divebell --file release.yml --allow-publish --yes
npm trust github @divebell/rspack-plugin --repo 2heal1/divebell --file release.yml --allow-publish --yes
npm trust github @divebell/modern-plugin --repo 2heal1/divebell --file release.yml --allow-publish --yes
npm trust github @divebell/cli --repo 2heal1/divebell --file release.yml --allow-publish --yes
npm trust github @divebell/extension-code-usage --repo 2heal1/divebell --file release.yml --allow-publish --yes
npm trust github @divebell/extension-troubleshooting --repo 2heal1/divebell --file release.yml --allow-publish --yes
npm trust github @divebell/extension-imitate --repo 2heal1/divebell --file release.yml --allow-publish --yes
npm trust github @divebell/extension-memory --repo 2heal1/divebell --file release.yml --allow-publish --yes
```

`--file` 只填写 `release.yml`，不要填写完整的 `.github/workflows/` 路径。仓库当前发版流程已经使用 GitHub 托管环境，并授予 npm OIDC 所需的 `id-token: write` 权限。

第一次 OIDC 发版成功后，再到 npm 包设置中限制传统发布令牌。更多要求见 npm 官方的[可信发布说明](https://docs.npmjs.com/trusted-publishers/)和 [`npm trust` 命令参考](https://docs.npmjs.com/cli/v11/commands/npm-trust/)。

首批 npm 包发布并配置可信发布后，还需要为 `0.0.0` 补齐录制运行包。这是后续自动准备新版本的基线：

```bash
pnpm run build:recording-runtime -- --output-dir /tmp/divebell-recording-runtime
pnpm run verify:recording-runtime -- --output-dir /tmp/divebell-recording-runtime
gh release create recording-skill-runtime-v0.0.0 \
  /tmp/divebell-recording-runtime/divebell-recording-runtime-0.0.0.tgz \
  /tmp/divebell-recording-runtime/divebell-recording-runtime-0.0.0.tgz.sha256 \
  --target main \
  --title "Divebell 0.0.0" \
  --notes "Bootstrap recording runtime release for Divebell 0.0.0."
```

如果这个 Release 已经存在，不要覆盖；先检查其中是否已有上面两个附件。

## 准备发版

1. 打开仓库的 **Actions** 页面。
2. 选择 **Prepare Divebell Release**。
3. 从 `main` 运行流程，并选择 `patch`、`minor` 或 `major`。
4. 检查自动创建的 `release/divebell-vX.Y.Z` 合并请求，并等待 CI 通过。
5. 确认合并请求只修改公开包的版本号和录制运行包清单。
6. 将发版合并请求合入 `main`。

准备流程会先确认当前版本的 npm 包和 GitHub Release 都已存在，然后把所有公开包和录制运行包更新到同一个版本。

## 正式发布

`release/divebell-vX.Y.Z` 合并请求进入 `main` 后，会启动 **Publish Divebell Release**。这个流程会：

1. 检查分支名称、改动文件、包版本和录制运行包版本；
2. 构建所有包；
3. 通过可信发布方式发布 npm 包；
4. 构建并检查录制运行包；
5. 等 npm 全部成功后，创建 GitHub Release 并上传运行包和校验文件。

流程中断后可以安全重跑。已经存在的 npm 版本会跳过，尚未公开的 GitHub Release 可以重新上传附件。如果已经公开的 Release 缺少附件，流程会停止并保留现场。

## 本地检查

准备发版前运行：

```bash
pnpm run check
pnpm run release:npm:check
pnpm run release:npm:pack -- --output-dir /tmp/divebell-npm-packages
pnpm run build:recording-runtime -- --output-dir /tmp/divebell-recording-runtime
pnpm run verify:recording-runtime -- --output-dir /tmp/divebell-recording-runtime
```

正常发版不要手工发布单个包。统一流程负责保证发布顺序、版本一致和 GitHub Release 附件完整。

## 临时浏览器包

Divebell CLI 当前仍包含一个临时的 Divebell 版 `agent-browser`，用于内存和代码覆盖率采集。使用原因、恢复正式版本的条件和迁移检查项见[临时使用 Divebell 版 agent-browser](temporary-agent-browser-fork.zh-CN.md)。
