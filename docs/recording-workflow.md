# OpenRuntime 录制流程

本文档记录当前人工浏览器操作录制能力的实现状态和后续规划。

## 当前目标

让 Agent 能启动一个可见浏览器，用户在浏览器里手动操作网页，结束后由 Agent 关闭浏览器、读取录制包，并生成一份可继续修改和验证的 JS 脚本。

第一版优先生成脚本，不直接生成 skill。脚本更容易运行、检查和修正；当脚本稳定后，再把稳定流程包装成 skill。

## 当前实现

### CLI 流程

录制入口在 `open-runtime record` 命令下：

- `open-runtime record start [--url <url>] [--out <path>] [--mic]`
  - 不传 URL 时打开空白页。
  - 不传 `--out` 时写入当前项目的 `recordings/` 目录。
  - 命令返回后不会阻塞 Agent，会输出 `status: "recording"` 和录制包路径。
- `open-runtime record stop --out <path>`
  - 采集结束时页面状态。
  - 默认关闭浏览器。
  - 生成 `generated-script.mjs`。
- `open-runtime record transcribe --input <path>`
  - 读取录制包里的 `audio.webm`。
  - 调用转写服务生成 `transcript.json`。
  - 默认使用 `whisper-1`，以获得带时间节点的片段和词级结果。
- `open-runtime record generate-script --input <path>`
  - 从已有 `.orrec` 录制包重新生成脚本。

`record start` 会先写入录制控制文件，再重启浏览器会话，确保新打开的浏览器带上录制能力。这样 Agent 能在命令返回后立刻知道录制已经开始，用户可以直接操作浏览器。

### 录制包

录制包目录以 `.orrec` 结尾，目前包含：

- `manifest.json`：录制状态、开始结束时间、输入参数、产物计数。
- `runtime.jsonl`：OpenRuntime runtime、target、snapshot、event、action 采样。
- `page-snapshots.jsonl`：浏览器可见页面快照。
- `dom-snapshots.jsonl`：页面 DOM 摘要。
- `interactions.jsonl`：点击、输入、键盘、提交等人工操作。
- `audio.webm`：`--mic` 开启时保存的麦克风录音。
- `audio-chunks.jsonl`：麦克风音频片段时间轴。
- `audio-events.jsonl`：录音启动、错误和停止事件。
- `operations.jsonl`：录制启动、浏览器打开、收尾、脚本生成等操作记录。
- `transcript.json`：语音转文字结果；未转写前为 pending。
- `generated-script.mjs`：基于录制包生成的 JS 脚本草稿。

### 中间过程记录

这版已修正“只记录最后 URL”的问题。

页面内会监听用户的点击、输入、键盘和提交事件，并给每条事件记录相对录制开始的时间。事件会先通过浏览器日志发出，同时由浏览器进程持续写入录制包里的原始事件文件。

结束录制时，CLI 会合并两类来源：

- 当前页面仍能读取到的浏览器日志。
- 已经落盘的原始事件记录。

因此，即使用户搜索、跳转、打开仓库、再点到 Issues 页面，前面页面里的输入和点击也不会因为页面跳转而丢失。最终脚本会优先根据 `interactions.jsonl` 还原 `fill`、`click` 和键盘步骤。

### 麦克风录音和转写

`record start --mic` 会在浏览器录制会话中启动一个独立录音页。录音页申请麦克风权限，并用浏览器原生 `MediaRecorder` 按固定间隔写出音频片段。

音频片段会持续写入：

- `audio.webm`：完整录音文件。
- `audio-chunks.jsonl`：每个片段的 `startMs`、`endMs`、文件名、大小和格式。
- `audio-events.jsonl`：录音成功、失败、停止事件，以及浏览器实时语音识别结果。

录音页还会尝试启动浏览器内置语音识别。如果浏览器支持并返回了结果，`record stop` 会直接把 `speech-result` 汇总到 `transcript.json`，不需要额外 API key。这是第一层兜底，质量取决于浏览器能力和系统权限。

`record stop` 不默认访问外部服务，只负责保存音频。需要提取文字时，再执行：

```bash
open-runtime record transcribe --input <recording.orrec>
```

转写命令默认读取 `OPENAI_API_KEY`，也可以传 `--api-key`。默认模型是 `whisper-1`，因为它能返回带时间节点的片段和词级结果。转写完成后，`transcript.json` 会保存：

- `segments`：带 `startMs` 和 `endMs` 的句段。
- `words`：带 `startMs` 和 `endMs` 的词级结果。
- `text`：完整文本。

如果 `audio.webm` 已保存但 `transcript.json` 没有文字，后续 Agent 不能把“只到达最后 URL”的脚本当成完成。它必须要求补充转写能力，或请用户把语音意图用文字补上，再生成业务脚本。

### Skill 使用方式

已新增 `record-openruntime-workflow` skill。它的职责是：

- 先快速探测当前项目或 PATH 里是否有可复用 OpenRuntime CLI。
- 如果没有可用 CLI，使用 skill 清单指向的 GitHub Release 运行包；首次下载后按版本缓存。
- 默认直接启动可见浏览器，不追问 URL 和保存位置。
- 用户说结束后调用 `record stop`，读取录制包并生成脚本。
- 如果存在 `OPENAI_API_KEY`，再调用 `record transcribe` 生成语音文字时间轴。
- 检查 `interactions.jsonl`、`transcript.json` 和脚本，避免只根据最后 URL 判断录制结果。

skill 自带 CLI wrapper 和版本清单，不把依赖 `.tgz` 提交到 Git。wrapper 会下载 Release 产物、
校验 SHA-256，并在本地缓存，因此用户机器没有全局 `openruntime` 命令时仍可运行。

## 当前限制

- 连续视频还没有真实保存。
- 麦克风录音依赖浏览器权限；如果用户或系统拒绝权限，录制包会记录失败原因。
- 转写需要外部服务或用户提供可用模型；默认实现支持 OpenAI Audio Transcriptions。
- 生成脚本仍是草稿。它可以还原常见输入、点击和 Enter 键，但复杂拖拽、组合键、文件上传、弹窗、多标签页和跨域登录流程还需要继续增强。
- 业务成功判断仍应优先依赖页面声明的 OpenRuntime target、snapshot、event 和 action；DOM 和页面文本只能作为辅助。

## 后续规划

### 录制增强

- 保存连续视频，并在录制包里记录视频文件路径和时间轴。
- 支持本地 Whisper/WhisperX 转写，降低对外部服务的依赖。
- 记录更完整的键盘、鼠标、滚动、导航、新标签页和文件选择行为。
- 在关键交互前后采集更精简的 DOM 片段，减少后续分析噪音。

### 分析增强

- 用事件时间轴、DOM 摘要、OpenRuntime 状态和语音文字共同推断用户意图。
- 把低层点击输入合并成更稳定的业务步骤。
- 优先把可替换的 DOM 操作转换成页面声明的 action。
- 为每个步骤补验证点，例如 `wait-for` 某个 target 到达 ready。

### 产物增强

- 先生成可运行 JS 脚本，并自动执行一次基础验证。
- 脚本稳定后，再生成可复用 skill 草稿。
- 录制包中保留足够证据，让后续 Agent 可以重新生成脚本或 skill，而不需要用户重新操作。

### Agent 体验

- skill 调用后直接打开浏览器并返回录制状态。
- 用户只需要操作浏览器，完成后告诉 Agent “结束”。
- Agent 自动关闭浏览器、读取录制包、生成脚本，并说明哪些步骤已经还原、哪些仍需要补充。
