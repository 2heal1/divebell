# 分块与代码使用分析

这是一项可选的深度分析能力。它用来回答：线上页面加载了哪些分块，这些分块里的
业务文件和第三方依赖实际执行了多少，哪些代码适合延后加载或重新分块。

普通内存检查不需要安装任何构建插件，直接使用 OpenRuntime CLI 即可，见
[内存分析指南](memory-analysis.zh-CN.md)。只有需要把浏览器中的代码记录还原到分块、
源码文件和依赖包时，才需要下面的接入。

先安装分析命令：

```bash
openruntime commands add @openruntime/command-code-usage
```

## 整体流程

```text
构建插件生成 Chunk Map 和 source map
                  ↓
OpenRuntime CLI 记录目标页面的代码执行情况
                  ↓
OpenRuntime CLI 读取指定的 Chunk Map 和构建目录
                  ↓
生成 JSON 和可视化报告
```

构建插件只负责提供准确的构建关系。记录、分析和报告都由 OpenRuntime CLI 完成，
项目不需要自己实现分析逻辑。

## 1. 安装对应的构建插件

### Modern.js 项目

安装 `@openruntime/modern-plugin`，然后在 `modern.config.ts` 中加入：

```ts
import { appTools, defineConfig } from '@modern-js/app-tools';
import { openRuntimeChunkMapPlugin } from '@openruntime/modern-plugin/chunk-map';

export default defineConfig({
  plugins: [appTools(), openRuntimeChunkMapPlugin()],
});
```

### 普通 Rspack 项目

安装 `@openruntime/rspack-plugin`，然后在 Rspack 配置中加入：

```ts
import { OpenRuntimeChunkMapRspackPlugin } from '@openruntime/rspack-plugin';

export default {
  plugins: [new OpenRuntimeChunkMapRspackPlugin()],
};
```

两种插件会生成相同格式的 `openruntime-chunks.json`。生产构建还需要保留 JavaScript
文件及对应的 `.js.map` 文件，否则只能知道分块关系，不能准确还原到源码和依赖包。

可以改变 Chunk Map 的文件名：

```ts
openRuntimeChunkMapPlugin({ filename: 'meta/chunks.json' })
```

Rspack 插件也支持同一个 `filename` 选项。

## 2. 记录页面中的代表性流程

先打开要测试的页面。页面可以是本地地址，也可以是线上地址：

```bash
pnpm exec openruntime open https://example.com/
pnpm exec openruntime coverage start
```

等待首屏稳定后保存第一阶段：

```bash
pnpm exec openruntime coverage take /tmp/first-screen.coverage.json \
  --label first-screen
```

继续使用 `click`、`fill`、`goto` 或项目声明的动作完成下一段真实操作，然后保存并结束：

```bash
pnpm exec openruntime coverage stop /tmp/orders.coverage.json \
  --label orders
```

每次 `take` 后，下一阶段会重新计数。因此“Orders 阶段”表示进入 Orders 这段操作
新增执行了什么，不会和首屏混在一起。

## 3. 指定 Chunk Map，让 CLI 完成分析

```bash
pnpm exec openruntime code-usage analyze \
  --chunk-map /path/to/production-dist/openruntime-chunks.json \
  --coverage /tmp/first-screen.coverage.json \
  --coverage /tmp/orders.coverage.json \
  --output /tmp/code-usage-report.json
```

`--chunk-map` 可以指向任意本地路径。测试线上页面时，将线上正在运行的那一次构建
产物下载或保留在本地，再把它的 Chunk Map 路径传给 CLI。页面地址和构建文件不需要
位于同一台机器，但必须属于同一次构建。

默认会从 Chunk Map 所在目录读取 JavaScript 和 source map。如果它们放在另一个目录，
使用：

```bash
pnpm exec openruntime code-usage analyze \
  --chunk-map /path/to/metadata/openruntime-chunks.json \
  --assets /path/to/production-dist \
  --coverage /tmp/first-screen.coverage.json \
  --output /tmp/code-usage-report.json
```

可以重复传入 `--coverage`，顺序就是报告中的阶段顺序。

## 执行体积是怎么计算的

### 1. Chrome 提供执行范围

`coverage start` 会开启 Chrome 的精确代码记录。Chrome 按脚本和函数返回构建后
JavaScript 中的范围：

```json
{
  "functionName": "loadOrders",
  "ranges": [
    { "startOffset": 1200, "endOffset": 1800, "count": 3 },
    { "startOffset": 1500, "endOffset": 1600, "count": 0 }
  ]
}
```

- `startOffset` 和 `endOffset` 是构建后 JavaScript 中的字符位置。
- `count > 0` 表示这段范围执行过。
- `count = 0` 表示没有执行。
- 加上 `coverage start --call-count` 后，`count` 可以用于查看调用次数；体积分析只判断
  是否执行，不会把体积乘以调用次数。

函数范围可能嵌套。上面的例子表示函数整体调用了 3 次，但 1500～1600 的分支没有
进入。OpenRuntime 会在所有范围边界处分段，并使用最小的内层范围判断这一段是否执行，
因此不会因为外层函数执行过就把未进入的分支算进去。

每次 `coverage take` 都会取得上一个阶段以来的数据并重置 Chrome 的执行计数。
`coverage stop` 会保存最后一个阶段并结束记录。

