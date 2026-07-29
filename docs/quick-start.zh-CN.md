# Divebell 快速体验

English version: [Divebell Quick Start](quick-start.md)

直接打开公开的 Module Federation Playground：

[打开 Module Federation Playground](https://module-federation.io/playground/index.html)

这条 Quick Start 使用一个已经发布的 remote 包。用户不需要克隆仓库、安装浏览器扩展，
也不需要读取 remote 源码。流程会先故意传入错误 props，让 Agent 读取 Playground
Terminal 报错，再修正输入并验证页面是否真正运行起来。

## 安装 Divebell

先全局安装一次 CLI，并确认命令可用：

```bash
npm install --global @divebell/cli
divebell check --fix
divebell --help
```

Divebell 是本机调试工具，不要把 CLI 加入业务项目依赖。

## 从 Agent skill 开始

把完整的 `skills/divebell` 目录安装到支持 skill 的 Agent。Codex 中可以放到：

```text
~/.codex/skills/divebell
```

然后直接对 Agent 说：

```text
使用 Divebell 完成官方 Quick Start：打开 Module Federation Playground，
用故意错误的 props 加载 Divebell remote，读取 Playground Terminal 报错，
把 props 改成要求的 config，并确认页面渲染出可交互的诊断小游戏。
```

skill 直接使用全局安装的 `divebell` 命令，不会向当前项目添加 CLI 依赖。

## Playground 输入

使用这个 manifest URL：

```text
https://unpkg.com/@divebell/mf-playground-remote@0.1.0/dist/mf/mf-manifest.json
```

remote name：

```text
divebell_mf_playground_remote
```

expose：

```text
.
```

先使用故意错误的 props：

```tsx
{
  title: 'Divebell',
}
```

再改成正确 props：

```tsx
{
  config: {
    appName: 'MF Playground',
    environment: 'staging',
    sessionId: 'mf-quickstart',
  },
}
```

## 这条流程能体验什么

1. **加载真实 remote**：使用公开的 Module Federation Playground 和来自 npm/unpkg 的
   固定版本 manifest。
2. **观察失败**：从 Playground Terminal 读取运行时 props 校验错误，而不是查看
   remote 源码。
3. **完成修复**：把旧的 `title` props 改成 remote 要求的 `config` 结构。
4. **验证页面**：确认 Divebell remote 正常渲染，并且可以通过鼠标、方向键或 WASD
   控制诊断小游戏。

## 它解决什么问题

Quick Start 是一条发生在公开 Module Federation Playground 里的 remote 调试流程。
它展示的是 Agent 如何基于页面可见证据和运行时报错完成一次明确修复，而不需要下载
remote 源码。

它不依赖 Module Federation 浏览器扩展，也不需要 Divebell Extension。后续如果
Playground 侧接入 Runtime SDK，可以把 Terminal 报错和可编辑输入直接暴露成 Divebell
target 和 action；但当前 Quick Start 已经可以通过普通页面和浏览器证据完成。
