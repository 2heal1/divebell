# 浏览器登录态 Profile

OpenRuntime 可以把浏览器登录态导出成 `.oprprofile` 文件，再导入到 OpenRuntime 后续打开页面时使用的浏览器 Profile 里。

## 导出

用于从当前已登录的 Chrome 会话里导出网站登录态。

```sh
openruntime auth export \
  --url example.com \
  --output /tmp/example-auth.oprprofile
```

这个命令会打开一个本地连接页。首次使用时，页面会引导用户加载 OpenRuntime Auth Connector 扩展；扩展安装好以后，页面可以直接开始导出。

`--url` 可以写完整的 `http` / `https` 地址，也可以直接写 `example.com` 这样的域名。

## 导入

```sh
openruntime auth import --input /tmp/example-auth.oprprofile
```

导入后，后续 OpenRuntime 打开的浏览器页面会默认使用这份登录态。

再次导入新的 `.oprprofile` 会和已有登录态合并，所以多个网站可以一个个导出、一个个导入。

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

查看导入状态统一用 `auth list`。

## 多个网站的用法

每个网站分别导出和导入：

```sh
openruntime auth export --url example.com --output /tmp/example-auth.oprprofile
openruntime auth import --input /tmp/example-auth.oprprofile

openruntime auth export --url another.example --output /tmp/another-auth.oprprofile
openruntime auth import --input /tmp/another-auth.oprprofile

openruntime auth list
```
