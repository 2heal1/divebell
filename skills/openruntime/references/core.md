# OpenRuntime Core Reference

本文档承接 `SKILL.md` 中不适合放在入口的细节。按需读取，不要在每个任务里完整加载。

`@openruntime/core` 是页面侧 API 包，用来创建 runtime、连接 Bridge、注册 target、
更新 snapshot、注册 action。补这些能力时优先看本文件、项目里已有的 OpenRuntime
初始化/连接代码和相邻页面示例。禁止预防性读取 `node_modules/@openruntime/**`
下的安装包文件；`.d.ts` 也算内部文件。先按本文件和项目相邻写法 patch，再用
typecheck/build 裁决。只有出现真实错误，且本文件、skill 和项目示例都无法解释时，
才允许破例查看安装包内部文件。

## OpenRuntime 是什么

OpenRuntime 让前端应用把运行时状态、事件、可等待目标和声明动作开放给 Agent。
目标是让 Agent 在 AI coding 中能自己验证页面、定位问题、执行安全动作并等待结果，
减少人的中途介入。

OpenRuntime 的主要对象：

- Bridge：CLI 和页面 runtime 的连接通道。
- Runtime：页面中的 OpenRuntime 实例，负责注册 target、更新 snapshot、记录 event 和执行 action。
- Target：页面中可以被引用或等待的对象，例如业务组件、route、remote、shared 或子应用。
- Snapshot：target 的当前事实。它回答“现在是什么状态”。
- Event：状态变化、错误和 action 历史。它回答“状态怎么变成这样的”。
- Action：页面声明给 Agent 的安全动作。它回答“Agent 可以让页面做什么”。

OpenRuntime 不是 DOM 猜测、截图判断、console 轮询或 network 抓包的替代包装。它要求页面主动暴露结构化事实。

## @openruntime/core 公开 API

页面代码从 `@openruntime/core` 导入 API。普通接入只需要这些公开 API，不需要读取
`node_modules/@openruntime/**`；其中 `.d.ts` 也属于安装包内部文件。


### createOpenRuntime

创建一个新的页面 runtime 实例。

**什么时候使用**

- 项目还没有 OpenRuntime 初始化代码。
- 测试或独立页面需要手动创建 runtime。

**行为说明**

- 每次调用都会创建新实例。
- 不会自动挂载到 `window.__OPEN_RUNTIME__`。
- 需要被 CLI、插件或业务代码共享时，继续调用 `installOpenRuntimeOnWindow`。

```ts
import { createOpenRuntime } from "@openruntime/core";

interface CreateOpenRuntimeOptions {
  // 可选时钟，测试中可用固定时间；不传时使用真实时间。
  clock?: { now(): number };
}

function createOpenRuntime(options?: CreateOpenRuntimeOptions): RuntimeCenter;
```

```ts
const runtime = createOpenRuntime();
```

### installOpenRuntimeOnWindow

把 runtime 安装到 `window.__OPEN_RUNTIME__`，并返回最终可复用的 runtime。

**什么时候使用**

- 页面里需要让插件、业务代码和 CLI 访问同一个 runtime。
- 已创建 runtime，但还没有挂到全局对象。

**行为说明**

- 不传 `runtime` 时会创建并安装一个默认 runtime。
- 默认安装到当前 `window`，也可以通过 `host` 指定其他 window-like 对象。
- 已有初始化代码时优先复用已有入口，不要在多个位置重复安装。

```ts
import { installOpenRuntimeOnWindow } from "@openruntime/core";

function installOpenRuntimeOnWindow(
  // 要安装的 runtime；不传时创建新 runtime。
  runtime?: OpenRuntimeCore,
  // window-like 宿主对象，默认是当前 window。
  host?: OpenRuntimeWindowHost,
): OpenRuntimeCore;

interface OpenRuntimeWindowHost {
  // 挂载在宿主对象上的 runtime。
  __OPEN_RUNTIME__?: OpenRuntimeCore;
}
```

```ts
const runtime = installOpenRuntimeOnWindow(createOpenRuntime());
```

### getOpenRuntimeFromWindow

从 `window.__OPEN_RUNTIME__` 读取已经安装的 runtime。

**什么时候使用**

- 避免重复创建 runtime。
- 在业务模块、框架插件或调试代码中复用页面已有 runtime。

**行为说明**

- 找到时返回已有 runtime。
- 找不到时返回 `undefined`，调用方应决定是否创建并安装新实例。

