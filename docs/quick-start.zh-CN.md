# Divebell 快速体验

English version: [Divebell Quick Start](quick-start.md)

直接打开官方订单工作台：

[打开 Quick Start](https://2heal1.github.io/divebell/quickstart/)

这个页面按一个正常的订单工作台呈现，不在界面里展示 Divebell 教程、Agent 操作步骤
或排查答案。它在内部接入了可控的请求失败、页面声明的恢复动作、按需加载的 Analytics
页面和可重复的内存场景。用户不需要克隆仓库，也不需要先获取源码。

## 安装 Divebell

先全局安装一次 CLI，并确认命令可用：

```bash
npm install --global @divebell/cli
divebell check --fix
divebell --help
```

Divebell 是本机调试工具，不要把 CLI 加入业务项目依赖。

## 从 Agent skill 开始

把完整的 `skills/divebell` 目录安装到支持 skill 的 Agent。Codex 中可以放到：

```text
~/.codex/skills/divebell
```

然后直接对 Agent 说：

```text
使用 Divebell 完成官方 Quick Start：操作订单页面，触发并定位库存失败，
使用页面声明的重试动作恢复流程，并在最后打开 Code Usage 报告。
```

skill 直接使用全局安装的 `divebell` 命令，不会向当前项目添加 CLI 依赖。

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
继续完成 Divebell Quick Start 的内存分析。
```

内存 Extension 会重复 skill 自带的操作场景，并判断浏览器数据是否持续增长。这个过程
不需要应用源码、source map 或 Runtime Core。

## 它解决什么问题

Quick Start 是一个已接入 Divebell 的参考业务项目。Agent 应把它当成一个陌生的真实
页面，通过浏览器证据、Runtime Core 和 Extension 自己完成判断，而不是从页面提示中读取
答案。真正排查并修改业务项目时，Agent 仍然应在用户自己的仓库中工作，最后回到原来的
真实页面验证结果。
