# Modern.js Basic Demo

这个 demo 用本地 Modern.js 代码接入 `@openruntime/modern-plugin`，用来验收 roadmap 阶段 3 的第一批框架状态。

## 准备

这个 demo 依赖本机的 Modern.js 仓库：`/Users/bytedance/work/modern.js`。需要先确保那边已经包含 OpenRuntime 所需的 hook，并且依赖已安装。

在仓库根目录先安装依赖并构建：

```bash
pnpm install
pnpm build
```

## 启动

开第一个终端，启动 Bridge：

```bash
pnpm exec openruntime start
```

开第二个终端，启动 Modern.js demo：

```bash
pnpm --filter @openruntime/demo-modern-basic dev
```

然后打开：

```txt
http://localhost:19081/
```

## 验收

在第三个终端执行：

```bash
pnpm --filter @openruntime/demo-modern-basic verify
```

也可以手动查看：

```bash
pnpm exec openruntime runtimes
pnpm exec openruntime targets --url http://localhost:19081/
pnpm exec openruntime snapshot --url http://localhost:19081/
pnpm exec openruntime events --url http://localhost:19081/ --limit 12
```

这个 demo 没有开启 SSR，所以不会出现 `modern:ssr` target。
CSR 模式下也不会默认出现 `modern:hydration` target。

访问 `Orders` 页面后，再执行：

```bash
pnpm exec openruntime snapshot
```

应该能看到 `modern:route` 当前状态。
真实执行过的 loader 会合并在 `modern:route` 的当前 matches 里，不再是独立 target。
route component 正常挂载时不会出现在 snapshot 里，只有加载失败时才会显示错误。

访问 `Broken` 页面后，再执行：

```bash
pnpm exec openruntime events --limit 20
```

应该能看到 loader error 和 route error。

访问 `Component Error` 页面后，再执行：

```bash
pnpm --filter @openruntime/demo-modern-basic verify:route-component-error
```

应该能看到 `modern:route` 是 `error`，当前 pathname 是 `/component-error`，当前 match 里只有失败时才出现 `routeComponent: error`。

## wait-for 路由变化

先让浏览器停在 Home 页面，然后在终端执行：

```bash
pnpm exec openruntime wait-for modern:route ready --where pathname=/orders --timeout 30000
```

命令开始等待后，点击页面上的 `Orders`。命令应该返回成功结果。

## run-action 触发点击

先让浏览器停在 Home 页面，确认页面声明了点击 action：

```bash
pnpm exec openruntime actions --url http://localhost:19081/
```

应该能看到 `demo.click-orders`。

执行点击 action：

```bash
pnpm exec openruntime run-action --url http://localhost:19081/ demo.click-orders
```

然后等待路由进入 Orders：

```bash
pnpm exec openruntime wait-for modern:route ready --url http://localhost:19081/ --where pathname=/orders --timeout 30000
```

## 预期结果

- `runtimes` 里能看到 `http://localhost:19081/` 或当前访问的子路由。
- `targets` 里能看到 `modern:app` 和 `modern:route`。
- `actions` 里能看到 `demo.click-orders`。
- `modern:route` 的 target data 里能看到 routes 清单。
- `snapshot` 里能看到 `modern:route` 的当前 pathname 和 matches。
- `snapshot` 里能看到 `business:ready:modern-demo`。
- `Orders` 页面会在 `modern:route` 的 matches 里体现 loader success。
- `Broken` 页面会在 `modern:route` 上体现错误状态。
- `Component Error` 页面会在 `modern:route` 的当前 match 里体现 `routeComponent: error`。

## 构建检查

```bash
pnpm --filter @openruntime/demo-modern-basic build
```

## Chunk Map 检查

```bash
pnpm --filter @openruntime/demo-modern-basic verify:chunk-map
```

检查会执行一次真实生产构建，确认所有 JavaScript 文件都能唯一映射到
`dist/openruntime-chunks.json`，文件大小一致，并验证 Orders 页面属于异步
chunk 且能还原到 `src/routes/orders/page.tsx`。
检查还会确认 React、React DOM、React Router 等第三方依赖的名称和版本，区分
Modern.js、OpenRuntime 工作区依赖，并避免把 `.modern-js` 自动生成入口误判为
第三方代码。

## 内存稳定性检查

先保持 demo 运行，再在另一个终端执行：

```bash
OPENRUNTIME_AGENT_BROWSER_EXECUTABLE=/path/to/agent-browser \
pnpm --filter @openruntime/demo-modern-basic verify:memory
```

检查会先预热页面，再让首页和 Orders 页面往返 12 次。每轮都会请求垃圾回收并记录 JS heap、DOM 节点和事件监听器，最后将报告、分配记录和前后两份快照保存到 `.memory-artifacts/`。

`verify:memory` 直接执行 `openruntime memory check`。demo 自己只在
`scripts/memory-scenario.mjs` 中描述首页和 Orders 之间的往返操作；浏览器管理、
内存采集、结果计算和文件保存都由 OpenRuntime CLI 完成。

报告的 `verdict` 有两种结果：

- `no-clear-growth`：这次流程没有看到明确的持续增长。
- `suspicious-growth`：回收后仍有持续增长，需要继续对比前后快照和 Top 函数。

可以调整次数或输出目录：

```bash
pnpm --filter @openruntime/demo-modern-basic verify:memory -- --iterations 20 --artifact-dir /tmp/modern-basic-memory
```

## 代码使用检查

完整的首次接入、操作流程、报告解读和常见问题见
[分块与代码使用分析](../../docs/code-usage-analysis.zh-CN.md)。

先执行 `verify:chunk-map` 生成生产构建，并保持 demo 服务运行。然后使用包含代码
记录能力的 agent-browser：

```bash
OPENRUNTIME_AGENT_BROWSER_EXECUTABLE=/path/to/agent-browser \
pnpm --filter @openruntime/demo-modern-basic verify:code-usage
```

检查会分别记录首屏和进入 Orders 页面两个阶段，再把结果还原到业务文件、
OpenRuntime/Modern.js 工作区包以及 React 等第三方包。完整结果保存在
`.code-usage-artifacts/report.json`，摘要会列出体积最大的包和首屏低使用候选。

生成并打开可视化报告：

```bash
pnpm exec openruntime extensions add @openruntime/command-code-usage
pnpm exec openruntime code-usage report demos/modern-basic/.code-usage-artifacts/report.json
```
