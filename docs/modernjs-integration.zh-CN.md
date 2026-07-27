# Modern.js 接入指南

English version: [Modern.js Integration](modernjs-integration.md)

`@openruntime/modern-plugin` 是 OpenRuntime 面向 Modern.js 的官方页面侧接入。它把 Modern.js 本来就知道的生命周期信息转换成稳定的 OpenRuntime 事实，让 Coding Agent 直接检查框架状态，不必根据 DOM 文本、Console 信息或 Network 时机猜测。

这个包是 Modern.js runtime plugin，不是 CLI Extension。它需要安装到应用中，并在 `src/modern.runtime.ts` 注册。没有这个插件仍然可以使用 OpenRuntime；只有任务需要路由、loader、SSR 或 hydration 等框架内部证据时，才需要接入。

## 插件提供什么

插件会注册并更新：

- `modern:app`：Modern.js 应用的整体渲染状态。
- `modern:route`：当前路由、路由清单、导航状态和当前匹配链。
- 当前路由匹配链中的 loader、redirect、路由组件和路由错误。
- `modern:ssr`：存在 SSR 信息时的服务端渲染状态。
- `modern:hydration`：Modern.js 发出 hydration 事件时的浏览器接管状态。
- 可选的路由列表和路由导航 Action。

这些信息只说明框架生命周期。路由已经 ready，不等于业务数据或用户流程已经可用。业务成功条件应由业务 Target 表达，或者使用相符的页面和请求结果验证。

## 接入方式

安装依赖：

```bash
pnpm add @openruntime/modern-plugin
```

在 `src/modern.runtime.ts` 中注册：

```ts
import { defineRuntimeConfig } from "@modern-js/runtime";
import { openRuntimeModernPlugin } from "@openruntime/modern-plugin";

export default defineRuntimeConfig({
  plugins: [
    openRuntimeModernPlugin({
      bridge: {
        port: 17321,
      },
    }),
  ],
});
```

当前接入建议适用于 Modern.js `>=3.4.0` 或 preview 版本，这些版本提供了所需的正式框架 hook。更老的版本应使用 [`@openruntime/core`](runtime-core-api.zh-CN.md) 暴露最小且稳定的业务信号，不要通过浏览器现象拼凑缺失的框架生命周期。

路由导航会改变页面状态，因此对应 Action 默认关闭，需要时再显式开启：

```ts
openRuntimeModernPlugin({
  injectRouteListAction: true,
  injectRouteNavigateAction: true,
});
```

## 验证接入

通过 CLI 打开页面，再确认 Runtime 和 Modern.js Target 已经出现：

```bash
openruntime open http://localhost:3000/
openruntime runtimes
openruntime targets --query modern
openruntime snapshot --query modern
```

任务依赖页面跳转时，等待具体路由：

```bash
openruntime wait-for modern:route ready \
  --where pathname=/orders \
  --timeout 30000
```

如果一个页面包含多个 Runtime，按照[浏览器连接与多 Runtime 使用指南](runtime-connections.zh-CN.md)选择目标实例。

## 相关能力

同一个包还提供 `@openruntime/modern-plugin/chunk-map`，用于在构建时生成 Chunk Map。只有任务需要把浏览器里的代码执行情况还原到源码和依赖时才使用这个独立入口，详见[代码使用分析](code-usage-analysis.zh-CN.md)。

完整的 Target 字段、路由 Action、Garfish helper 和业务 ready helper 见 [`@openruntime/modern-plugin` 包说明](../packages/modern-plugin/README.md)。
