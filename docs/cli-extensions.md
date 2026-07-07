# OpenRuntime CLI Extension Development

Chinese version: [CLI 扩展开发](cli-extensions.zh-CN.md)

OpenRuntime CLI extensions add project, team, or local workflow commands without changing the OpenRuntime CLI command dispatcher.

Use an extension when the workflow is a command the agent should call repeatedly, such as "open a site, collect release data, and print structured JSON". If the page itself can expose a stable Target or Action, prefer adding OpenRuntime Targets and Actions in the application and calling `snapshot`, `runAction`, or `waitFor` from the extension.

## Loading

External extensions are loaded from:

```text
~/.openruntime/extensions
```

You can override the directory:

```sh
OPENRUNTIME_EXTENSIONS_DIR=/path/to/extensions openruntime extensions list
```

You can disable external extensions:

```sh
OPENRUNTIME_DISABLE_EXTERNAL_EXTENSIONS=1 openruntime --help
```

Two file layouts are supported:

```text
~/.openruntime/extensions/foo.mjs
~/.openruntime/extensions/foo/index.mjs
```

External commands are shown separately in help and are marked with their source:

```text
External Extensions:
  openruntime foo ping [external: foo]
```

Use this command to inspect what was loaded:

```sh
openruntime extensions list
```

If an external extension conflicts with a built-in command or an internal extension, OpenRuntime skips the external extension and prints a warning. A broken extension also does not crash the CLI; it is reported by `extensions list`.

External extensions are local code execution. Only load files you trust.

## Export Shape

An extension must default-export this shape:

```js
export default {
  schemaVersion: 1,
  name: "foo",
  displayName: "Foo",
  description: "Foo extension",
  commandReferences: [
    {
      category: "Extensions",
      usage: "openruntime foo ping",
      description: "Runs the Foo command."
    }
  ],
  exampleReferences: [
    {
      command: "openruntime foo ping",
      description: "Runs the Foo command."
    }
  ],
  async run(options) {
    options.stdout.write("pong\n");
    return 0;
  }
};
```

The exported object follows the `OpenRuntimeCliExtension` interface from [`packages/cli/src/index.ts`](../packages/cli/src/index.ts). The OpenRuntime API object follows [`packages/cli/src/extension-api.ts`](../packages/cli/src/extension-api.ts).

## Run Options

`run(options)` receives:

| Field | What it is for |
| --- | --- |
| `options.args` | Parsed CLI input. Use `options.args.command` for positional command parts and `options.args.options` for flags. |
| `options.stdout` / `options.stderr` | Write command output. Prefer structured JSON on stdout for data commands. |
| `options.bridgeUrl` | The selected Bridge URL after CLI flag parsing. |
| `options.runtimeSelector` | The selected runtime filter from `--runtime`, `--session`, or `--url`. |
| `options.openruntime` | Stable API for Runtime, Bridge, and browser operations. Prefer this over spawning `openruntime` again. |
| `options.fetcher` | Low-level fetch hook used by tests and advanced integrations. Most extensions do not need it. |
| `options.browserRunner` | Low-level browser command runner. Prefer `options.openruntime.browser` unless you need an unsupported browser command. |

## `options.openruntime` API

### Bridge And Runtime Selection

| API | Use it for |
| --- | --- |
| `ensureBridge({ port?, timeout? })` | Start or reuse the local Bridge when the selected bridge is local. |
| `runtimes()` | List connected runtimes. |
| `selectRuntime(selector?)` | Select one runtime using the default CLI selector or an explicit selector. |

### Runtime Resources

These APIs query the selected runtime through the Bridge:

| API | Use it for |
| --- | --- |
| `targets(query?, selector?)` | Read target definitions. |
| `snapshot(query?, selector?)` | Read current target states. |
| `events(query?, selector?)` | Read runtime event history. |
| `actions(query?, selector?)` | List declared runtime actions. |

The `query` object maps to CLI query flags. Common keys include `id`, `type`, `source`, `status`, `query`, `targetId`, `action`, `since`, and `limit`.

```js
const snapshot = await options.openruntime.snapshot({
  id: "business:checkout:summary"
});

options.stdout.write(`${JSON.stringify({ result: snapshot }, null, 2)}\n`);
```

### Runtime Actions

| API | Use it for |
| --- | --- |
| `inputOptions(actionName, inputName, { payload?, timeout?, selector? })` | Read dynamic input candidates for an action input. |
| `runAction(actionName, payload?, selector?)` | Execute a page-declared action. |
| `waitFor(targetId, status, { where?, timeout?, selector? })` | Wait until a target reaches a status. |

```js
const result = await options.openruntime.runAction("release-note.list-latest", {
  limit: 3
});
```

### Browser

Browser APIs operate on the current OpenRuntime browser session:

| API | Use it for |
| --- | --- |
| `browser.open(url, { noBridge?, sessionId?, cookies?, ui? })` | Open a page. By default it prepares the Bridge unless `noBridge` is true. |
| `browser.goto(url, { sessionId? })` | Navigate the current page. |
| `browser.pageSnapshot()` | Read the current page accessibility snapshot. |
| `browser.click(target)` | Click by ref, selector, or text supported by the browser runner. |
| `browser.fill(target, value)` | Fill an input by ref or selector. |
| `browser.eval(script)` | Evaluate a JavaScript expression in the page and parse JSON output. |
| `browser.evalFile(path)` | Evaluate a JavaScript file in the page. Useful for larger scripts. |
| `browser.waitEval(script, { timeout? })` | Poll a page expression until it becomes true. |
| `browser.getWindow(path)` | Read a dotted path from `window` / `globalThis`. |
| `browser.screenshot(name?, { fullPage? })` | Capture a screenshot. |
| `browser.network({ url? })` | Read recorded network requests, optionally filtered by URL text. |
| `browser.console({ levels?, query?, limit? })` | Read captured browser console entries. |
| `browser.close()` | Close the browser session. |

Use browser APIs for page navigation and inspection. Use Runtime APIs when the page already exposes structured Targets or Actions.

## Example: Latest Release From GitHub

Create `~/.openruntime/extensions/github-release.mjs`:

```js
export default {
  schemaVersion: 1,
  name: "github-release",
  displayName: "GitHub Release",
  description: "Finds the latest release for module-federation/core.",
  commandReferences: [
    {
      category: "Extensions",
      usage: "openruntime github-release latest",
      description: "Open GitHub, find module-federation/core, and print the latest release."
    }
  ],
  exampleReferences: [
    {
      command: "openruntime github-release latest",
      description: "Print the latest module-federation/core release."
    }
  ],
  async run(options) {
    if (options.args.command[1] !== "latest") {
      throw new Error("Usage: openruntime github-release latest");
    }

    const browser = options.openruntime.browser;

    await browser.open("https://github.com", { noBridge: true });
    await browser.fill('input[name="q"], input[aria-label="Search GitHub"]', "module-federation/core");
    await browser.eval("document.querySelector('input[name=\"q\"], input[aria-label=\"Search GitHub\"]')?.form?.requestSubmit()");
    await browser.waitEval("location.href.includes('/search')", { timeout: 10000 });

    await browser.click('a[href="/module-federation/core"]');
    await browser.waitEval("location.pathname === '/module-federation/core' || location.pathname === '/module-federation/core/'", { timeout: 10000 });

    await browser.click('a[href="/module-federation/core/releases"]');
    const ready = await browser.waitEval("document.querySelector('a[href*=\"/module-federation/core/releases/tag/\"]') !== null", { timeout: 10000 });
    if (!ready.success) {
      throw new Error(ready.reason ?? "GitHub releases did not load.");
    }

    const latest = await browser.eval(`(() => {
      const releaseLink = document.querySelector('a[href*="/module-federation/core/releases/tag/"]');
      const release = releaseLink?.closest('[data-testid="release"]') ?? releaseLink?.closest('.Box') ?? document.body;
      const title = release?.querySelector('a[href*="/releases/tag/"], h1, h2')?.textContent?.replace(/\\s+/g, " ").trim() ?? "";
      const tag = releaseLink?.href.split("/releases/tag/").at(-1) ?? "";
      const publishedAt = release?.querySelector("relative-time")?.getAttribute("datetime") ?? "";
      const notesPreview = release?.querySelector(".markdown-body")?.textContent?.replace(/\\s+/g, " ").trim().slice(0, 500) ?? "";
      return {
        repository: "module-federation/core",
        title,
        tag,
        url: releaseLink?.href ?? location.href,
        publishedAt,
        notesPreview
      };
    })()`);

    options.stdout.write(`${JSON.stringify({ result: latest }, null, 2)}\n`);
    return 0;
  }
};
```

Run:

```sh
openruntime github-release latest
```

Expected output shape:

```json
{
  "result": {
    "repository": "module-federation/core",
    "title": "Release title",
    "tag": "v0.0.0",
    "url": "https://github.com/module-federation/core/releases/tag/v0.0.0",
    "publishedAt": "2026-01-01T00:00:00Z",
    "notesPreview": "..."
  }
}
```

## Development Rules

- Prefer `options.openruntime` over spawning `openruntime` again.
- Prefer Runtime Targets and Actions over DOM parsing when the application provides them.
- Use browser APIs for navigation, fallback inspection, screenshots, console, and network data.
- Use `browser.evalFile` for large page scripts; use `browser.eval` for small expressions.
- Return `0` for success and throw an error or return non-zero for failure.
- Keep stdout machine-readable for data commands.
- Add `commandReferences` and `exampleReferences` so `openruntime --help` stays useful.
