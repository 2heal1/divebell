# Module Federation 可观测接入指南

English version: [Module Federation Observability](module-federation-observability.md)

需要通过 Divebell CLI 排查 MF 页面时，安装 [`@divebell/extension-mf`](../packages/extensions/mf/README.md)，它提供 `divebell mf` 命令。一次性页面调试使用 `divebell open <url> --mf` 即可，不要求业务应用预先安装 observability plugin。

`@module-federation/observability-plugin` 是 Divebell 复用的 Module Federation 官方接入路径。它从 MF 自己的 runtime hook 记录结构化加载证据，让 Coding Agent 找到具体失败阶段和可能的负责方，不必根据 DOM 或 Network 结果反推 MF 内部状态。

这个包是用于长期采集的 Module Federation runtime plugin，不是 CLI Extension。只有应用需要持续记录、上传或保留 MF 报告时，才应把它安装在 MF consumer 中。它本身不会增加一条独立的 `divebell` 命令。

## 插件提供什么

observability plugin 会记录：

- consumer 和匹配到的 remote。
- manifest 与 remoteEntry 的解析和加载过程。
- expose 解析与模块工厂执行过程。
- shared 依赖选择、版本不匹配和 eager 边界问题。
- preload 和恢复路径。
- 运行时错误码、失败阶段和完整加载时间线。
- 由应用代码显式上报的可选组件 ready 信号。

报告会区分运行时加载和业务 ready。remote 或 expose 已经加载，只能证明 Module Federation runtime 完成了这一层工作，不能证明消费方页面已经正确渲染或业务数据已经准备好。

## 长期应用接入

应用需要持续采集 MF 报告时，在 MF consumer 中安装：

```bash
pnpm add @module-federation/observability-plugin
```

把插件注册到实际加载 remote 的同一个 Module Federation runtime 实例：

```ts
import { createInstance } from "@module-federation/runtime";
import { ObservabilityPlugin } from "@module-federation/observability-plugin";

createInstance({
  name: "host",
  remotes: [],
  plugins: [
    ObservabilityPlugin({
      level: "verbose",
      browser: {
        enabled: true,
        scope: "host",
      },
    }),
  ],
});
```

浏览器输出默认关闭，需要显式开启。每个 runtime 实例应使用稳定且唯一的 `scope`。插件默认不会上传报告；生产环境的上报和保留策略仍由应用决定。

## 读取证据

开启浏览器输出后，可以从对应 scope 的 reader 读取报告：

```js
window.__FEDERATION__.__OBSERVABILITY__.host.getLatestReport();
window.__FEDERATION__.__OBSERVABILITY__.host.findReports({
  remote: "remote1",
});
```

先看 `diagnosis`、`summary.outcome`、`summary.phases` 和 `traceId`，只有需要更多细节时再展开事件时间线。字段缺失表示插件没有观察到这项事实，不能把它当成成功或失败。

MF 接入向 Divebell 暴露 Target 和报告 Action 后，同一份证据可以通过普通 Runtime 流程选择和等待：

```bash
divebell targets --type mf.remote
divebell targets --type mf.remote.expose
divebell targets --type mf.shared
divebell run-action mf:list-reports \
  --payload '{"remote":"remote1"}'
```

验证用户流程时，应等待真正依赖的具体 expose 或 shared 依赖，不要只看 remote 汇总状态。

## 使用边界

- 接入应保留在 Module Federation observability plugin 中。缺少正式信号时，应在 MF runtime 补 hook，而不是在 Divebell 一侧增加探测逻辑。
- 不要只根据 `window.__FEDERATION__` 判断 shared provider。应使用 observability 报告、`mf.shared` Target，或者明确标注为浏览器兜底的证据。
- 不要把 runtime 加载成功当成业务页面成功。应单独验证消费方页面，或者增加由应用负责的明确 ready 信号。
- 不允许修改源码时，Console、Network、截图和运行时错误码仍可作为兜底证据，但不能把它们写成 MF 结构化状态。
