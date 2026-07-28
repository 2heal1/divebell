---
name: record-divebell-workflow
description: 录制用户在已接入 Divebell 的网页中的人工浏览器操作和可选麦克风语音，并在用户说结束后由 Agent 通过全局 Divebell CLI 收尾、关闭浏览器、读取 .orrec 录制包、转写语音时间轴并生成 JS 脚本草稿。Use when the user wants an agent-installable workflow skill for recording browser actions and optional microphone narration, converting recorded Divebell evidence into an automation script, or drafting a reusable skill/script from a manual web workflow with the globally installed divebell command.
---

# 录制 Divebell 流程

本 skill 用于让 Agent 主导一次“用户手动操作浏览器，Agent 录制并生成脚本”的流程。
第一版默认生成 JS 脚本，不默认直接生成 skill。脚本更容易运行、验证和修正；当脚本稳定后，再包装成 skill。

## 工作原则

- 使用全局安装的 `divebell` 命令操作页面，不要向当前业务项目添加
  `@divebell/cli`。
- 开始前运行 `divebell record --help`。如果命令不存在，先让用户执行
  `npm install --global @divebell/cli`；如果缺少 `record`，执行
  `divebell extensions add @divebell/extension-imitate`。
- 如果 CLI 或录制命令不可用，读取 `references/divebell-cli.md`，不要回退到项目
  本地依赖或临时下载的 CLI。
- 默认先运行 `record start` 准备录制，再通过 `divebell open about:blank --ui` 打开可见页面。不要先询问“要录制哪个网页”，除非用户已经主动给了 URL。
- 默认保存到当前项目的 `recordings/` 目录。不要询问保存位置，除非用户主动指定。
- 用户说“结束”“完成”“done”后，再调用 stop。
- `record stop` 会生成 `generated-script.mjs`，但不会关闭浏览器；收尾时必须再运行 `divebell stop`。
- 第一版录制包会保存鼠标点击、输入、键盘事件、事件相对录制开始的时间、页面快照、DOM 摘要、Divebell 结构化状态和可选麦克风音频。连续视频还不是可靠产物。
- 使用 `--mic` 时，浏览器会申请麦克风权限，并把音频保存为 `audio.webm`、`audio-chunks.jsonl` 和 `audio-events.jsonl`。如果权限被拒绝，必须读取 `audio-events.jsonl` 和 manifest 里的失败原因。
- 页面跳转、搜索或打开新页面后，中间的点击和输入也应该保留在 `interactions.jsonl`。不要只按最后停留的 URL 判断录制结果。
- 如果环境里存在 `OPENAI_API_KEY`，用户结束后优先调用 `record transcribe` 生成 `transcript.json`；没有 key 时先读取 `transcript.json`，如果它仍然没有文字，不能把只打开 URL 的脚本当成完成，必须告诉用户缺少语音意图文字，并请用户补一句文字需求或提供转写能力。
- 生成脚本后必须读取脚本、`manifest.json`、`interactions.jsonl`、`transcript.json` 和 `dom-snapshots.jsonl`，再向用户说明产物路径和当前限制。

## 确认 CLI

录制前先运行：

```bash
divebell record --help
```

如果 `divebell` 不存在，先完成全局安装；如果顶层帮助中没有 `record`，安装录制
Extension。确认帮助可读后再继续，不要使用项目本地 CLI。

## 启动录制

1. 确认当前没有 Divebell 页面仍在打开。如果有，先运行 `stop`。然后准备录制：

```bash
divebell record start --mic
```

录制包默认放到当前项目的 `recordings/` 下。读取命令返回的 JSON，确认 `status` 是 `prepared`，并把 `output` 字段记下来，后续 stop 必须使用这个路径。如果不需要录音，去掉 `--mic`。

2. 用户没有主动给 URL 时，打开可见空白页面。如项目需要指定 Bridge，把 `--bridge <url>` 或 `--port <port>` 放在这条 `open` 命令上：

```bash
divebell open about:blank --ui
```

用户已经主动给 URL 时，直接把它作为 `open` 的地址：

```bash
divebell open <url> --ui
```

