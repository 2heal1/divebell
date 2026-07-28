# Modern.js 接入指南（WIP）

English version: [Modern.js Integration](modernjs-integration.md)

> **WIP：**普通项目暂时不要接入 `@divebell/modern-plugin`。这项 runtime 接入依赖新的 Modern.js 生命周期 hook，而这些 hook 尚未随 Modern.js 正式版本发布。在兼容版本发布并完成验证前，请使用浏览器证据，或通过 [`@divebell/core`](runtime-sdk-api.zh-CN.md) 暴露最小且稳定的应用信号。

`@divebell/modern-plugin` 是 Divebell 规划中的 Modern.js 官方页面侧接入。它把 Modern.js 本来就知道的生命周期信息转换成稳定的 Divebell 事实，让 Coding Agent 直接检查框架状态，不必根据 DOM 文本、Console 信息或 Network 时机猜测。

这个包是 Modern.js runtime plugin，不是 CLI Extension。下面的内容用于维护者配合包含所需 hook 的 Modern.js 源码检出进行开发验证，不是当前面向普通项目的安装指南。

## 插件提供什么

插件会注册并更新：

- `modern:app`：Modern.js 应用的整体渲染状态。
- `modern:route`：当前路由、路由清单、导航状态和当前匹配链。
- 当前路由匹配链中的 loader、redirect、路由组件和路由错误。
- `modern:ssr`：存在 SSR 信息时的服务端渲染状态。
- `modern:hydration`：Modern.js 发出 hydration 事件时的浏览器接管状态。
- 可选的路由列表和路由导航 Action。

这些信息只说明框架生命周期。路由已经 ready，不等于业务数据或用户流程已经可用。业务成功条件应由业务 Target 表达，或者使用相符的页面和请求结果验证。

## 规划中的接入方式

安装依赖：

```bash
pnpm add @divebell/modern-plugin
```

在 `src/modern.runtime.ts` 中注册：

```ts
import { defineRuntimeConfig } from "@modern-js/runtime";
import { divebellModernPlugin } from "@divebell/modern-plugin";

export default defineRuntimeConfig({
  plugins: [
    divebellModernPlugin({
      bridge: {
        port: 17321,
      },
    }),
  ],
});
```

目前没有任何已发布的 Modern.js 版本被声明为兼容。不要根据版本号或 `preview` 标记推断可用性。Modern.js 发布所需 hook、且本接入完成对应版本验证后，本文会移除 WIP 提示并写明准确的支持版本范围。

路由导航会改变页面状态，因此对应 Action 默认关闭，需要时再显式开启：

```ts
divebellModernPlugin({
  injectRouteListAction: true,
  injectRouteNavigateAction: true,
});
```

## 维护者验证

通过 CLI 打开页面，再确认 Runtime 和 Modern.js Target 已经出现：

```bash
divebell open http://localhost:3000/
divebell runtimes
divebell targets --query modern
divebell snapshot --query modern
```

任务依赖页面跳转时，等待具体路由：

```bash
divebell wait-for modern:route ready \
  --where pathname=/orders \
  --timeout 30000
```

如果一个页面包含多个 Runtime，按照[浏览器连接与多 Runtime 使用指南](runtime-connections.zh-CN.md)选择目标实例。

## 相关能力

同一个包还提供 `@divebell/modern-plugin/chunk-map`，用于在构建时生成 Chunk Map。这个入口不使用尚未发布的 Modern.js runtime 生命周期 hook，因此不受 runtime 接入 WIP 状态影响。只有任务需要把浏览器里的代码执行情况还原到源码和依赖时才使用它，详见[代码使用分析](code-usage-analysis.zh-CN.md)。

完整的 Target 字段、路由 Action、Garfish helper 和业务 ready helper 见 [`@divebell/modern-plugin` 包说明](../packages/modern-plugin/README.md)。
