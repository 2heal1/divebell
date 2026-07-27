# OpenRuntime 快速体验

English version: [OpenRuntime Quick Start](quick-start.md)

直接打开官方订单工作台：

[打开 Quick Start](https://2heal1.github.io/openruntime/quickstart/)

这个页面专门用于 Agent 引导体验，包含真实交互、可控的请求失败、页面声明的恢复动作、
按需加载的 Insights 页面和可重复的内存场景。用户不需要克隆仓库，也不需要先获取源码。

## 从 Agent skill 开始

把完整的 `skills/openruntime` 目录安装到支持 skill 的 Agent。Codex 中可以放到：

```text
~/.codex/skills/openruntime
```

然后直接对 Agent 说：

```text
使用 OpenRuntime 完成官方 Quick Start：操作订单页面，触发并定位库存失败，
使用页面声明的重试动作恢复流程，并在最后打开 Code Usage 报告。
```

skill 会优先复用本机已有的 OpenRuntime。没有可用命令时，它会通过 pnpm 的包缓存启动
固定版本的官方 CLI，不会向当前项目添加依赖。

## 这条流程能体验什么

1. **操作页面**：从页面快照中找到控件，搜索、筛选、选择订单并切换页面。
2. **查看浏览器证据**：从 Network 找到失败地址和状态，从 Console 找到对应错误。
3. **理解应用状态**：读取页面声明的状态，确认履约流程因为库存请求而阻塞。
4. **恢复并验证**：执行页面允许的重试动作，等待履约状态真正恢复。
5. **继续分析**：分别记录首屏和按需加载的 Insights 页面，生成并打开代码使用报告。

前四步只使用已部署的页面，不需要源码。高阶代码分析会把浏览器记录与同一次部署的
JavaScript、source map 和 Chunk Map 结合起来。只有 source map 不能说明哪些代码实际
执行过。

## 可选的内存体验

同一个页面还提供了可控的内存场景。继续对 Agent 说：

```text
继续完成 OpenRuntime Quick Start 的内存分析。
```

内存 Extension 会重复 skill 自带的操作场景，并判断浏览器数据是否持续增长。这个过程
不需要应用源码、source map 或 Runtime Core。

## 它解决什么问题

Quick Start 是一个能力体验页，让新用户在同一个稳定页面里看到浏览器能力、Runtime
Core 和 Extension 如何配合。真正排查并修改业务项目时，Agent 仍然应在用户自己的
仓库中工作，最后回到原来的真实页面验证结果。
