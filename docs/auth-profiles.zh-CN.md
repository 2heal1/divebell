# 浏览器登录态 Profile

English version: [Browser Auth Profiles](auth-profiles.md)

OpenRuntime 可以把浏览器登录态导出成 `.oprprofile` 文件，再导入到 OpenRuntime 后续打开页面时使用的浏览器会话里。

团队可以为授权的测试账号提前准备 Profile，让 Coding Agent 在后续开发调试任务中直接进入真实页面，
不需要每次都请人重新登录。Profile 只复用已经授予的访问权限，不会绕过网站本身的授权检查。

`.oprprofile` 包含敏感登录信息。只为专用测试账号创建，保存在可信环境中，不要提交到代码仓库或分享给无权访问对应站点的人。

## 导出

用于从当前已登录的 Chrome 会话里导出网站登录态。

```sh
openruntime auth export \
  example.com \
  --output /tmp/example-auth.oprprofile
```

这个命令会打开一个本地连接页。首次使用时，页面会引导用户加载 OpenRuntime Auth Connector 扩展；扩展安装好以后，页面可以直接开始导出。

URL 可以写完整的 `http` / `https` 地址，也可以直接写 `example.com` 这样的域名。

导出始终生成 `.oprprofile` 文件。可以用 `--output` 指定位置；不指定时，OpenRuntime 会创建临时文件并输出它的路径。

## 导入

```sh
openruntime auth import /tmp/example-auth.oprprofile
```

导入只接受文件路径，不再接受内联内容或 `--input`。

导入后，后续 OpenRuntime 打开的浏览器页面会默认使用这份登录态。

再次导入新的 `.oprprofile` 会和已有登录态合并，所以多个网站可以一个个导出、一个个导入。

OpenRuntime 会使用 agent-browser 的自动恢复能力保存后续变化。导入文件只在导入时应用一次，不会在每次启动时用旧内容覆盖网站已经更新的登录状态。

在迁移到 agent-browser 之前已经保存的登录状态，会在后续第一次执行 `openruntime open` 时自动接续，不需要重新导入。

## 查看和清理

查看已经导入了哪些站点：

```sh
openruntime auth list
```

清空全部已导入登录态：

```sh
openruntime auth clear
```

只清理某个站点：

```sh
openruntime auth clear --url https://example.com
```

只清理某个站点时，其他站点的登录状态会继续保留。清空全部登录态后，后续启动也不会从 agent-browser 的自动恢复记录里重新出现。

查看导入状态统一用 `auth list`。它只能确认站点，不能证明当前具体账号和权限；需要在目标页面中继续确认。

## 多个网站的用法

每个网站分别导出和导入：

```sh
openruntime auth export example.com --output /tmp/example-auth.oprprofile
openruntime auth import /tmp/example-auth.oprprofile

openruntime auth export another.example --output /tmp/another-auth.oprprofile
openruntime auth import /tmp/another-auth.oprprofile

openruntime auth list
```