```ts
import { getOpenRuntimeFromWindow } from "@openruntime/core";

function getOpenRuntimeFromWindow(
  // window-like 宿主对象，默认是当前 window。
  host?: OpenRuntimeWindowHost,
): OpenRuntimeCore | undefined;
```

```ts
const runtime = getOpenRuntimeFromWindow() ?? installOpenRuntimeOnWindow(createOpenRuntime());
```

### connectBridge

连接 CLI Bridge，让 Agent 能通过命令读取 targets、snapshot、events 并执行 action。

**什么时候使用**

- 源码可改，需要接入 OpenRuntime 证据链。
- 页面启动后要让 `pnpm exec openruntime runtimes` 能看到 connected runtime。

**行为说明**

- 默认端口使用 `OPEN_RUNTIME_BRIDGE_DEFAULT_PORT`，当前是 `17321`。
- 项目已有配置、环境变量或全局常量传入端口时，使用项目端口，不要硬编码。
- 源码不可改且无法连接时，明确标记 runtime evidence unavailable。

```ts
import { OPEN_RUNTIME_BRIDGE_DEFAULT_PORT } from "@openruntime/core";

interface BridgeConnectOptions {
  // Bridge 端口；默认端口常量是 17321。
  port?: number;
  // 是否自动重连。
  autoReconnect?: boolean;
  // 页面实例 ID，用于区分同 URL 的多个页面实例。
  pageInstanceId?: string;
  // runtime ID。
  runtimeId?: string;
  // session ID，通常来自 URL session 参数。
  sessionId?: string;
  // 渲染实例 ID。
  renderId?: string;
}

interface OpenRuntimeCore {
  connectBridge(options?: BridgeConnectOptions): void;
}
```

```ts
runtime.connectBridge({ port: OPEN_RUNTIME_BRIDGE_DEFAULT_PORT });
```

:::tip
`OPEN_RUNTIME_SESSION_QUERY_PARAM` 是 URL 上的 session 参数名。需要区分多个同 URL 页面时，用它生成或读取 session。
:::

### registerTarget

声明一个页面可观察对象。Target 回答“页面里有什么可以被引用或等待”。

**什么时候使用**

- 业务组件、流程、加载链路或 debug 事实需要被 Agent 查询。
- 要让后续 `updateSnapshot`、`waitFor`、`verify` 有稳定 target id。

**行为说明**

- `id` 应稳定、唯一、可读。
- `type` 和 `statuses` 由接入方声明，Core 不内置固定 target type 或 status。
- 一个 target 应该只表达一个稳定能力或结果，不要重复注册同义 target。

```ts
type RuntimeObjectType = string;
type RuntimeStatus = string;

interface RegisterTargetInput {
  // 稳定唯一 ID，例如 business:orders:risk-panel。
  id: string;
  // target 类型，例如 business.component。
  type: RuntimeObjectType;
  // target 来源，例如业务域、框架插件或 MF 插件名。
  source: string;
  // 给人看的短标签。
  label?: string;
  // 给人看的补充说明。
  description?: string;
  // target 允许出现的状态集合。
  statuses: RuntimeStatus[];
  // 可参数化 target 的参数声明。
  params?: RuntimeTargetParam[];
  // target 匹配规则。
  matcher?: RuntimeTargetMatcher;
  // 注册时附带的少量静态数据。
  data?: unknown;
}

interface RuntimeTargetParam {
  // 参数名。
  name: string;
  // 参数类型。
  type: "string" | "number" | "boolean";
  // 是否必填。
  required?: boolean;
  // 参数说明。
  description?: string;
}

interface RuntimeTargetMatcher {
  // 精确匹配、路径模式匹配或自定义匹配。
  type: "exact" | "path-pattern" | "custom";
  // 匹配模式。
  pattern?: string;
}

interface OpenRuntimeCore {
  registerTarget(target: RegisterTargetInput): void;
}
```

```ts
runtime.registerTarget({
  id: "business:orders:risk-panel",
  type: "business.component",
  source: "orders",
  statuses: ["pending", "ready", "error"],
});
```

### unregisterTarget

移除 target 以及对应 snapshot。

**什么时候使用**

- 页面卸载、微应用卸载或动态能力不再存在。
- 测试中需要清理临时 target。

**行为说明**

- 移除后，Agent 不能再通过该 id 等待或验证。
- 不要在 target 仍能证明业务事实时过早移除。

```ts
interface OpenRuntimeCore {
  unregisterTarget(
    // 要移除的 target id。
    targetId: string,
  ): void;
}
```

```ts
runtime.unregisterTarget("business:orders:risk-panel");
```

### getTargets

在页面内读取 target 定义。

**什么时候使用**

