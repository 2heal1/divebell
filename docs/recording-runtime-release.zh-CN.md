# OpenRuntime 发版流程

OpenRuntime 使用一条受控发版链路，同时发布四个 npm 包和录制 Skill 运行包。普通功能分支合入 `main` 不会触发发布。

```text
手动运行 Prepare OpenRuntime Release
→ 自动创建 release/openruntime-vX.Y.Z 分支
→ 自动修改版本号并创建合并请求
→ CI 通过后由维护者确认合入
→ 使用 npm OIDC 发布四个包
→ npm 全部成功后创建 GitHub Release
→ 上传 Skill 运行包和 SHA-256 文件
```

## 一次性初始化

npm 只允许给已经存在的包配置可信发布者。因此第一次启用 OIDC 前，需要用维护者账号把当前版本发布一次：

```bash
npm login
npm install --global npm@11.15.0
pnpm run build
node scripts/npm-release.mjs publish --output-dir /tmp/openruntime-npm-bootstrap
```

这个命令按依赖顺序发布：

- `@openruntime/core`
- `@openruntime/bridge`
- `@openruntime/modern-plugin`
- `@openruntime/cli`

已经存在的同版本包会跳过，所以中途中断后可以直接重试。

四个包都存在后，分别打开 npm 包的 **Settings > Trusted Publisher**，填写同一组配置：

| 字段 | 值 |
| --- | --- |
| Provider | GitHub Actions |
| Organization or user | `2heal1` |
| Repository | `openruntime` |
| Workflow filename | `release.yml` |
| Environment name | 留空 |
| Allowed actions | `npm publish` |

文件名必须完全一致，只填写文件名，不填写 `.github/workflows/` 路径。也可以在已启用两步验证的维护者账号下直接运行：

```bash
npm trust github @openruntime/core --repo 2heal1/openruntime --file release.yml --allow-publish --yes
npm trust github @openruntime/bridge --repo 2heal1/openruntime --file release.yml --allow-publish --yes
npm trust github @openruntime/modern-plugin --repo 2heal1/openruntime --file release.yml --allow-publish --yes
npm trust github @openruntime/cli --repo 2heal1/openruntime --file release.yml --allow-publish --yes
```

如果某个包还不存在，`npm trust` 会拒绝配置，应先完成上面的首次发布。配置完成后，本地运行：

```bash
node scripts/npm-release.mjs check
```

确认 OIDC 发布成功一次后，可以在 npm 的 Publishing access 中禁止传统发布令牌。

## 后续发版

1. 打开仓库 **Actions** 页面。
2. 选择 **Prepare OpenRuntime Release**。
3. 点击 **Run workflow**，选择 `patch`、`minor` 或 `major`。
4. 流程检查当前版本已经存在于 npm 和 GitHub Release。
5. 流程创建 `release/openruntime-v<version>` 分支和合并请求。
6. 检查版本变化并等待 CI 通过。
7. 合入 `main`。
8. **Publish OpenRuntime Release** 自动通过 OIDC 发布 npm 包。
9. npm 全部发布成功后，自动创建 GitHub Release 并上传录制运行包。

发版合并请求只允许修改四个 `package.json` 和录制运行包版本清单。分支名称、四个 npm 包版本和运行包版本必须完全一致，否则发布会停止。

## 发布结果

每次发版包含相同版本的四个 npm 包，以及 GitHub Release 中的：

```text
openruntime-recording-runtime-<version>.tgz
openruntime-recording-runtime-<version>.tgz.sha256
```

Skill 读取 `skills/record-openruntime-workflow/references/openruntime-cli-runtime.json` 中的固定地址，校验 SHA-256 后按版本缓存，不使用“最新版本”地址。

## 失败重试

- npm 某个包已经发布时会跳过，不会重复发布相同版本。
- npm 没有全部成功前，不会创建 GitHub Release。
- GitHub Release 仍是草稿时，重跑会重新上传附件并发布。
- GitHub Release 已发布且附件齐全时，重跑会直接结束。
- GitHub Release 已发布但附件缺失时，流程会失败并保留现场。

## 本地验证

```bash
pnpm run build
node scripts/npm-release.mjs pack --output-dir /tmp/openruntime-npm-packages
pnpm run build:recording-runtime -- --output-dir /tmp/openruntime-recording-runtime
pnpm run verify:recording-runtime -- --output-dir /tmp/openruntime-recording-runtime
```

npm OIDC 要求 GitHub 托管的运行环境、Node.js 22.14.0 以上和 npm 11.5.1 以上。工作流不使用 `NPM_TOKEN`。
