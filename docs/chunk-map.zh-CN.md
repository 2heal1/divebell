# OpenRuntime Chunk Map

## 目标

Chunk Map 建立浏览器实际加载文件与构建源码模块之间的可靠关系。它是代码
执行覆盖率、首屏代码内存、分包、懒加载和预加载分析的前置能力。

第一版只回答事实，不自动修改分包：

- 构建生成了哪些 chunk 和文件。
- 哪些 chunk 属于首屏，哪些属于异步加载。
- 每个 chunk 包含哪些源码模块。
- 每个文件的构建体积。
- chunk 属于哪些入口或路由分组。
- 当前页面加载的 URL 是否能唯一匹配到本次构建。

## 能力边界

### agent-browser

agent-browser 只负责记录页面实际加载的脚本和执行范围。它不读取构建配置，也不猜测
chunk 内的模块。

### Modern.js 构建插件

`@openruntime/modern-plugin/chunk-map` 在 Modern.js 构建阶段读取完整 chunk 和
module 图，输出 `openruntime-chunks.json`。构建插件是 chunk 与源码模块关系的
权威来源。

### Rspack 构建插件

普通 Rspack 项目使用 `@openruntime/rspack-plugin` 生成相同格式的
`openruntime-chunks.json`。它和 Modern.js 插件只负责构建数据，不负责运行分析。

### OpenRuntime

OpenRuntime CLI 使用浏览器 URL、指定路径的 Chunk Map 和构建标识完成匹配。匹配不到、匹配到
多个 chunk 或构建标识不一致时必须停止归因，不能根据文件名猜测。

### source map

Source map 不负责发现 chunk 包含哪些模块。它在后续覆盖率分析中负责把已执行的
打包代码范围还原到原始文件和位置。

## 产物内容

Chunk Map 包含：

- `schemaVersion`：数据格式版本。
- `buildId`：当前构建标识。
- `publicPath`：构建资源前缀。
- `chunks[].id`：chunk 标识。
- `chunks[].assets`：真实输出文件、未压缩体积和对应 source map。
- `chunks[].initial`：是否随入口首次加载。
- `chunks[].entrypoints`：所属入口。
- `chunks[].groups`：构建分组；Modern.js 路由异步 chunk 使用路由模块名。
- `chunks[].modules`：源码模块、模块类型和构建估算体积。
- `chunks[].modules[].owner`：模块属于应用、工作区、第三方依赖、构建运行时
  或未知来源。
- `chunks[].modules[].owner.packageName`：包名。
- `chunks[].modules[].owner.packageVersion`：包版本。
- `chunks[].modules[].owner.packageSubpath`：模块在包内的路径。
- `packages`：按包汇总所在 chunk、首屏/异步归属、模块数量和估算体积。

模块体积用于发现主要组成部分，不等同于压缩后文件体积。压缩、模块合并和运行时
包装会让两者存在差异，最终优化效果必须以重新构建和真实页面测量为准。

第三方包身份优先使用构建工具已经解析的包信息，不只根据 `node_modules` 路径
猜测。pnpm 软链接或缺少直接包信息时才从已解析资源路径补齐名称和版本。
Modern.js 生成在 `node_modules/.modern-js` 下的应用入口仍归为应用代码，不归为
第三方依赖。

## 匹配规则

1. 先检查页面构建标识与 Chunk Map 的 `buildId`。
2. 去掉请求 URL 的域名、查询参数和锚点。
3. 使用完整输出路径匹配，不使用单独文件名猜测。
4. 只有唯一结果才返回 chunk。
5. 无结果、多个结果和版本不一致分别返回明确状态。

## 当前验证

`modern-basic` 的 `verify:chunk-map` 会执行真实生产构建并验证：

- 每个输出 JavaScript 文件都能唯一匹配。
- Chunk Map 文件大小与磁盘产物一致。
- 每个 JavaScript chunk 都包含源码模块。
- 首页和异步 chunk 能正确区分。
- Orders chunk 能归属到 `src/routes/orders/page.tsx`。
- React、React DOM 和 React Router 能识别为带版本的第三方依赖。
- Modern.js 和 OpenRuntime 本地包能识别为工作区依赖。
- Modern.js 自动生成入口不会被误判成第三方依赖。
- 每个 JavaScript 文件都能找到对应的 source map。

## 代码使用分析

从生产构建、启动页面、记录操作到打开报告的完整步骤，见
[分块与代码使用分析](code-usage-analysis.zh-CN.md)。

agent-browser 可以在同一次记录中保存多个阶段，例如首屏和进入 Orders 页面。
每次保存后计数都会重新开始，所以两个阶段不会混在一起。

`openruntime code-usage analyze` 会把浏览器记录的执行范围与指定路径的 Chunk Map、
source map 合并，输出：

- 每个阶段实际出现的 chunk。
- 每个 chunk 映射代码的使用字节和比例。
- 每个原始文件的使用字节和比例。
- 应用代码、工作区包和第三方包的汇总结果。
- 无法与当前构建匹配的脚本 URL，避免静默猜错。

生成分析结果后，可以直接创建并打开交互报告：

```bash
pnpm exec openruntime code-usage report .code-usage-artifacts/report.json
```

报告支持切换阶段，并按包、原始文件和分块查看已执行与未执行体积。使用
`--no-open` 可以只生成同目录的 HTML 文件，`--output` 可以指定输出位置。

这里的“未使用”表示没有在本次明确记录的流程中执行，不表示可以直接删除。
候选分包调整仍需要覆盖代表性用户流程，重新构建并复测首屏和后续交互。

报告中的体积是 source map 能归属的构建代码体积，不是下载压缩体积；没有映射的
构建包装代码不会强行分给某个包。代码记录会影响 JavaScript 引擎自身的优化行为，
所以它用于判断代码是否执行，首屏耗时和内存结论应在关闭记录后单独复测。

执行范围、嵌套分支、UTF-8 字节换算、业务源码归属和计算公式见
[执行体积是怎么计算的](code-usage-analysis.zh-CN.md#执行体积是怎么计算的)。

## 后续能力

下一步加入：

1. 结合缓存、编译体积和访问概率生成分包建议。
2. 区分“整包延后”“包内入口替换”和“业务模块懒加载”等不同建议。
3. 由 Modern.js 构建插件应用候选方案，重新构建和复测后决定是否接受。
