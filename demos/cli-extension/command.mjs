export async function runExtensionDemo(options) {
  const action = options.args.command[1] ?? "hello";

  if (action === "hello") {
    const name = options.args.options.get("name")?.at(-1) ?? "Divebell";
    return {
      greeting: `你好，${name}！`,
      openedPage: options.page?.url ?? null
    };
  }

  if (action === "page") {
    if (options.page === undefined) {
      throw new Error("请先用 divebell open <url> 打开一个页面，再运行 page 子命令。");
    }

    const [title, marker] = await Promise.all([
      options.divebell.browser.getWindow("document.title"),
      options.divebell.browser.getWindow("__DIVEBELL_CLI_EXTENSION_DEMO__")
    ]);
    return {
      url: options.page.url,
      title,
      marker
    };
  }

  throw new Error(`不支持子命令 ${JSON.stringify(action)}，请选择 hello 或 page。`);
}
