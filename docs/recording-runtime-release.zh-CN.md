# 发布录制 Skill 运行包

录制 Skill 使用的运行包不提交到 Git。仓库只保存版本清单，真正的压缩包和校验文件由 GitHub Actions 构建并上传到 GitHub Release。用户首次使用时下载一次，之后按版本复用本地缓存。

## 首次启用

在仓库的 **Settings > Actions > General > Workflow permissions** 中启用：

- **Read and write permissions**
- **Allow GitHub Actions to create and approve pull requests**

当前改动第一次合入 `main` 后，`Publish Recording Skill Runtime` 会自动：

1. 构建运行包并做一次真实安装验证。
2. 创建 `recording-skill-runtime-v0.1.0` Release。
3. 上传运行包和对应的 `.sha256` 校验文件。
4. 发布 Release。

第一次合并建议使用 **Squash and merge**，合并后删除功能分支。这样早期曾经提交过的 `.tgz` 文件不会进入 `main` 的可达历史。

## 后续发版

1. 打开仓库的 **Actions** 页面。
2. 选择 **Prepare Recording Skill Runtime Release**。
3. 点击 **Run workflow**，选择 `patch`、`minor` 或 `major`。
4. 流程会创建 `release/recording-skill-runtime-v<version>` 分支和一个合并请求。
5. 检查并合入这个合并请求。
6. 合入 `main` 后，发布流程会自动创建并发布对应 Release。

不需要手工上传附件。发布完成后，Release 中应同时存在：

```text
openruntime-recording-runtime-<version>.tgz
openruntime-recording-runtime-<version>.tgz.sha256
```

Skill 读取 `skills/record-openruntime-workflow/references/openruntime-cli-runtime.json` 中的固定地址，不使用“最新版本”地址。每次升级版本都由发版合并请求同步更新文件名、下载地址和标签。

## 失败重试

- 发布过程中断且 Release 仍是草稿时，可以直接重新运行，附件会被重新上传。
- Release 已发布且两个附件齐全时，重复运行会直接结束。
- Release 已发布但附件缺失时，流程会失败并保留现场，不会静默修改已经发布的内容。

## 本地验证

```bash
pnpm run build
pnpm run build:recording-runtime -- --output-dir /tmp/openruntime-recording-runtime
pnpm run verify:recording-runtime -- --output-dir /tmp/openruntime-recording-runtime
```

验证会在一个全新的临时目录中安装运行包并运行 CLI，然后再运行一次确认缓存可以复用。
