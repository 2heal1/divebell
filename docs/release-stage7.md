# Stage 7 Release Notes

Stage 7 的目标是把 OpenRuntime 整理成可以安装、可以复用、可以验证的第一版。

## 第一版结论

- 第一版版本号是 `0.1.0`。
- 包名保持 `@openruntime/*`。
- CLI 包含 Bridge 的启动和管理能力，也包含打开和操作浏览器的能力，普通用户不用单独安装 `@openruntime/bridge`。
- `@openruntime/bridge` 继续发布，供 `@openruntime/cli` 依赖和高级自定义工具复用。
- 发布包只包含编译产物和类型文件，不内置 `node_modules`，不做额外压缩。
- Garfish 主应用通过 `@openruntime/modern-plugin` 暴露子应用加载、脚本执行、provider render、挂载、卸载和错误状态。
- Module Federation 接入通过 `@module-federation/observability-plugin` 完成，不在本仓库发布独立 MF 包。

## 发布包

| 包 | 版本 | 发布原因 |
| --- | --- | --- |
| `@openruntime/core` | `0.1.0` | 页面侧 Runtime Center、target、snapshot、event、action 和 Bridge 连接 API。 |
| `@openruntime/bridge` | `0.1.0` | CLI 内部依赖；也允许高级工具直接托管 Bridge。 |
| `@openruntime/cli` | `0.1.0` | Agent / 开发者读取状态、执行 action、等待 target 和操作浏览器的入口。 |
| `@openruntime/modern-plugin` | `0.1.0` | Modern.js 项目自动写入框架状态，并提供 Garfish 主应用接入 helpers。 |

这些包在 `.changeset/config.json` 中保持 fixed version。`pnpm run version:check` 会检查所有公开包是否仍然同版本，且是否都在 fixed group 里。

## 普通安装路径

普通前端项目：

```sh
npm i @openruntime/core
npm i -D @openruntime/cli
```

Modern.js 项目：

```sh
npm i @openruntime/modern-plugin
npm i -D @openruntime/cli
```

Garfish 主应用也使用同一个插件包：

```sh
npm i @openruntime/modern-plugin
npm i -D @openruntime/cli
```

CLI 启动 Bridge：

```sh
npx open-runtime start
npx open-runtime open http://localhost:3000
npx open-runtime snapshot --url http://localhost:3000
```

用户只有在自定义 Agent、内部平台、测试框架或长期托管 Bridge 服务时，才需要直接安装 `@openruntime/bridge`。

## Garfish 接入

Garfish helpers 从 `@openruntime/modern-plugin` 导出：

- `createOpenRuntimeGarfishReporter`
- `createOpenRuntimeGarfishPlugin`
- `createOpenRuntimeGarfishCustomLoader`

主应用应在 `Garfish.run()` 或第一次 `Garfish.loadApp()` 之前注册 OpenRuntime Garfish plugin。它会产生：

- `modern:garfish`：当前页面的 Garfish 聚合状态。
- `modern:garfish:app:<name>`：单个子应用状态。

Garfish 状态包括 `registered`、`loading`、`loaded`、`evaluating`、`evaluated`、`mounting`、`rendering`、`mounted`、`unmounting`、`unmounted` 和 `error`。

Garfish target 只证明子应用生命周期和 provider 调用，不证明子应用内部业务 ready。业务 ready 仍应由子应用或稳定父组件声明业务 target。

详细用法见：

- `packages/modern-plugin/README.md`
- `skills/openruntime/references/garfish.md`

## Module Federation 接入

MF 项目应接入 `@module-federation/observability-plugin`，让 MF observability 负责产生 remote、expose、shared、manifest、remoteEntry 和 runtime error 相关信号。

Agent 排查 MF 问题时：

1. 先检查项目是否已经接入 MF observability。
2. 如果没有 `mf:*` target，且源码可改，优先补 `@module-federation/observability-plugin`。
3. 如果不能改源码，说明缺少 MF observability，再退回 console、network、错误码和 MF 配置排查。

对应 Agent 指南在：

- `skills/openruntime/references/module-federation.md`
- `.codex/skills/mf/SKILL.md`

## 错误和失败原因

OpenRuntime 的失败原因分三层。

### Core snapshot