- 调试页面侧注册结果。
- 插件或测试需要确认某类 target 是否已经注册。

**行为说明**

- 只返回 target 定义，不代表当前状态。
- Agent 侧通常使用 CLI 查询，而不是在页面代码里直接调用。

```ts
interface RuntimeTargetDescriptor extends RegisterTargetInput {
  // 首次注册时间。
  registeredAt: number;
  // 最近更新时间。
  updatedAt: number;
}

interface GetTargetsQuery {
  // 按 target 类型过滤。
  type?: RuntimeObjectType | RuntimeObjectType[];
  // 按来源过滤。
  source?: string | string[];
  // 按 target id 过滤。
  id?: string | string[];
  // 按状态过滤。
  status?: RuntimeStatus | RuntimeStatus[];
  // 文本搜索。
  query?: string;
}

interface OpenRuntimeCore {
  getTargets(query?: GetTargetsQuery): RuntimeTargetDescriptor[];
}
```

```ts
const targets = runtime.getTargets({ query: "orders" });
```

### updateSnapshot

更新 target 的当前事实。Snapshot 回答“现在是什么状态”。

**什么时候使用**

- target 进入 pending、ready、error 等状态。
- action 执行前后需要把业务结果写成可验证事实。
- 需要把 console、network 或框架错误转成结构化 debug snapshot。

**行为说明**

- 必须先 `registerTarget`，再 `updateSnapshot`。
- `status` 必须出现在 target 的 `statuses` 中。
- 错误优先写 `error` 字段，必要上下文写 `data`。
- `dependsOn` 只表达当前状态里的阻塞线索。

```ts
interface RuntimeError {
  // 错误消息。
  message: string;
  // 可选错误码。
  code?: string;
  // 可选堆栈。
  stack?: string;
  // 附加错误数据。
  data?: unknown;
}

interface UpdateSnapshotInput {
  // 要更新的 target id。
  id: string;
  // 当前状态，必须属于 target.statuses。
  status: RuntimeStatus;
  // 可选 target 类型；通常由已注册 target 决定。
  type?: RuntimeObjectType;
  // 可选来源；通常由已注册 target 决定。
  source?: string;
  // 当前状态说明。
  description?: string;
  // 能证明结论的少量结构化数据。
  data?: unknown;
  // 错误状态的结构化错误。
  error?: RuntimeError;
  // 当前状态依赖或阻塞的 target id 列表。
  dependsOn?: string[];
}

interface OpenRuntimeCore {
  updateSnapshot(input: UpdateSnapshotInput): void;
}
```

```ts
runtime.updateSnapshot({
  id: "business:orders:risk-panel",
  status: "ready",
  data: { visible: true, riskCount },
});
```

:::warning
不要把完整 DOM、完整接口响应或大量无关业务数据塞进 snapshot。只放能证明结论的必要字段。
:::

### getSnapshot

在页面内读取当前 snapshot。

**什么时候使用**

- 调试页面当前事实。
- action handler 中根据当前状态决定下一步。

**行为说明**

- 返回的是当前事实，不包含完整历史。
- 需要追溯变化过程时读取 `getEvents`。

```ts
interface RuntimeSnapshotTarget {
  // target id。
  id: string;
  // target 类型。
  type: RuntimeObjectType;
  // 当前状态。
  status: RuntimeStatus;
  // 来源。
  source?: string;
  // 当前状态说明。
  description?: string;
  // 能证明结论的少量结构化数据。
  data?: unknown;
  // 错误状态的结构化错误。
  error?: RuntimeError;
  // 最近更新时间。
  updatedAt: number;
  // 当前状态依赖或阻塞的 target id 列表。
  dependsOn?: string[];
}

interface RuntimeSnapshot {
  // 按 target id 索引的当前状态。
  targets: Record<string, RuntimeSnapshotTarget>;
  // 当前 snapshot 对应的最新事件 ID。
  latestEventId: number;
  // 捕获时间。
  capturedAt: number;
}

interface GetSnapshotQuery {
  // 按 target id 过滤。
  id?: string | string[];
  // 按 target 类型过滤。
  type?: RuntimeObjectType | RuntimeObjectType[];
  // 按来源过滤。
  source?: string | string[];
  // 按状态过滤。
  status?: RuntimeStatus | RuntimeStatus[];
  // 文本搜索。
  query?: string;
}

interface OpenRuntimeCore {
  getSnapshot(query?: GetSnapshotQuery): RuntimeSnapshot;
}
```

```ts
const snapshot = runtime.getSnapshot({ id: "business:orders:risk-panel" });
```

