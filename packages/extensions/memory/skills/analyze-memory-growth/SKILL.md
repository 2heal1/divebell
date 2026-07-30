---
name: analyze-memory-growth
description: 使用 Divebell Memory Extension 重复当前 Web 项目的真实页面操作，判断 JavaScript 内存、DOM 节点和事件监听器是否持续增长，定位可疑分配并在修改后复测。Use when the user asks to analyze, diagnose, reproduce, fix, or verify a browser memory leak or sustained page-memory growth in the current project with the globally installed divebell command.
---

# 分析页面内存增长

使用 `divebell memory check` 检查一段可重复的真实页面流程。先建立稳定、可复现的场景，再依据多轮增长趋势判断；不要用一次内存读数或一次峰值认定泄漏。

本 Skill 随 `@divebell/extension-memory` 发布，并通过 `divebell memory --skill` 发现。

## 工作原则

- 使用全局安装的 `divebell`，不要向业务项目添加 `@divebell/cli`。
- 优先复现用户报告的操作路径。用户没有给出路径时，从项目说明、路由和现有端到端测试中选择一段会反复创建和销毁页面状态的代表性流程。
- 使用与问题相同的账号、环境和页面路径。复用已有登录状态，不绕过权限边界。
- 优先运行完整的 `memory check`。`memory metrics` 只适合临时观察，不能单独证明存在或不存在泄漏。
- 让每次测量操作回到相同的稳定状态。不要选择会合理增加业务数据、缓存或历史记录且无法清理的流程。
- 修改代码前保存第一次报告；修改后使用相同 URL、场景、预热次数和测量次数复测。

## 1. 确认命令

先运行：

```bash
divebell memory --help
```

如果 `divebell` 不存在，让用户全局安装 `@divebell/cli` 并运行 `divebell setup`。如果没有 `memory` 命令，让用户执行：

```bash
divebell extensions add @divebell/extension-memory
```

不要在业务项目中安装 CLI 或 Extension。

## 2. 确定检查场景

1. 读取项目说明、启动脚本、路由和相关测试，确定项目已有的启动命令和页面地址。
2. 启动项目并确认目标页面可访问。
3. 根据用户的复现步骤选择一次完整循环。常见场景包括页面往返、弹窗打开和关闭、列表刷新、组件反复挂载和卸载。
4. 明确循环开始和结束时可观察的稳定条件，例如固定路径、元素出现、加载状态结束或计数完成。

如果用户没有给出复现路径，而且项目里也找不到可信的代表性流程，先说明缺少的信息，再请用户提供；不要随意挑一个与问题无关的点击动作。

## 3. 编写场景

创建一个导出 `setup` 和 `run` 的 JavaScript 模块：

```js
export default {
  async setup({ page }) {
    await page.waitEval('document.querySelector(\'a[href="/orders"]\') !== null');
  },

  async run({ page }) {
    await page.eval('document.querySelector(\'a[href="/orders"]\').click()');
    await page.waitEval('window.location.pathname === "/orders"');
    await page.eval('document.querySelector(\'a[href="/"]\').click()');
    await page.waitEval('window.location.pathname === "/"');
  },
};
```

- 让 `setup` 只负责进入稳定的初始状态。
- 让 `run` 完成一次可重复循环，并在返回初始状态后结束。
- 每次点击、跳转或异步操作后使用 `waitEval` 等待明确结果。
- 仅在页面没有可靠可观察条件时使用短暂延迟。
- 一次性分析时把场景放在临时目录；只有用户希望长期复测时才把它保存在项目中。

## 4. 执行完整检查

默认使用 3 次预热和 12 次测量：

```bash
divebell memory check \
  --url <目标页面地址> \
  --scenario <场景文件路径> \
  --warmup 3 \
  --iterations 12 \
  --artifact-dir <结果目录>
```

检查失败时，先区分页面没有启动、场景等待条件错误、登录状态失效和内存采集失败。修正场景或环境后重新运行，不要把检查工具失败写成应用内存问题。

## 5. 判断结果并定位原因

读取 `report.json`，重点检查：

- `verdict` 和 `reasons`；
- 内存、DOM 节点和事件监听器的前后差值；
- 它们每轮的增长趋势；
- 分配最多的函数。

按下面的边界报告：

- `no-clear-growth` 只表示这段场景和本次轮数中没有发现明确持续增长，不表示所有页面都绝对没有泄漏。
- `suspicious-growth` 表示存在值得定位的持续增长信号；结合具体增长项、相关页面代码和前后快照确认原因。
- 分配多不等于无法回收。不要仅凭分配最多的函数认定它就是泄漏点。

发现可疑增长时，优先检查这段流程涉及的事件监听器、定时器、订阅、观察器、全局集合、缓存，以及组件销毁时是否完成清理。只有用户要求修复时才修改代码；修改后必须用完全相同的检查场景复测。

## 6. 汇报

清楚说明：

1. 实际重复了哪段页面操作；
2. 运行了多少次；
3. 哪些指标持续增长或保持稳定；
4. 判断结果及其依据；
5. 报告、分配记录和前后快照的路径；
6. 如果做了修复，修复前后的同场景对比结果。
