# Modern.js Stream SSR Demo

这个 demo 用来验收 Modern.js 默认推荐的 stream SSR 场景下，OpenRuntime 能否把服务端渲染和浏览器运行时关联到同一条记录。

## 准备

这个 demo 依赖本机的 Modern.js 仓库：`/Users/bytedance/fork_repo/modern.js`。需要先确保那边已经包含 OpenRuntime 所需的 hook，并且依赖已安装。

在 OpenRuntime 仓库根目录先安装依赖并构建：

```bash
pnpm install
pnpm build
```

## 启动

开第一个终端，启动 Bridge：

```bash
pnpm exec openruntime start
```

开第二个终端，启动 stream SSR demo：

```bash
pnpm --filter @openruntime/demo-modern-ssr-stream dev
```

然后打开：

```txt
http://localhost:19083/
```

## 验收

在第三个终端执行：

```bash
pnpm --filter @openruntime/demo-modern-ssr-stream verify
```

也可以手动查看：

```bash
pnpm exec openruntime targets --url http://localhost:19083/
pnpm exec openruntime snapshot --url http://localhost:19083/
```

预期结果：

- `targets` 里能看到 `modern:app`、`modern:route`、`modern:ssr`、`modern:hydration`。
- `snapshot` 里 `modern:ssr` 是 `server-rendered`，并且来源是 server。
- `snapshot` 里 `modern:hydration` 是 `success`，并且 renderMode 是 `stream`。
- `snapshot` 里 `modern:route` 是 `ready`，当前 pathname 是 `/`。
- `runtimes` 里的 `runtimeId` 会和 `modern:ssr` 里记录的 server `runtimeId` 一致。

也可以单独等待 server SSR 状态：

```bash
pnpm exec openruntime wait-for modern:ssr server-rendered --url http://localhost:19083/ --where environment=server --timeout 5000
```

## 构建检查

```bash
pnpm --filter @openruntime/demo-modern-ssr-stream build
```