### getEvents

在页面内读取事件历史。Event 回答“状态和 action 是怎么变化过来的”。

**什么时候使用**

- `waitFor` 或 `verify` 失败，需要定位状态未更新、action 失败或 where 条件不匹配。
- 需要追溯错误发生过程。

**行为说明**

- target 已知时优先用 `targetId` 收窄，不要默认读取完整 events。
- `truncated` 为 `true` 表示结果被截断，需要缩小查询范围或提高 limit。

```ts
interface RuntimeEvent {
  // 自增事件 ID。
  id: number;
  // 事件类型，例如 snapshot.updated 或 action.finished。
  type: string;
  // 事件来源。
  source: string;
  // 事件时间。
  timestamp: number;
  // 关联 target id。
  targetId?: string;
  // 关联 action name。
  actionName?: string;
  // 关联状态。
  status?: RuntimeStatus;
  // 事件负载。
  payload?: unknown;
  // 错误信息。
  error?: RuntimeError;
}

interface GetEventsQuery {
  // 只读取该事件 ID 之后的事件。
  since?: number;
  // 按 target id 过滤。
  targetId?: string | string[];
  // 按 action name 过滤。
  actionName?: string | string[];
  // 按事件类型过滤。
  type?: string | string[];
  // 按来源过滤。
  source?: string | string[];
  // 按状态过滤。
  status?: RuntimeStatus | RuntimeStatus[];
  // 返回数量上限。
  limit?: number;
  // 文本搜索。
  query?: string;
}

interface GetEventsResult {
  // 事件列表。
  events: RuntimeEvent[];
  // 当前最新事件 ID。
  latestEventId: number;
  // 是否被截断。
  truncated: boolean;
}

interface OpenRuntimeCore {
  getEvents(query?: GetEventsQuery): GetEventsResult;
}
```

```ts
const result = runtime.getEvents({ targetId: "business:orders:risk-panel", limit: 50 });
```

### registerAction

声明页面可执行动作。Action 回答“Agent 可以让页面做什么”。

**什么时候使用**

- 页面需要暴露刷新、导航、登录、选择等确定动作给 Agent。
- 需要让 Agent 执行动作后继续通过 snapshot、wait-for 或 verify 验收。

**行为说明**

- action 应该最小、确定、可重复。
- `runAction` 只证明 handler 被调用；业务结果仍要写入 target snapshot。
- `availableWhen` 可限制 action 只在指定 runtime 条件满足时可用。

```ts
type RuntimeActionRisk = "safe" | "state-changing" | "destructive" | "sensitive";

interface RegisterActionInput {
  // action 名称，例如 orders.refreshRiskPanel。
  name: string;
  // action 描述。
  description?: string;
  // action 来源。
  source?: string;
  // 风险等级。
  risk?: RuntimeActionRisk;
  // 可用条件。
  availableWhen?: RuntimeCondition | RuntimeCondition[];
  // 输入 JSON Schema。
  inputSchema?: RuntimeJsonSchema;
  // 动态输入候选项提供器。
  getInputOptions?: RuntimeInputOptionsProvider;
  // action 执行函数。
  handler: RuntimeActionHandler;
}

type RuntimeActionHandler = (
  // Agent 传入的 action 参数。
  payload: unknown,
  // action 执行上下文。
  context: RuntimeActionContext,
) => Promise<unknown> | unknown;

interface RuntimeActionContext {
  // 当前 action 名称。
  actionName: string;
  // 读取当前 snapshot。
  getSnapshot: () => RuntimeSnapshot;
  // 更新 snapshot。
  updateSnapshot: (input: UpdateSnapshotInput) => void;
  // 等待 runtime 条件。
  waitFor: (condition: RuntimeCondition, options?: RuntimeWaitOptions) => Promise<RuntimeWaitResult>;
}

interface RuntimeJsonSchema {
  // 当前仅支持 object 作为顶层 schema。
  type: "object";
  // 字段定义。
  properties?: Record<string, RuntimeJsonSchemaProperty>;
  // 必填字段。
  required?: string[];
  // 是否允许额外字段。
  additionalProperties?: boolean;
}

interface RuntimeJsonSchemaProperty {
  // 字段类型。
  type: "string" | "number" | "boolean" | "array" | "object";
  // 字段说明。
  description?: string;
  // 枚举值。
  enum?: Array<string | number | boolean>;
  // 数组元素 schema。
  items?: RuntimeJsonSchemaProperty;
  // 对象字段 schema。
  properties?: Record<string, RuntimeJsonSchemaProperty>;
  // 对象必填字段。
  required?: string[];
  // 是否允许额外字段。
  additionalProperties?: boolean;
}

interface OpenRuntimeCore {
  registerAction(action: RegisterActionInput): void;
}
```

