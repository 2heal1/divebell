# 录制浏览器操作并生成脚本

English version: [Record Browser Workflows with an Agent](record-browser-workflows.md)

`@divebell/extension-imitate` 是录制浏览器流程的 Extension，并随包提供 `record-divebell-workflow` Agent skill。它让用户先在可见浏览器里完成一次真实操作，再把操作元素、事件顺序和页面结果生成可重复运行的 JavaScript 脚本。录制会默认尝试开启麦克风，但语音只是可选补充；没有说话、没有录到声音或拒绝麦克风权限时都会直接忽略。

这个流程适合“操作过程容易演示，但自动化目标不容易一次说清楚”的任务，例如：

- 浏览并筛选 GitHub Issues，再输出结构化结果
- 在内部系统中完成一组查询和筛选
- 演示一个跨页面流程，并生成可重复执行的脚本

## 演示视频

https://github.com/user-attachments/assets/45669f30-0c10-4a04-9926-5b796c4be946

视频直接展示录制、操作和生成脚本的完整流程。

## 安装

> 下载并安装录制 Extension，然后让 Agent 执行 `divebell record --skill` 读取 Extension 自带的 skill，并按 skill 开始录制。

先全局安装 Divebell，再添加录制 Extension：

```bash
npm install --global @divebell/cli
divebell check --fix
divebell extensions add @divebell/extension-imitate
```

安装成功后，让 Agent 读取 `record` 命令附带的 skill：

```bash
divebell record --skill
```

这条命令只返回 Extension 包内的 `SKILL.md` 路径，不会开始录制。Agent 应读取返回的文件并按其中流程执行，不需要用户再从仓库复制或单独安装 skill。

## 使用

安装后，对 Agent 说：

```text
使用录制 Extension 自带的 skill，开始录制浏览器操作。
```

Agent 会先执行 `divebell record --skill` 并读取返回的 skill，再运行 `divebell record start` 准备录制文件、跨页面操作采集和补充语音采集，随后通过 `divebell open about:blank --ui` 打开可见空白页面。Agent 不需要询问用户是否开启语音，也不需要增加额外参数。CLI 自动准备并注入 Bridge，录制扩展在同一次页面打开中注入录制脚本。录制结果默认保存到当前项目的 `recordings/` 目录，用户不需要提前提供网址或保存位置。

接下来正常操作浏览器即可：

1. 打开目标网页并完成点击、输入和页面跳转。
2. 如果操作本身不能表达最终目标，可以直接说出来，或在聊天中补充一句。
3. 操作完成后，对 Agent 说“结束”或“完成”。
4. Agent 停止录制，读取整理后的操作流程，生成并实际回放脚本，确认结果后再通过 `divebell stop` 关闭页面。

录制命令本身不会重新打开、重置或关闭浏览器。开始准备录制前需要先关闭已有页面；准备完成后必须通过 `divebell open` 打开要录制的页面。如果录制期间被另一次 `divebell open` 替换了页面，停止录制会拒绝混入新页面的数据。

例如，在 GitHub Issues 页面操作时可以说：

```text
获取最近一周关闭的 bug issues，以及最近两周仍然 open 的 bug issues。
返回 JSON，包含编号、标题、状态、更新时间和链接。
```

生成的脚本应完成这项数据任务，而不只是重新打开最后停留的页面。

## 录制内容

当前版本会记录：

- 点击、输入和键盘操作
- 每次操作对应元素的标签、文字、名称和多种稳定识别线索
- 每个操作相对录制开始的时间
- 页面跳转和 DOM 摘要
- Divebell 暴露的页面状态、事件和动作
- 可选麦克风音频、语音文字及时间范围

当前版本不把连续屏幕视频作为可靠产物。这里的“录制”主要指浏览器操作、操作元素、事件顺序和页面结果；语音意图只是可选补充。

## 产物

每次录制会在 `recordings/` 下生成一个 `.orrec` 目录，主要包含：

- `manifest.json`：录制状态和文件清单
- `interactions.jsonl`：点击、输入和键盘操作
- `workflow.json`：按执行顺序整理好的操作步骤和元素识别线索，供 Agent 检查或重新编排
- `dom-snapshots.jsonl`：操作期间的页面上下文
- `audio.webm`：麦克风音频
- `transcript.json`：带时间信息的语音文字
- `generated-script.mjs`：可直接执行的 JavaScript 脚本

生成的脚本会逐步等待录制时的操作元素，完成输入、下拉选择、按键和点击，并检查最终页面是否到达录制结束时的状态。只有检测到非空语音文字时，Agent 才会把它作为补充信息；静音、没有录到声音或拒绝麦克风权限都不会影响脚本生成和回放。密码和文件路径不会写进录制包，运行到这类步骤时会明确要求调用方重新提供。

## 当前边界

- 浏览器实时语音识别依赖当前浏览器支持情况。
- 没有实时识别文字时，可以在录制结束后使用转写服务处理 `audio.webm`。
- 自动生成的脚本会由 Agent 实际运行一次，并确认输出符合用户要求。
- 第一版优先生成脚本；脚本稳定后，再根据用户要求包装成新的 skill。
