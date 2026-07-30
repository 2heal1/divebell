# Divebell CLI

本 skill 使用全局安装的 Divebell CLI，不向当前业务项目添加依赖，也不临时下载另一
份 CLI。

## 安装

如果 `divebell` 命令不存在，先全局安装：

```bash
npm install --global @divebell/cli
divebell setup
divebell --help
```

录制能力由官方 Extension 提供。顶层帮助里没有 `record` 时安装一次：

```bash
divebell extensions add @divebell/extension-imitate
divebell record --help
```

Extension 默认保存在用户目录，并由同一个全局 CLI 加载。不要在业务项目里安装
`@divebell/cli` 或录制 Extension。

## 使用

直接执行全局命令：

```bash
divebell record start
divebell open about:blank --ui
divebell record stop --out <start-output-path>
divebell stop
```

`record start` 默认录制操作元素和事件，并自动尝试麦克风。捕获成功时会额外保存
`audio.webm`、`audio-chunks.jsonl` 和 `audio-events.jsonl`。浏览器支持时，录音页会
同步写入语音识别结果，`record stop` 会汇总到 `transcript.json`。没有说话、没有
捕获到音频或麦克风权限被拒绝时直接忽略，不影响浏览器录制、脚本生成和回放。

需要把录音转成文字时间轴时，运行：

```bash
divebell record transcribe --input <start-output-path>
```

默认读取 `OPENAI_API_KEY`，也可以传 `--api-key <key>`。只有用户明确说过补充说明、
已有音频但没有实时语音文字时才需要调用。没有录音或转写不影响根据操作记录生成和
回放脚本。

`record stop` 会生成 `workflow.json` 和 `generated-script.mjs`。后者默认执行全局
`divebell`。运行脚本前用 `divebell --help` 确认命令仍然可用。
