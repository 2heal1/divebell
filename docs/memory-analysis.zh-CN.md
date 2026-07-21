# 内存分析指南

English version: [Memory Analysis Guide](memory-analysis.md)

普通内存分析由独立扩展包提供，不依赖 Modern.js、Rspack 或 Chunk Map，也不要求项目
安装构建插件。任何能由 OpenRuntime 打开的 Chrome 页面都可以使用。先安装一次：

```bash
openruntime extensions add @openruntime/extension-memory
```

## 推荐方式：一条命令完成检查

项目只需要写出要重复的页面操作。例如：

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

保存为 `scripts/memory-scenario.mjs`，然后执行：

```bash
openruntime memory check \
  --url http://localhost:19081/ \
  --scenario ./scripts/memory-scenario.mjs \
  --warmup 3 \
  --iterations 12 \
  --artifact-dir ./.memory-artifacts
```

CLI 会自动完成打开页面、预热、前后指标、分配记录、重复操作、前后快照、结果判断和
关闭页面。场景文件只描述项目特有的页面操作，不需要调用子进程、解析命令输出或自己
管理采集状态。

结果目录包含：

- `report.json`：增长趋势、判断结果和主要分配函数。
- `allocation.heapprofile`：操作期间的分配记录。
- `baseline.heapsnapshot`：开始重复操作前的快照。
- `final.heapsnapshot`：完成重复操作后的快照。

下面的命令用于临时观察或高级排查；普通的完整检查优先使用 `memory check`。

## 快速检查当前页面

```bash
pnpm exec openruntime open https://example.com/
pnpm exec openruntime memory metrics
```

`metrics` 会先自动清理已经不用的临时内存，再返回当前 JavaScript 内存、文档数量、
DOM 节点数量和事件监听器数量。用户不需要单独执行清理命令。节点数量指 DOM 节点，
不是组件数量。

极少数情况下需要观察清理前的瞬时占用，可以使用 `memory metrics --no-gc`。这个选项
不适合用来判断是否存在持续增长。

## 记录一段操作的内存分配

开始记录：

```bash
pnpm exec openruntime memory sampling start --sampling-interval 32768
```

接着使用 OpenRuntime CLI 操作页面，例如点击、输入、跳转或执行页面声明的动作。
完成后停止记录：

```bash
pnpm exec openruntime memory sampling stop /tmp/page.heapprofile --top 20
```

命令会保存完整记录，并返回分配内存最多的函数。这个过程不需要知道页面如何分块。

## 保存堆快照

```bash
pnpm exec openruntime memory snapshot /tmp/page.heapsnapshot \
  --timeout 120000
```

快照用于继续查看当前内存中最大的对象、引用关系和无法回收的路径。默认会先请求一次
垃圾回收；确实需要保留回收前状态时可以使用 `--no-gc`。

## 判断是否持续增长

单次内存变大不等于泄漏。可靠做法是：

1. 先重复几次操作，让页面完成初始化和代码预热。
2. 请求垃圾回收，保存基准指标和快照。
3. 重复同一段操作多次，每轮回收后读取一次指标。
4. 保存最终指标、分配记录和快照。
5. 同时观察 JavaScript 内存、DOM 节点和事件监听器是否持续增长。

仓库中的 `modern-basic` 提供了一个自动往返首页和 Orders 页面的示例：

```bash
OPENRUNTIME_AGENT_BROWSER_EXECUTABLE=/path/to/agent-browser \
pnpm --filter @openruntime/demo-modern-basic verify:memory
```

它直接执行 `openruntime memory check`。项目中只保留一份很短的页面场景文件；内存
采集、状态管理、结果计算和浏览器清理由 OpenRuntime CLI 完成。项目不需要 Chunk Map，
也不需要安装构建分析插件。

## 什么时候才需要分块插件

内存异常时，先使用本页的能力确认“是否持续增长”和“主要由哪些函数分配”。
如果还想进一步判断首屏加载了哪些分块、某个分块里的业务代码和第三方依赖是否实际
执行，再进入可选的[分块与代码使用分析](code-usage-analysis.zh-CN.md)。
