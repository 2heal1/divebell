# 使用 OpenRuntime 排查并修复

只在根 `SKILL.md` 把任务分流到“排查并修复”后读取本文件。目标是在与真实问题一致的账号、
环境和用户路径中取得证据、修改源码并重新验证，同时尽量减少人的登录、授权和中途接管。

OpenRuntime 不要求页面先接入 Runtime Core。浏览器侧能力和 Extensions 是普通路径；页面已经提供
相关 Runtime 信息时再用它增强诊断和验证。

## 1. 工作流程

```text
PREPARE_ACCESS
      ↓
OPEN_PAGE
      ↓
DISCOVER
      ↓
OBSERVE
      ↓
PATCH
      ↓
VERIFY
      └──失败──> OBSERVE
```

每一步都以实际命令输出、页面结果、诊断产物或测试结果为证据。不要用“应该已经好了”代替验证，
也不要在结果已经足够时重复收集同一事实。

## 2. PREPARE_ACCESS

先确认目标 URL、运行环境和是否需要登录。受保护页面优先查看当前会话和可用的 Chrome Profile：

```bash
pnpm exec openruntime profiles
```

目标站点已经存在登录状态时先复用，并在页面中确认账号和权限符合任务。没有可用状态时：

- 用户已提供 agent-browser state 时通过 `open --state` 载入。
- 用户允许使用本机 Chrome Profile 时通过 `open --profile` 复用。
- 已安装的 Extension 明确提供测试账号或环境准备命令时，先读取 help 和命令 skill，再按说明执行。
- 都没有时，只请求完成当前任务所需的最小授权或账号输入；不要扩大访问范围。

测试账号和登录状态只用于授权范围内的环境。不要输出 cookie、token 或完整敏感配置。

## 3. OPEN_PAGE

启动目标应用后，用固定 session 打开真实问题页面：

```bash
pnpm exec openruntime open <app-url> --session <debug-session>
```

需要观察人工可见页面时加 `--ui`。CLI 通常自动准备本地 Bridge，不需要先单独运行 `start`。

后续命令复用当前 open context。不要因为一次查询完成就 stop，也不要为了连接 Runtime 使用浏览器
`eval` 临时篡改页面。页面没有 connected runtime 不会阻止浏览器诊断。

## 4. DISCOVER

根据当前安装情况发现可用能力：

```bash
pnpm exec openruntime --help
pnpm exec openruntime extensions list
pnpm exec openruntime stack
```

扩展命令会出现在 `Extensions` 或 `External Extensions`。如果命令有 skill，先运行
`openruntime <command> --skill`，完整读取后再执行。

只选择与当前问题直接匹配的能力：

- 登录或环境问题：agent-browser Profile/state/auth 或账号/环境 Extension。
- 页面交互、报错或请求：page-snapshot、console、network、eval、wait-eval。
- 内存、性能、代码使用或框架专项问题：对应 Extension。
- 页面已经暴露相关内部状态：snapshot、events、actions 和 wait-for。

不要为了“全面”而并发运行所有诊断，也不要因为项目安装了 OpenRuntime 就自动给源码增加接入。

## 5. OBSERVE

先复现用户实际遇到的路径，再收集能回答问题的最少证据。

### 普通页面

页面没有 Runtime Core 时，直接使用浏览器和 Extension：

```bash
pnpm exec openruntime page-snapshot
pnpm exec openruntime console --level error
pnpm exec openruntime network --url <relevant-query>
pnpm exec openruntime screenshot debug-state
```

按问题选择命令，不要求每项都运行。性能、内存和代码执行问题优先使用专项 Extension，让它负责
采集、重复场景、报告和清理。

### 已有 Runtime 信息

如果页面已经 connected 且 target 与问题相关，先读取一次全量 snapshot：

```bash
pnpm exec openruntime snapshot --session <debug-session>
```

- snapshot 已经指向 route、loader、remote、shared、子应用或业务状态时，继续查对应源码、配置和依赖。
- snapshot 没有相关线索时，立即回到浏览器或 Extension，不要反复换查询条件碰运气。
- 只有要细化已经出现的线索时，才追加 `--id` 或 `--query`。

需要变化过程时读取 events；需要执行页面明确允许的动作时先读取 actions、风险和输入，再运行 action。

### 何时补 Runtime Core

一次性排查默认不补接入。只有满足下面任一条件时，才读取 `integrate.md` 和 `core.md` 增加正式信号：

- 浏览器表面无法稳定判断真正的业务状态或阻塞原因。
- 用户明确要求接入 OpenRuntime 或增加长期验收信号。
- 同一结果会被多个 Agent、脚本或 CI 长期复用。
- 页面需要声明允许动作、输入和风险边界。

新增信号只暴露事实，不得改变业务行为。完成后回到本流程继续修复和验证。

## 6. PATCH

根据 OBSERVE 的证据修改源码。修改范围应直接解释当前故障，不要把增加 OpenRuntime 接入本身当成
修复结果。

如果修改了构建配置、依赖解析、路由、shared、remote、开发服务器或页面初始化，必须重启目标应用。
普通页面代码只有在开发服务器正确应用热更新时才直接复用现有进程。

修改后保留原登录状态和 session，重新打开或刷新真实问题页面，再进入 VERIFY。

## 7. VERIFY

验证必须使用与原问题一致的账号、环境、入口和用户路径。按任务选择最可靠的现有证据：

1. 与问题匹配的专项 Extension 检查，例如内存趋势、代码使用、性能或框架诊断。
2. 页面已经提供的 Runtime Target、Snapshot 和 `waitFor`。
3. 明确的页面结果、请求结果、交互结果和相关错误是否消失。
4. 截图用于视觉确认或留档，不单独证明复杂状态或交互结果。

页面已有 business target 且适合当前目标时，可以使用 `wait-for` 或扩展提供的 `verify`。没有 business
target 时，不要仅为了满足流程而新增一个；用可重复、与问题直接对应的页面或 Extension 结果完成验证。

如果修改的是内存、性能或代码使用问题，必须重新运行同一诊断场景并比较对应指标或报告，不能用“页面能打开”代替。

验证失败且信息不足时保留 session 回到 OBSERVE。验证通过后停止重复取证，整理实际使用的账号范围、
问题原因、修改结果和验证依据。

## 8. BLOCKED 边界

只有下面情况才报告当前无法继续：

- 目标应用无法启动或保持运行，且安全的本地排查已耗尽。
- 受保护页面缺少必要授权，已有 Profile 和 Extension 都不能提供，必须由用户或系统授予。
- 用户禁止修改需要修改的源码，或源码不可写。
- 完成验证必须使用外部环境或数据，但当前没有访问权限。

没有 connected runtime、没有 business target 或某一次诊断没有线索，都不是 blocker；继续使用浏览器、
Extension、源码和实际测试推进。

## 9. Reference

- `@openruntime/core` 页面侧 target、snapshot、action：同目录的 `core.md`
- Extension、自动化脚本和项目接入：同目录的 `integrate.md`
- Modern.js / EdenX route、loader 和 hydration：同目录的 `modernjs.md`
- Module Federation / Vmok remote、expose、shared 和 observability：同目录的 `module-federation.md`
- Garfish 子应用生命周期和 custom loader：同目录的 `garfish.md`