```ts
runtime.registerAction({
  name: "orders.refreshRiskPanel",
  source: "orders",
  risk: "safe",
  description: "Refresh the order risk panel",
  async handler(_payload, context) {
    await refreshRiskPanel();
    context.updateSnapshot({
      id: "business:orders:risk-panel",
      status: "ready",
    });
    return { refreshed: true };
  },
});
```

### unregisterAction

移除一个已注册 action。

**什么时候使用**

- 页面卸载、微应用卸载或动态动作不再可用。
- 测试中需要清理临时 action。

**行为说明**

- 移除后 Agent 不能再执行该 action。
- 不要用移除 action 代替 `availableWhen`；只是临时不可用时优先用可用条件表达。

```ts
interface OpenRuntimeCore {
  unregisterAction(
    // 要移除的 action name。
    actionName: string,
  ): void;
}
```

```ts
runtime.unregisterAction("orders.refreshRiskPanel");
```

### getActions

在页面内读取 action 定义。

**什么时候使用**

- 调试页面暴露了哪些动作。
- 插件或测试需要确认 action 是否已经注册。

**行为说明**

- 返回 action 描述，不会执行 action。
- Agent 侧通常通过 CLI 或 Bridge 读取 actions。

```ts
interface GetActionsQuery {
  // 按 action name 过滤。
  name?: string | string[];
  // 按来源过滤。
  source?: string | string[];
  // 按风险等级过滤。
  risk?: RuntimeActionRisk | RuntimeActionRisk[];
  // 按当前是否可用过滤。
  enabled?: boolean;
  // 文本搜索。
  query?: string;
}

interface RuntimeActionDescriptor {
  // action name。
  name: string;
  // action 描述。
  description?: string;
  // action 来源。
  source: string;
  // 风险等级。
  risk: RuntimeActionRisk;
  // 可用条件。
  availableWhen?: RuntimeCondition | RuntimeCondition[];
  // 输入 JSON Schema。
  inputSchema?: RuntimeJsonSchema;
  // 是否注册了动态输入候选项提供器。
  hasInputOptions: boolean;
  // 当前是否满足可用条件。
  enabled: boolean;
  // 不可用原因。
  reason?: string;
  // 注册时间。
  registeredAt: number;
  // 最近更新时间。
  updatedAt: number;
}

interface OpenRuntimeCore {
  getActions(query?: GetActionsQuery): RuntimeActionDescriptor[];
}
```

```ts
const actions = runtime.getActions({ query: "orders" });
```

### getInputOptions

读取某个 action 输入字段的动态候选项。

**什么时候使用**

- action 输入需要根据当前 payload、页面状态或业务数据生成候选项。
- Agent 或 UI 需要为某个字段展示可选值。

**行为说明**

- 只有 action 注册了 `getInputOptions` 时才有动态候选项。
- `currentPayload` 用于表达已经填写的其他字段。

```ts
interface RuntimeInputOption {
  // 实际值。
  value: string | number | boolean;
  // 候选项说明。
  description?: string;
}

interface RuntimeInputOptionsOptions {
  // 候选项查询超时时间，单位毫秒。
  timeout?: number;
}

type RuntimeInputOptionsProvider = (
  // 当前字段名。
  inputName: string,
  // 当前已填写 payload。
  currentPayload?: Record<string, unknown>,
  // action 执行上下文。
  context?: RuntimeActionContext,
) => Promise<RuntimeInputOption[]> | RuntimeInputOption[];

interface OpenRuntimeCore {
  getInputOptions(
    // action name。
    actionName: string,
    // 输入字段名。
    inputName: string,
    // 当前已填写 payload。
    currentPayload?: Record<string, unknown>,
    // 查询选项。
    options?: RuntimeInputOptionsOptions,
  ): Promise<RuntimeInputOption[]>;
}
```

```ts
const owners = await runtime.getInputOptions("orders.assign", "owner");
```

### runAction

在页面内执行一个已注册 action。

**什么时候使用**

- 页面内部测试或调试需要直接触发 action。
- action handler 需要被 CLI 或 Bridge 调用时，对应页面侧执行入口就是 `runAction`。

**行为说明**

- 只执行 action 并记录 action event。
- 不自动更新 Snapshot；handler 内需要显式 `updateSnapshot`。
- 执行后仍应继续用 snapshot、events、wait-for 或 verify 观察业务结果。

