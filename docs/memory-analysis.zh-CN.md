# 内存分析指南

English version: [Memory Analysis Guide](memory-analysis.md)

`@divebell/extension-memory` 会重复一段真实页面操作，检查 JavaScript 内存、DOM 节点
和事件监听器是否持续增长，并保存进一步定位问题所需的报告和快照。任何能由 Divebell
打开的 Chrome 页面都可以使用。

## 让 Agent 分析当前项目

### 1. 安装 Skill

先全局安装 Divebell，完成浏览器准备，再添加 Memory Extension：

```bash
npm install --global @divebell/cli
divebell setup
divebell extensions add @divebell/extension-memory
```

然后获取 Extension 自带的 Skill：

```bash
divebell memory --skill
```

把命令返回的 `SKILL.md` 安装到 Agent。也可以让 Agent 直接执行这条命令并加载返回的
Skill。不要把 CLI 加到业务项目中。

### 2. 告诉 Agent 使用这个 Skill

在当前项目中发送：

```text
使用 $analyze-memory-growth 分析当前项目。
```

Agent 会识别项目的启动方式和可重复页面流程，执行多轮检查，判断是否存在持续增长；
如果需要修改代码，还会使用相同场景重新验证。

## 一条命令完成检查

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
divebell memory check \
  --url http://localhost:19081/ \
  --scenario ./scripts/memory-scenario.mjs \
  --warmup 3 \
  --iterations 12 \
  --artifact-dir ./.memory-artifacts
```

Memory Extension 会自动完成打开页面、预热、前后指标、分配记录、重复操作、前后快照、
结果判断和关闭页面。场景文件只描述项目特有的页面操作，不需要调用子进程、解析命令
输出或自己管理采集状态。

结果目录包含：

- `report.json`：增长趋势、判断结果和主要分配函数。
- `allocation.heapprofile`：操作期间的分配记录。
- `baseline.heapsnapshot`：开始重复操作前的快照。
- `final.heapsnapshot`：完成重复操作后的快照。

下面的命令用于临时观察或高级排查；普通的完整检查优先使用 `memory check`。

## 快速检查当前页面

```bash
divebell open https://example.com/
divebell memory metrics
```

`metrics` 会先自动清理已经不用的临时内存，再返回当前 JavaScript 内存、文档数量、
DOM 节点数量和事件监听器数量。用户不需要单独执行清理命令。节点数量指 DOM 节点，
不是组件数量。

极少数情况下需要观察清理前的瞬时占用，可以使用 `memory metrics --no-gc`。这个选项
不适合用来判断是否存在持续增长。

## 记录一段操作的内存分配

开始记录：

```bash
divebell memory sampling start --sampling-interval 32768
```

接着使用 Divebell CLI 操作页面，例如点击、输入、跳转或执行页面声明的动作。
完成后停止记录：

```bash
divebell memory sampling stop /tmp/page.heapprofile --top 20
```

命令会保存完整记录，并返回分配内存最多的函数。

## 保存堆快照

```bash
divebell memory snapshot /tmp/page.heapsnapshot \
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