### 2. 把字符范围换算成构建字节

Chrome 的位置使用 JavaScript 字符位置，报告使用 UTF-8 字节。OpenRuntime 会先读取
本次构建的真实 JavaScript 文件，为每个字符位置建立对应的 UTF-8 字节位置，再计算
执行范围覆盖了多少字节。这样包含中文或其他多字节字符时不会按字符数误算。

多个函数或嵌套范围覆盖同一段代码时会先合并，避免重复计数。一段代码执行一次和执行
一万次，执行体积相同。

### 3. 还原到分块、源码和依赖包

计算顺序是：

1. 使用脚本 URL 和 Chunk Map 找到唯一的构建文件和 chunk。
2. 使用 source map 将构建文件中的每段代码还原到原始源码路径。
3. 使用 Chunk Map 中的模块归属，判断源码属于业务代码、工作区包或第三方依赖。
4. 计算每个来源映射范围与已执行范围的重叠字节。
5. 按源码文件、包和 chunk 分别汇总。

计算口径为：

```text
来源总构建体积 = source map 能归属给该来源的构建后字节数
来源执行体积   = 上述构建范围与 Chrome 已执行范围重叠的字节数
使用比例       = 来源执行体积 ÷ 来源总构建体积
```

例如某个依赖在构建产物中可归属的代码为 60 KB，本次流程执行范围与其中 12 KB 重叠，
报告会显示：

```text
总构建体积：60 KB
执行体积：12 KB
使用比例：20%
```

这里不会使用原始源码文件的磁盘大小，也不会使用压缩后的网络大小。

## 业务代码能否计算执行体积

可以。构建插件会把项目自身的模块标记为 `application`，并保存它所在的 chunk 和源码
路径。source map 再把浏览器执行范围还原到具体业务文件，例如：

```text
src/routes/orders/page.tsx
src/components/OrderTable.tsx
src/hooks/useOrders.ts
```

因此报告可以分别显示每个业务文件的：

- 它在构建产物中对应的总字节数。
- 当前阶段实际执行的字节数。
- 未执行字节数和使用比例。
- 所在的首屏或异步 chunk。

这里的“业务文件执行体积”仍然是该文件经过 TypeScript、JSX、编译和打包后，在最终
JavaScript 中对应的体积。它不是原始 `.tsx` 文件大小。这正是优化分包时需要的口径，
因为浏览器最终加载和执行的是构建后的 JavaScript。

业务代码归属需要满足：

- Chunk Map、JavaScript 和 source map 来自同一次构建。
- source map 中的源码路径能与 Chunk Map 中的业务模块对应。
- 代码不是无法追踪来源的 `eval`、动态字符串或没有映射的构建包装代码。

无法映射的字节不会强行分给某个业务文件，也不会进入文件或包的体积统计；整个脚本
无法与当前构建对应时，会列入“无法匹配的文件”。被 tree shaking 完全移除的业务代码
不会出现在构建产物里，因此也不属于“加载但未执行”的范围。

## 4. 打开可视化报告

```bash
pnpm exec openruntime code-usage report /tmp/code-usage-report.json
```

命令会在 JSON 旁生成 HTML 并打开。只生成文件时使用 `--no-open`，自定义保存位置时
使用 `--output <report.html>`。

## 报告怎么看

1. 报告默认展示业务代码，先看首屏中体积大、使用比例低的源码文件。
2. 切换到“依赖包”，检查体积大但当前阶段使用较少的第三方依赖和工作区包。
3. 切换到“全部文件”，确认问题来自具体哪个源码文件。
4. 切换到“分块”，确认这些文件是否已经随首屏加载。
5. 补充其他关键用户流程，避免把“这次没走到”误判成“项目不需要”。
6. 调整懒加载或分块后重新构建并重复记录。
7. 关闭代码记录，单独复测首屏速度、缓存和内存，确认整体结果确实变好。

“业务代码”只展示应用源码，并隐藏框架在构建时生成的中间文件。这些中间文件仍可在
“全部文件”中查看。

不同阶段是独立计数。某个包在 Orders 阶段显示 0%，不表示它从未执行，只表示该阶段
没有再次执行。“未执行”也不等于可以删除，它首先是延后加载或重新分块的候选。

## 线上测试注意事项

- Chunk Map、JavaScript 和 source map 必须来自线上页面正在使用的同一次构建。
- 报告中“无法匹配的文件”不为零时，先检查构建版本或第三方外部脚本。
- 不要只根据相同文件名猜测归属，CLI 只接受唯一、准确的构建对应关系。
- 代码记录会影响浏览器自身优化，因此它只用来判断代码是否执行；时间和内存需要关闭
  记录后单独测量。

## 仓库内的完整示例

```bash
pnpm --filter @openruntime/demo-modern-basic verify:chunk-map
pnpm --filter @openruntime/demo-modern-basic serve
```

保持服务运行，在另一个终端执行：

```bash
OPENRUNTIME_AGENT_BROWSER_EXECUTABLE=/path/to/agent-browser \
pnpm --filter @openruntime/demo-modern-basic verify:code-usage

pnpm exec openruntime code-usage report \
  demos/modern-basic/.code-usage-artifacts/report.json
```

示例脚本只负责定义“首屏”和“进入 Orders”这两个代表性操作。最终分析仍由
OpenRuntime CLI 执行。