```ts
interface RuntimeActionResult {
  // handler 是否成功完成。
  success: boolean;
  // action name。
  actionName: string;
  // handler 返回值。
  result?: unknown;
  // handler 抛出的错误。
  error?: RuntimeError;
}

interface OpenRuntimeCore {
  runAction(
    // action name。
    actionName: string,
    // action 参数。
    payload?: Record<string, unknown>,
  ): Promise<RuntimeActionResult>;
}
```

```ts
const result = await runtime.runAction("orders.refreshRiskPanel", {});
```

:::warning
`runAction` 成功不等于业务验收成功。业务成功必须由 business target 的 snapshot / wait-for / verify 证明。
:::

### waitFor

在页面内等待某个 target 达到指定状态和数据条件。

**什么时候使用**

- action 后等待状态推进。
- 页面内部测试需要等待业务 target ready。
- 导航、加载、remote ready 等中间状态需要等待。

**行为说明**

- 条件成功时返回 `success: true` 和匹配 target。
- 超时或条件不满足时返回失败原因和当前 snapshot。
- 最终验收更推荐 Agent 侧使用 CLI `verify`。

```ts
interface RuntimeCondition {
  // 要等待的 target id。
  id: string;
  // 目标状态。
  status: RuntimeStatus;
  // 可选数据条件。
  where?: RuntimeDataCondition[];
}

interface RuntimeDataCondition {
  // data 内的路径。
  path: string;
  // 期望值。
  equals: unknown;
}

interface RuntimeWaitOptions {
  // 超时时间，单位毫秒。
  timeout?: number;
}

interface RuntimeWaitResult {
  // 是否满足条件。
  success: boolean;
  // 原始等待条件。
  condition: RuntimeCondition;
  // 返回时的 snapshot。
  snapshot: RuntimeSnapshot;
  // 匹配到的 target。
  target?: RuntimeSnapshotTarget;
  // 失败原因。
  reason?: string;
}

interface OpenRuntimeCore {
  waitFor(condition: RuntimeCondition, options?: RuntimeWaitOptions): Promise<RuntimeWaitResult>;
}
```

```ts
const result = await runtime.waitFor(
  { id: "business:orders:risk-panel", status: "ready" },
  { timeout: 10000 },
);
```

### matchesRuntimeCondition

判断 snapshot 是否满足 runtime 条件。

**什么时候使用**

- 测试 `RuntimeCondition` 是否符合预期。
- 自定义逻辑需要在不触发等待的情况下判断条件。

**行为说明**

- 只做同步判断。
- 普通页面接入很少需要直接调用。

```ts
function matchesRuntimeCondition(
  // 要判断的条件。
  condition: RuntimeCondition,
  // 当前 snapshot。
  snapshot: RuntimeSnapshot,
): boolean;
```

```ts
const matched = matchesRuntimeCondition(
  { id: "business:orders:risk-panel", status: "ready" },
  runtime.getSnapshot(),
);
```

### syncServerRuntimeBridge

服务端向 Bridge 同步 runtime 状态。

**什么时候使用**

- 服务端 runtime 或 SSR 场景需要把结构化状态同步给 Bridge。
- 普通浏览器页面接入不需要调用。

**行为说明**

- 这是服务端同步入口，不是浏览器页面的默认接入方式。
- 浏览器页面优先使用 `connectBridge`。

```ts
function syncServerRuntimeBridge(
  // 要同步的 runtime。
  runtime: OpenRuntimeCore,
  // 服务端 Bridge 同步选项。
  options: BridgeServerSyncOptions,
): Promise<BridgeServerRuntimeSyncResponse>;

interface BridgeServerSyncOptions {
  // Bridge 端口；不传时使用默认端口 17321。
  port?: number;
  // 服务端 runtime ID。
  runtimeId: string;
  // session ID。
  sessionId?: string;
  // 渲染实例 ID。
  renderId?: string;
  // 对应页面 URL。
  url: string;
  // 来源。
  source?: string;
}

interface BridgeServerRuntimeSyncResponse {
  // 已接收的 runtime ID。
  runtimeId: string;
  // 渲染实例 ID。
  renderId?: string;
  // 是否已被 Bridge 接收。
  accepted: true;
}
```

:::tip
如果只是补页面可验证能力，不要优先引入 `syncServerRuntimeBridge`。先确认是否能在页面 runtime 里连接 Bridge、注册 target 并更新 snapshot。
:::

### RuntimeCenter

`RuntimeCenter` 是 runtime 类。

**什么时候使用**

