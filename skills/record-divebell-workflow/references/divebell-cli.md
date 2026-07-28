# Divebell CLI

本 skill 使用全局安装的 Divebell CLI，不向当前业务项目添加依赖，也不临时下载另一
份 CLI。

## 安装

如果 `divebell` 命令不存在，先全局安装：

```bash
npm install --global @divebell/cli
divebell check --fix
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
divebell record start --mic
divebell open about:blank --ui
divebell record stop --out <start-output-path>
divebell stop
divebell record transcribe --input <start-output-path>
```

`record start --mic` 会保存 `audio.webm`、`audio-chunks.jsonl` 和
`audio-events.jsonl`。浏览器支持时，录音页会同步写入语音识别结果，
`record stop` 会汇总到 `transcript.json`，但不会默认访问外部转写服务。

需要把录音转成文字时间轴时，运行：

```bash
divebell record transcribe --input <start-output-path>
```

默认读取 `OPENAI_API_KEY`，也可以传 `--api-key <key>`。如果 `audio.webm` 存在但
`transcript.json` 没有文字，后续脚本只能算导航草稿，不能当成完整业务脚本。

`record stop` 生成的 `generated-script.mjs` 默认执行全局 `divebell`。运行脚本前
用 `divebell --help` 确认命令仍然可用。