| code | 含义 | 处理方式 |
| --- | --- | --- |
| `target_not_registered` | 更新了未注册 target。 | 先调用 `registerTarget`，再写 snapshot。 |
| `target_type_mismatch` | snapshot 传入的 type 和注册 type 不一致。 | 以注册 target 的 type 为准。 |
| `target_status_not_declared` | status 没有出现在 target 的 `statuses` 里。 | 在注册 target 时声明这个状态，或改用已声明状态。 |

这些错误会记录为 `snapshot.update.rejected` event，不会修改当前 snapshot。

### Core action

| code | 含义 | 处理方式 |
| --- | --- | --- |
| `action_not_registered` | 运行了未声明 action。 | 页面先用 `registerAction` 声明动作。 |
| `action_not_available` | action 当前不可用。 | 查看 `availableWhen` 对应 target 是否已经满足。 |
| `action_payload_invalid` | payload 不符合 input schema。 | 按 action 的 input schema 修正 payload。 |

这些失败不会调用 action handler，只会记录 `action.error` event。

### wait-for

`waitFor` 返回 `success: false` 时常见 reason：

| reason | 含义 | 处理方式 |
| --- | --- | --- |
| `Target is not registered.` | target 当前不存在，也没有注册定义。 | 先确认 target id，或让页面更早注册 target。 |
| `Target was unregistered.` | 等待期间 target 被注销。 | 确认目标生命周期是否已经结束。 |
| `Timed out waiting for target status.` | 超时前没有到达目标状态。 | 读取 snapshot 和 events 找当前卡住的位置。 |

### Bridge / CLI

| code 或错误 | 含义 | 处理方式 |
| --- | --- | --- |
| `runtime_not_found` | 指定 runtime 不存在。 | 先运行 `open-runtime runtimes`。 |
| `runtime_disconnected` | 页面 runtime 已断开。 | 刷新页面或重新打开页面。 |
| `runtime_server_only` | 只有服务端同步状态，浏览器 runtime 还没连上。 | 等浏览器页面连接 Bridge。 |
| `invalid_payload` | HTTP 或 CLI payload 不是合法 JSON object。 | 检查 `--payload` 或请求体。 |
| `invalid_wait_for_body` | wait-for 请求体不合法。 | 检查 targetId、status 和 where。 |
| `invalid_timeout` | timeout 不是非负数字。 | 传入非负毫秒数。 |
| `No connected runtime matched...` | CLI 没找到匹配页面。 | 先打开页面，或给 `wait-for` 加 `--open`。 |

## 安全边界

OpenRuntime 第一版遵守这些边界：

- 只执行页面声明过的 action。
- action 不存在时不执行。
- action 当前不可用时不执行。
- action payload 不符合 schema 时不执行。
- `runAction` 不会自动把页面标记为成功；结果验证继续靠 `waitFor` 或 snapshot。
- Core 不自动猜 target type 或 status。
- 未注册 target 的 snapshot 更新会被拒绝。
- 不把 DOM、console、network 或截图当成默认成功标准。

action 可以声明 `risk`，取值包括 `safe`、`state-changing`、`destructive` 和 `sensitive`。第一版只记录和筛选 risk，不自动越权执行高风险动作。

## 第一版不做

- 不做跨 tab 聚合。
- 不做跨 iframe 聚合。
- 不做跨 worker 聚合。
- 不做多 Runtime Center 自动合并。
- 不把 Bridge 作为公网服务暴露。
- 不做任意 DOM 操作协议。
- 不自动猜业务 ready。
- 不把 Garfish 子应用 `mounted` 当成子应用内部业务 ready。
- 不在 OpenRuntime 仓库重复实现 MF 加载追踪。

## 发布前验收

发布前必须通过：

```sh
pnpm check
```

其中 `pnpm check` 会执行：

1. `version:check`：确认公开包同版本。
2. `build`：构建公开包。
3. `docs:cli:check`：确认 CLI 文档和 skill 命令段同步。
4. `test`：运行包内测试。
5. `verify:stage7`：模拟新项目链路，确认 Bridge、runtime 和 CLI 能闭环。
6. `evaluate:stage6:run`：保留 Modern.js 和 MF 场景评估。

`verify:stage7` 会启动本地 Bridge，用页面 runtime 连接它，再通过 CLI 读取 target、读取 snapshot，并等待 target 到达 ready。它不依赖外部网络、浏览器或真实业务服务。

PR 预览包仍通过 `.github/workflows/pkg-pr-new.yml` 发布，发布前正式版本通过 Changesets：

```sh
pnpm changeset
pnpm version:packages
pnpm publish:packages
```