- 框架或库内部需要直接构造 runtime 类。
- 普通业务接入不需要直接 `new RuntimeCenter()`。

**行为说明**

- 普通页面优先使用 `createOpenRuntime()`。
- 直接构造时要自行负责安装、连接和生命周期。

```ts
class RuntimeCenter implements OpenRuntimeCore {
  // RuntimeCenter 实现 OpenRuntimeCore 的全部实例方法。
}
```

### Agent 侧 CLI 对照

Agent 侧通常不在页面代码里调用 `getSnapshot`、`getEvents`、`runAction`、`waitFor`，而是用 CLI：

```bash
pnpm exec openruntime snapshot --id <target-id> --url <url>
pnpm exec openruntime events --target-id <target-id> --url <url> --limit 50
pnpm exec openruntime run-action <action-name> --url <url> --payload '{}'
pnpm exec openruntime wait-for <target-id> ready --url <url> --timeout 10000
```

### 最小调用顺序

页面侧最常见顺序：

```ts
import {
  OPEN_RUNTIME_BRIDGE_DEFAULT_PORT,
  createOpenRuntime,
  getOpenRuntimeFromWindow,
  installOpenRuntimeOnWindow,
} from "@openruntime/core";

const runtime =
  getOpenRuntimeFromWindow() ?? installOpenRuntimeOnWindow(createOpenRuntime());

runtime.connectBridge({ port: OPEN_RUNTIME_BRIDGE_DEFAULT_PORT });

runtime.registerTarget({
  id: "business:orders:risk-panel",
  type: "business.component",
  source: "orders",
  statuses: ["pending", "ready", "error"],
});

runtime.updateSnapshot({
  id: "business:orders:risk-panel",
  status: "pending",
});
```

业务成功或失败时再更新同一个 target：

```ts
runtime.updateSnapshot({
  id: "business:orders:risk-panel",
  status: "ready",
  data: { visible: true },
});
```

```ts
runtime.updateSnapshot({
  id: "business:orders:risk-panel",
  status: "error",
  error: { message: error instanceof Error ? error.message : String(error) },
});
```

## Bridge 和连接

源码可改时，必须在源码或框架插件配置里连接 Bridge；源码不可改时，明确标记 runtime evidence unavailable。

Core 直接接入示例：

```ts
import { createOpenRuntime, installOpenRuntimeOnWindow } from "@openruntime/core";

const runtime = installOpenRuntimeOnWindow(createOpenRuntime());

runtime.connectBridge({
  port: 17321,
});
```

连接确认：

```bash
pnpm exec openruntime runtimes --bridge http://localhost:17321
```

成功条件：至少一个 runtime 的 `status` 是 `"connected"`。如果 `runtimes` 为空，不要声称已经使用 targets、snapshot、events 或 verify。

如果项目还没有 OpenRuntime 初始化代码，可以用公开 API 创建并安装 runtime。已有初始化
代码时复用已有函数，不要重复安装多个 runtime：

```ts
import {
  createOpenRuntime,
  getOpenRuntimeFromWindow,
  installOpenRuntimeOnWindow,
} from "@openruntime/core";

export function ensureOpenRuntimeConnected() {
  const existing = getOpenRuntimeFromWindow();
  const runtime = existing ?? installOpenRuntimeOnWindow(createOpenRuntime());

  runtime.connectBridge({ port: 17321 });
  return runtime;
}
```

如果项目已经通过配置、环境变量或全局常量传入 Bridge 端口，使用项目里的端口值，不要硬编码。

## Target

Target 是页面声明给 Agent 的可观察对象。一个 target 应该只表达一个稳定能力或结果。

```ts
runtime.registerTarget({
  id: "business:orders:risk-panel",
  type: "business.component",
  label: "Orders risk panel",
  source: "orders",
  statuses: ["pending", "ready", "error"],
});
```

命名建议：

- 业务 target：`business:<area>:<capability>`。
- debug target：`debug:<area>:runtime-error`。
- 框架 target：由 Modern/MF/Garfish 插件生成。

不要重复注册同义 target。已有 target 能证明事实时，优先复用。

## Snapshot

Snapshot 是 target 的当前事实。只放能证明结论的必要字段，不要塞完整 DOM、完整接口响应或大量无关业务数据。

必须先 `registerTarget`，再 `updateSnapshot`。snapshot 的 `status` 必须出现在 target 的 `statuses` 中。

```ts
runtime.updateSnapshot({
  id: "business:orders:risk-panel",
  status: "ready",
  data: {
    orderId,
    visible: true,
    riskCount,
  },
});
```

错误写法：

