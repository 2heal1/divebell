export async function runExtensionDemo(options) {
  const action = options.args.command[1] ?? "hello";

  if (action === "hello") {
    const name = options.args.options.get("name")?.at(-1) ?? "OpenRuntime";
    options.output.ok({
      greeting: `你好，${name}！`,
      openedPage: options.page?.url ?? null
    }, "本地 Extension 已成功运行。");
    return 0;
  }

  if (action === "page") {
    if (options.page === undefined) {
      options.output.needsInput(
        "请先用 openruntime open <url> 打开一个页面，再运行 page 子命令。",
        [{ command: "openruntime open https://example.com" }]
      );
      return 1;
    }

    const [title, marker] = await Promise.all([
      options.openruntime.browser.getWindow("document.title"),
      options.openruntime.browser.getWindow("__OPENRUNTIME_CLI_EXTENSION_DEMO__")
    ]);
    options.output.ok({
      url: options.page.url,
      title,
      marker
    }, "已读取当前页面。后续可以在这里加入团队自己的检查。");
    return 0;
  }

  options.output.needsInput(
    `不支持子命令 ${JSON.stringify(action)}，请选择 hello 或 page。`,
    [
      { command: "openruntime extension-demo hello --name Codex" },
      { command: "openruntime extension-demo page" }
    ]
  );
  return 1;
}
