export async function runExtensionDemo(options) {
  const action = options.args.command[1] ?? "hello";

  if (action === "hello") {
    const name = options.args.options.get("name")?.at(-1) ?? "Divebell";
    return {
      greeting: `Hello, ${name}!`,
      openedPage: options.page?.url ?? null
    };
  }

  if (action === "page") {
    if (options.page === undefined) {
      throw new Error("Open a page with divebell open <url> before running the page subcommand.");
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

  throw new Error(`Unsupported subcommand ${JSON.stringify(action)}. Choose hello or page.`);
}
