# 浏览器登录与状态复用

English version: [Browser Authentication and State](browser-auth.md)

Divebell 组合使用 agent-browser 的 Profile、state 和 auth，为 Coding Agent 提供可复用的浏览器登录环境。

## 三者的区别

| 能力 | 保存什么 | 适合什么场景 |
| --- | --- | --- |
| Profile | Chrome 的完整用户配置，包括 Cookie、网页存储、IndexedDB、Service Worker 和缓存 | 直接复用本机 Chrome 中已经登录的账号，或长期维护一套独立浏览器配置 |
| state | Cookie，以及当前会话访问过的 Origin 的 localStorage 和 sessionStorage | 生成体积较小、可以明确保存和载入的登录状态文件 |
| auth | 加密保存的用户名、密码和登录页信息 | 让 agent-browser 自动打开登录页、填写并提交表单 |

`profiles` 只列出本机可选的 Chrome Profile，不会导出其中的数据。`auth` 保存的是登录凭据，不是已经登录后的 Cookie。需要复制现成登录状态时，应使用 Profile 启动浏览器，再保存 state。

## 复用本机 Chrome Profile

先查看可用 Profile：

```bash
divebell profiles
```

关闭已有的 Divebell 浏览器，再用选中的 Profile 打开目标页面：

```bash
divebell stop
divebell open https://app.example.com/dashboard --profile "Work" --ui
```

传入 Chrome Profile 名称时，agent-browser 使用它的只读副本，不会修改原来的 Chrome 配置。也可以传入目录路径，作为长期保存的独立 Profile：

```bash
divebell open https://app.example.com --profile ~/.divebell-profiles/app
```

Profile 是一个目录，不是单个导出文件。需要得到可迁移文件时，请保存 state。

## 只导出指定 URL 的登录状态

这是 Divebell 在 agent-browser `state save` 基础上增加的组合能力。推荐先用目标 Chrome Profile 打开准确网址，再按相同 URL 保存：

```bash
divebell stop
divebell open https://app.example.com/account --profile "Work" --ui
divebell state save ./app-state.json --url https://app.example.com/account
```

生成的 `app-state.json` 仍是标准 agent-browser state 文件，可以直接载入。筛选规则是：

- 只保留该 URL 的域名、路径和安全协议会实际使用的 Cookie；
- 只保留与该 URL 完全同源的 localStorage 和 sessionStorage；
- 不包含其他域名的登录状态；
- 不包含 IndexedDB、Service Worker、缓存、浏览器扩展或 Chrome 密码管理器。

必须先打开目标 URL。这样该 Origin 的网页存储才会进入当前浏览器会话；只列出 Profile 而不打开页面，不能保证 state 中含有它们。

如果不加 `--url`，行为就是 agent-browser 原生的完整 state 保存，会包含当前会话中所有 Cookie，以及本次会话访问过的 Origin：

```bash
divebell state save ./full-state.json
```

## 载入和管理 state

可以在打开页面时载入：

```bash
divebell open https://app.example.com/account --state ./app-state.json
```

也可以载入当前会话后继续使用：

```bash
divebell state load ./app-state.json
divebell open https://app.example.com/account
```

查看和清理已保存的自动恢复状态：

```bash
divebell state list
divebell state show <文件名>
divebell state rename <旧名称> <新名称>
divebell state clear [会话名]
divebell state clean --older-than 7
```

Divebell 默认会让同一项目的浏览器会话自动恢复。显式传入 `--profile` 或 `--state` 时，以该来源为准，不会再叠加之前的自动恢复内容。显式 state 文件用于需要人工确认、迁移或缩小范围的场景。

## 使用 auth 凭据库

推荐通过标准输入保存密码，避免密码出现在命令历史中：

```bash
printf '%s\n' "$APP_PASSWORD" | \
  divebell auth save app \
    --url https://app.example.com/login \
    --username tester@example.com \
    --password-stdin
```

登录时：

```bash
divebell auth login app
```

agent-browser 会打开保存的登录页，等待常见的用户名和密码输入框出现，然后填写并提交。网站表单不标准时，可以在保存或登录命令中传入 `--username-selector`、`--password-selector` 和 `--submit-selector`。

管理凭据：

```bash
divebell auth list
divebell auth show app
divebell auth delete app
```

列表和详情不会显示密码。

## 安全边界

Profile、state 和 auth 都只能复用已经获得授权的账号，不会绕过登录或权限检查。

state 文件通常直接包含可用的会话令牌。应保存到可信位置、加入 `.gitignore`，不要提交代码仓库或发送给无权访问目标网站的人。指定 URL 只能缩小导出范围，不能让文件变得不敏感。