```ts
runtime.updateSnapshot({
  id: "debug:consumer:runtime-error",
  status: "error",
  data: {
    message: error.message,
    stack: error.stack,
    pathname: location.pathname,
  },
});
```

错误状态优先写 `error` 字段，必要的上下文放在 `data`：

```ts
runtime.updateSnapshot({
  id: "debug:consumer:runtime-error",
  status: "error",
  error: {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  },
  data: { pathname: location.pathname },
});
```

查询：

```bash
pnpm exec openruntime snapshot --url <url> --id business:orders:risk-panel
pnpm exec openruntime snapshot --url <url> --query runtime-error
```

## Event

Event 用来追溯状态变化、action 历史和错误发生过程。只有需要历史时才读取 events。

```bash
pnpm exec openruntime events --url <url> --target-id business:orders:risk-panel --limit 50
pnpm exec openruntime events --url <url> --query runtime-error --limit 50
```

不要把完整 events 当成默认第一步。target 已知时收窄到 target id。

## Action

Action 是页面声明给 Agent 的动作。它应该最小、确定、可重复。

执行 action 只证明 handler 被调用；业务结果仍要写入 target snapshot，并用 `wait-for` 或 `verify` 验收。

```ts
runtime.registerAction({
  name: "orders.refreshRiskPanel",
  description: "Refresh the order risk panel",
  handler: async () => refreshRiskPanel(),
});
```

执行：

```bash
pnpm exec openruntime run-action --url <url> orders.refreshRiskPanel --payload '{}'
pnpm exec openruntime wait-for business:orders:risk-panel ready --url <url> --timeout 10000
```

需要验证 action 结果时，推荐写一个 action result target：

```ts
runtime.registerTarget({
  id: "business:orders:refresh-risk-panel",
  type: "business.action-result",
  source: "orders",
  statuses: ["idle", "running", "success", "error"],
});

runtime.registerAction({
  name: "orders.refreshRiskPanel",
  source: "orders",
  risk: "safe",
  description: "Refresh the order risk panel",
  async handler(_payload, context) {
    context.updateSnapshot({
      id: "business:orders:refresh-risk-panel",
      status: "running",
    });

    try {
      await refreshRiskPanel();
      context.updateSnapshot({
        id: "business:orders:refresh-risk-panel",
        status: "success",
      });
      return { refreshed: true };
    } catch (error) {
      context.updateSnapshot({
        id: "business:orders:refresh-risk-panel",
        status: "error",
        error: { message: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  },
});
```

执行 action 后，继续通过 snapshot、events、wait-for 或 verify 观察结果。`run-action` 本身不等于验收成功。

## wait-for 和 verify

`wait-for` 等待中间状态，适合导航、加载、action 后状态推进。

```bash
pnpm exec openruntime wait-for business:orders:risk-panel ready --url <url> --timeout 10000
```

`verify` 做最终验收，适合修改代码后的最后一步。

```bash
pnpm exec openruntime verify business:orders:risk-panel ready --url <url> --timeout 10000
```

业务成功必须由 business target 证明。Modern/MF/Vmok/Garfish target ready 只能证明底层加载链路，不证明业务 UI 成功。

## 示例

### 验证登录

```ts
runtime.registerTarget({
  id: "business:auth:login",
  type: "business.flow",
  label: "Login flow",
  statuses: ["pending", "ready", "error"],
});
```

```bash
pnpm exec openruntime run-action --url http://localhost:3000/login auth.login --payload '{"username":"demo"}'
pnpm exec openruntime snapshot --url http://localhost:3000/login --id business:auth:login
pnpm exec openruntime verify business:auth:login ready --url http://localhost:3000/login --timeout 10000
```

### 读取发布说明

```bash
pnpm exec openruntime snapshot --url <url> --query release-notes
pnpm exec openruntime verify business:release-notes:content ready --url <url> --timeout 10000
```

### 等待 remote ready

```bash
pnpm exec openruntime snapshot --url <url> --query opsConsoleProvider
pnpm exec openruntime wait-for mf:remote:opsConsoleProvider ready --url <url> --timeout 10000
```

remote ready 只证明底层加载链路。最终业务成功仍需要 business target。

### console 错误转 debug snapshot

```ts
window.addEventListener("error", (event) => {
  runtime.updateSnapshot({
    id: "debug:consumer:runtime-error",
    status: "error",
    data: {
      message: event.message,
      filename: event.filename,
      pathname: location.pathname,
    },
  });
});
```

```bash
pnpm exec openruntime snapshot --url <url> --id debug:consumer:runtime-error
```
