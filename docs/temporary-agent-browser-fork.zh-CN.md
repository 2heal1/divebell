# Divebell 临时使用的 agent-browser 版本

English version: [Temporary agent-browser Build Used by Divebell](temporary-agent-browser-fork.md)

## 当前状态

Divebell CLI 暂时固定使用：

```text
@divebell/agent-browser@0.33.1-divebell.1
```

这个包来自 agent-browser 临时分支，增加了 Divebell 内存诊断和代码覆盖率
采集所需的能力。Divebell 会直接使用随 CLI 安装的这个版本；只有设置
`DIVEBELL_AGENT_BROWSER_EXECUTABLE` 时，才会改用用户指定的程序。

## 为什么暂时使用它

相关能力正在提交给 agent-browser 上游。在上游发布包含同等能力的正式版本之前，
Divebell 需要固定使用这个临时版本，避免用户另外编译或配置本地路径。

## 何时恢复官方版本

同时满足以下条件后恢复：

1. agent-browser 官方版本已包含内存指标、分配采样、内存快照和代码覆盖率采集能力。
2. Divebell 的内存分析和代码使用分析测试可在官方版本上全部通过。
3. 命令名称、输出内容和错误信息与 Divebell 当前使用方式兼容。

## 恢复步骤

1. 将 `packages/cli/package.json` 中的 `@divebell/agent-browser` 替换为官方
   `agent-browser`，并固定到已验证的正式版本。
2. 更新 `pnpm-lock.yaml`。
3. 更新 `packages/cli/README.md` 的安装说明。
4. 更新 `packages/cli/src/features/browser/runner.ts` 中随包查找程序的位置。
5. 更新对应测试中的包路径和版本断言。
6. 运行 CLI 构建、测试，以及真实页面的内存和代码使用分析验证。
7. 删除中英文两份临时版本说明。
