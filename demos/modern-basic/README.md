# Modern.js Basic Demo

这个 demo 用本地 Modern.js 代码接入 `@openruntime/modern-plugin`，用来验收 roadmap 阶段 3 的第一批框架状态。

## 准备

这个 demo 依赖本机的 Modern.js 仓库：`/Users/bytedance/fork_repo/modern.js`。需要先确保那边已经包含 OpenRuntime 所需的 hook，并且依赖已安装。

在仓库根目录先安装依赖并构建：

```bash
pnpm install
pnpm build
```

## 启动

开第一个终端，启动 Bridge：

```bash
pnpm exec openruntime bridge start
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

## 构建检查

```bash
pnpm --filter @openruntime/demo-modern-basic build
```
