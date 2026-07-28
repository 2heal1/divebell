# 录制浏览器操作并生成脚本

English version: [Record Browser Workflows with an Agent](record-browser-workflows.md)

`record-divebell-workflow` 是一个可以安装到 Agent 的中文 skill。它让用户先在可见浏览器里完成一次真实操作，再由 Agent 根据操作记录、页面状态和可选语音说明，生成可重复运行的 JavaScript 脚本草稿。

这个流程适合“操作过程容易演示，但自动化目标不容易一次说清楚”的任务，例如：

- 浏览并筛选 GitHub Issues，再输出结构化结果
- 在内部系统中完成一组查询和筛选
- 演示一个跨页面流程，并生成可重复执行的脚本

## 演示视频

https://github.com/user-attachments/assets/45669f30-0c10-4a04-9926-5b796c4be946

视频直接展示录制、操作和生成脚本的完整流程。

## 安装

先全局安装 Divebell，并添加录制 Extension：

```bash
npm install --global @divebell/cli
divebell check --fix
divebell extensions add @divebell/extension-imitate
```

将仓库中的 skill 目录安装到支持 skill 的 Agent：

```text
skills/record-divebell-workflow
```

以 Codex 为例，可以将整个目录放入：

```text
~/.codex/skills/record-divebell-workflow
```

skill 直接使用全局 `divebell` 命令，不会把 CLI 加到业务项目中。

## 使用

安装后，对 Agent 说：

```text
使用 record-divebell-workflow，开始录制浏览器操作。
```

Agent 会先运行 `divebell record start` 准备录制文件、跨页面操作采集和可选麦克风录音，再通过 `divebell open about:blank --ui` 打开可见空白页面。CLI 自动准备并注入 Bridge，录制扩展在同一次页面打开中注入录制脚本。录制结果默认保存到当前项目的 `recordings/` 目录，用户不需要提前提供网址或保存位置。

接下来正常操作浏览器即可：

1. 打开目标网页并完成点击、输入和页面跳转。
2. 需要补充目标时，直接通过麦克风说明最终结果。
3. 操作完成后，对 Agent 说“结束”或“完成”。
4. Agent 停止录制，随后通过 `divebell stop` 关闭当前页面，读取录制结果和语音文字，再生成并检查脚本。

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
- 每个操作相对录制开始的时间
- 页面跳转和 DOM 摘要
- Divebell 暴露的页面状态、事件和动作
- 可选麦克风音频、语音文字及时间范围

当前版本不把连续屏幕视频作为可靠产物。这里的“录制”主要指浏览器操作、页面上下文和语音意图。

## 产物

每次录制会在 `recordings/` 下生成一个 `.orrec` 目录，主要包含：

- `manifest.json`：录制状态和文件清单
- `interactions.jsonl`：点击、输入和键盘操作
- `dom-snapshots.jsonl`：操作期间的页面上下文
- `audio.webm`：麦克风音频
- `transcript.json`：带时间信息的语音文字
- `generated-script.mjs`：生成的 JavaScript 脚本草稿

Agent 必须检查脚本是否覆盖用户通过语音说明的最终目标。如果音频存在但没有得到文字，不能把只访问页面的脚本当作最终结果。

## 当前边界

- 浏览器实时语音识别依赖当前浏览器支持情况。
- 没有实时识别文字时，可以在录制结束后使用转写服务处理 `audio.webm`。
- 自动生成的脚本仍应由 Agent 实际运行一次，并确认输出符合用户要求。
- 第一版优先生成脚本；脚本稳定后，再根据用户要求包装成新的 skill。