`open` 会在同一次页面启动中注入 Bridge 和录制脚本。不要把 URL、Bridge 或页面显示参数传给 `record start`。

3. `open` 成功后，读取录制包的 `manifest.json`，确认 `status` 已变为 `recording`。然后告诉用户浏览器已经打开，可以开始操作；操作完成后直接说“结束”或“完成”。
4. 在用户结束前，不要关闭浏览器，也不要提前生成脚本。

## 用户说结束后

运行：

```bash
divebell record stop --out <start-output-path>
```

这个命令会采集结束时的 Divebell 状态和页面快照，并在录制包里生成：

- `manifest.json`
- `runtime.jsonl`
- `page-snapshots.jsonl`
- `dom-snapshots.jsonl`
- `interactions.jsonl`
- `audio.webm`
- `audio-chunks.jsonl`
- `audio-events.jsonl`
- `operations.jsonl`
- `transcript.json`
- `generated-script.mjs`

stop 成功后，再通过标准页面流程关闭浏览器：

```bash
divebell stop
```

如果 stop 提示当前页面和录制页面不一致，不要强行继续或混入新页面数据；回到开始录制时的项目和页面后重试。

结束后读取 `manifest.json`、`interactions.jsonl`、`transcript.json` 和 `generated-script.mjs`。确认 manifest 的 `status` 是 `completed`，并检查脚本中是否出现了录到的 `click`、`fill` 或键盘步骤。不要只因为页面没有 Divebell target 就说“没有录到操作”；先看 `interactions.jsonl`。

如果 `manifest.capture.audio.status` 是 `captured`，先读取 `transcript.json`。如果 `segments` 已有内容，后续分析必须把它当成用户意图来源。

如果 `segments` 为空，且环境里有 `OPENAI_API_KEY`，继续运行：

```bash
divebell record transcribe --input <start-output-path>
```

转写完成后重新读取 `transcript.json`。如果没有 `OPENAI_API_KEY`，告诉用户音频已经保存到 `audio.webm`，但当前没有文字意图；这时不要生成“只访问最后页面”的最终脚本。可以先基于浏览器操作生成导航草稿，但必须等待用户补充语音文字后再生成业务脚本。

## 重新生成脚本

如果已有 `.orrec` 录制包，只需要重新生成脚本，运行：

```bash
divebell record generate-script --input <path>
```

要把脚本写到指定位置：

```bash
divebell record generate-script --input <path> --out <script-path>
```

## 脚本修正规则

- 优先把脚本补成可验证的 JS，而不是立刻产出新 skill。
- 优先使用页面声明的 `run-action` 和 `wait-for`；只有录制包里没有足够的 action/target 时，才补 `click`、`fill`、`eval`。
- 鼠标和键盘信息来自 `interactions.jsonl`；页面上下文来自 `page-snapshots.jsonl` 和 `dom-snapshots.jsonl`；语音信息来自 `transcript.json`，按 `startMs` / `endMs` 和交互事件对齐。
- 如果语音文字包含业务结果要求，例如“获取 closed 状态 1 周内的 issues，以及 open 两周内的，后面以 JSON 格式返回”，脚本必须实现这个业务结果，而不是只复现到达页面。可以优先用 GitHub 页面/API/搜索结果读取数据，再输出 JSON。
- 每个业务步骤之后都补一个明确的验证点，例如 `wait-for <target-id> ready` 或读取 `snapshot`。
- 不要只依赖截图或 DOM 文本判断成功；如果页面已经暴露 Divebell target，以 target/snapshot/event 为准。
- 如果脚本还有 TODO，要明确告诉用户哪些步骤需要下一版录屏、文字输入或语音输入来补齐。
- 运行 `generated-script.mjs` 时直接使用全局 `divebell`，不要设置项目本地 CLI 路径。

## 需要生成 skill 时

只有用户明确要求“把这次流程做成 skill”时，才基于 `generated-script.mjs` 和 `.orrec` 继续创建 skill 草稿。
创建 skill 时，把稳定命令和判断规则写进 `SKILL.md`；不要把原始录制包里的大量 JSON 全量塞进 skill 正文。
