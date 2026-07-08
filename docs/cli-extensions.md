# OpenRuntime CLI Command Development Guide

Chinese version: [CLI 命令开发](cli-extensions.zh-CN.md)

## When To Use

OpenRuntime commands package project, team, or local workflows as repeatable page operation commands without changing the OpenRuntime CLI command dispatcher.

This guide is about page commands mounted under `openruntime`. A command only operates on a page opened by `openruntime open <url>`. If you want to build a standalone CLI command that opens, navigates, or closes the browser by itself, that needs a separate capability.

Use a command when:

- An agent needs to run the same page workflow repeatedly.
- A command needs to read the current page and print structured JSON.
- The page already exposes OpenRuntime Targets or Actions, and the command only needs to query or run them.
- A team wants stable commands for common project-specific page operations.

If the page can expose stable Targets or Actions, prefer adding OpenRuntime Targets and Actions in the application, then call `snapshot`, `runAction`, or `waitFor` from the command.

## Execution Boundary

Page commands operate on the current opened page. The agent should run:

```sh
openruntime open <url>
```

Then invoke the command:

```sh
openruntime <command>
```

Do not open, navigate, close, or replace the browser session inside a command. The command also should not choose a Bridge or Runtime itself. The CLI passes the page context created by `openruntime open <url>` into the command and uses it as the default page operation target.

If a command only supports specific URLs, validate `options.page.url` at the start and throw `createError(...)` with `PAGE_URL_UNSUPPORTED` when it does not match:

```js
import { createError } from "@openruntime/cli";

if (options.page === undefined || !isSupportedPage(options.page.url)) {
  throw createError({
    code: "PAGE_URL_UNSUPPORTED",
    kind: "validation",
    message: "This command only supports the module-federation/core releases page.",
    hint: "Run `openruntime open https://github.com/module-federation/core/releases`.",
    details: {
      actualUrl: options.page?.url,
      expectedUrl: "https://github.com/module-federation/core/releases"
    }
  });
}
```

## Installation And Loading

Command files are loaded from:

```text
~/.openruntime/commands
```

You can override the directory:

```sh
OPENRUNTIME_COMMANDS_DIR=/path/to/commands openruntime commands list
```

You can disable external command loading:

```sh
OPENRUNTIME_DISABLE_COMMANDS=1 openruntime --help
```

Use this command to inspect what was loaded:

```sh
openruntime commands list
```

External commands are shown separately in help and are marked with their source:

```text
External Commands:
  openruntime foo ping [external: foo]
```

If an external command conflicts with a built-in command or an internal command, OpenRuntime skips the external command and prints a warning. A broken command also does not crash the CLI; it is reported by `commands list`.

External commands are local code execution. Only load files you trust.

## Command File Structure

Two file layouts are supported:

```text
~/.openruntime/commands/foo.mjs
~/.openruntime/commands/foo/index.mjs
```

A command file must default-export this shape. Prefer `defineCommand(...)` so the shape is fixed and typed:

```js
import { defineCommand } from "@openruntime/cli";

export default defineCommand({
  schemaVersion: 1,
  name: "foo",
  displayName: "Foo",
  description: "Foo command",
  commandReferences: [
    {
      category: "Commands",
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
    options.output.ok({
      result: "pong"
    });
    return 0;
  }
});
```

The exported object follows `OpenRuntimeCommandDefinition`. The OpenRuntime API object follows [`packages/cli/src/extension-api.ts`](../packages/cli/src/extension-api.ts).

Use `validateCommand(...)` when tests or CI need to check a command export directly:

```js
import { validateCommand } from "@openruntime/cli";
import command from "./foo.mjs";

validateCommand(command);
```

## Run Context: `run(options)`

### Parameter Overview

`run(options)` receives:

| Field | What it is for |
| --- | --- |
| `options.args` | Parsed CLI input. Use `options.args.command` for positional command parts and `options.args.options` for flags. |
| `options.page` | Current page information from the latest `openruntime open <url>`. |
| `options.output` | Unified JSON output helper for `ok`, `needs_input`, and `error` results. |
| `options.openruntime` | Current-page query, page action, and page interaction capabilities. |

A few low-level fields remain available for tests, debugging, or proxying external tools. Most commands should not depend on them:

| Field | When to use it |
| --- | --- |
| `options.stdout` | The command intentionally returns raw text or proxies another tool's stdout. |
| `options.stderr` | The command needs progress logs or proxies another tool's stderr. |
| `options.fetcher` | Tests or advanced integrations need to replace the underlying request implementation. |

Data commands should prefer `options.output` instead of writing stdout directly.

### `options.args`: Command Input

`options.args.command` contains the full command path. For example:

```sh
openruntime github-release latest --limit 3
```

The command receives:

```js
options.args.command; // ["github-release", "latest"]
```

Flags are available in `options.args.options`. Commands can use these inputs for command behavior, but the page source still comes from `openruntime open <url>`.

### `options.page`: Current Page Information

`options.page` comes from the latest successful `openruntime open <url>`. Page commands should use it to confirm that the current page is valid for the command.

Fields:

| Field | Meaning |
| --- | --- |
| `url` | The original page URL passed to `openruntime open`. |
| `openedUrl` | The URL actually opened, which may include an OpenRuntime session parameter. |
| `normalizedUrl` | The normalized URL used to match the current page. |
| `bridgeUrl` | The Bridge URL used by this open operation, or `null` when no Bridge was used. |
| `sessionId` | The session ID assigned to this open operation, or `null` when there is no session. |
| `openedAt` | The timestamp for the open record. |

Example:

```js
if (options.page === undefined) {
  throw createError({
    code: "OPEN_CONTEXT_REQUIRED",
    kind: "validation",
    message: "Open a page first.",
    hint: "Run `openruntime open <url>` first."
  });
}
```

### `options.output`: Output And Error Contract

Data commands should write exactly one JSON object to stdout. Use `options.output` so success, input requests, and errors keep the same shape.

Success output:

```js
options.output.ok({
  release: "1.2.3"
}, "Found the latest release.");
```

When the command needs the agent or user to choose before continuing:

```js
options.output.needsInput("Select a release to inspect.", [
  { label: "Release 1.2.3", value: "1.2.3" },
  { label: "Release 1.2.2", value: "1.2.2" }
]);
return 1;
```

For expected failures, throw `createError(...)`. The CLI catches it and prints the unified error JSON.

```js
import { createError } from "@openruntime/cli";

throw createError({
  code: "RELEASE_NOT_FOUND",
  kind: "not_found",
  message: "The requested release was not found.",
  retryable: false,
  hint: "Check the release name or run without --release to list candidates.",
  details: {
    release: "1.2.3"
  }
});
```

If a command handles an error itself instead of throwing, call `options.output.error(error)` and return a non-zero exit code:

```js
options.output.error(createError({
  code: "RELEASE_AUTH_FAILED",
  kind: "auth",
  message: "Could not read release data.",
  retryable: true,
  hint: "Log in and retry."
}));
return 1;
```

### `options.openruntime`: OpenRuntime Capabilities

`options.openruntime` is scoped to the current opened page. Commands use the current page context directly and do not need to handle the low-level connection.

#### Page State And Declaration Queries

These APIs read the information exposed by the current opened page.

| API | Use it for |
| --- | --- |
| `targets(query?)` | Read target definitions. |
| `snapshot(query?)` | Read current target states. |
| `events(query?)` | Read page event history. |
| `actions(query?)` | List page-declared actions. |

The `query` object maps to CLI query flags. Common keys include `id`, `type`, `source`, `status`, `query`, `targetId`, `action`, `since`, and `limit`.

```js
const snapshot = await options.openruntime.snapshot({
  id: "business:checkout:summary"
});

options.output.ok({
  result: snapshot
});
```

#### Page Actions And State Waiting

These APIs run actions declared by the current opened page or wait for page state changes.

| API | Use it for |
| --- | --- |
| `inputOptions(actionName, inputName, { payload?, timeout? })` | Read dynamic input candidates for an action input. |
| `runAction(actionName, payload?)` | Execute a page-declared action. |
| `waitFor(targetId, status, { where?, timeout? })` | Wait until a page-declared target reaches a status. |

```js
const result = await options.openruntime.runAction("release-note.list-latest", {
  limit: 3
});

options.output.ok({
  result
});
```

#### Browser: Current Page Interaction

Browser APIs operate on the current OpenRuntime browser session. Commands do not receive page open, navigation, close, or raw browser runner APIs; run `openruntime open <url>` before invoking a command.

| API | Use it for |
| --- | --- |
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

Use browser APIs for page interaction and fallback inspection. Use page state and page action APIs when the page already exposes structured Targets or Actions.

## Complete Example: Latest Release From GitHub

Create `~/.openruntime/commands/github-release.mjs`:

```js
import { createError, defineCommand } from "@openruntime/cli";

export default defineCommand({
  schemaVersion: 1,
  name: "github-release",
  displayName: "GitHub Release",
  description: "Reads the latest release from the current module-federation/core releases page.",
  commandReferences: [
    {
      category: "Commands",
      usage: "openruntime github-release latest",
      description: "Read the latest release from the current GitHub releases page."
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

    if (options.page === undefined || !isModuleFederationReleasesPage(options.page.url)) {
      throw createError({
        code: "PAGE_URL_UNSUPPORTED",
        kind: "validation",
        message: "This command only supports the module-federation/core releases page.",
        hint: "Run `openruntime open https://github.com/module-federation/core/releases`.",
        details: {
          actualUrl: options.page?.url,
          expectedUrl: "https://github.com/module-federation/core/releases"
        }
      });
    }

    const browser = options.openruntime.browser;

    const ready = await browser.waitEval(`
      document.querySelector('a[href*="/module-federation/core/releases/tag/"]') !== null
    `, { timeout: 10000 });
    if (!ready.success) {
      throw createError({
        code: "GITHUB_RELEASE_PAGE_REQUIRED",
        kind: "validation",
        message: "Open the module-federation/core releases page first.",
        hint: "Run `openruntime open https://github.com/module-federation/core/releases`."
      });
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

    options.output.ok({
      result: latest
    });
    return 0;
  }
});

function isModuleFederationReleasesPage(input) {
  try {
    const url = new URL(input);
    return url.origin === "https://github.com" &&
      url.pathname.replace(/\/$/, "") === "/module-federation/core/releases";
  } catch {
    return false;
  }
}
```

Run:

```sh
openruntime open https://github.com/module-federation/core/releases
openruntime github-release latest
```

Expected output shape:

```json
{
  "status": "ok",
  "data": {
    "result": {
      "repository": "module-federation/core",
      "title": "Release title",
      "tag": "v0.0.0",
      "url": "https://github.com/module-federation/core/releases/tag/v0.0.0",
      "publishedAt": "2026-01-01T00:00:00Z",
      "notesPreview": "..."
    }
  }
}
```

## Best Practice Checklist

- Run `openruntime open <url>` before a command that needs page state.
- Commands operate on the opened page; do not open, navigate, or close the browser session inside a command.
- Validate `options.page.url` when the command only supports specific pages.
- Prefer `options.output` for command results, not direct stdout writes.
- Prefer Targets and Actions over DOM parsing when the application provides them.
- Use browser APIs for page interaction, fallback inspection, screenshots, console, and network data.
- Use `browser.evalFile` for large page scripts; use `browser.eval` for small expressions.
- Return `0` for success and throw an error or return non-zero for failure.
- Export commands with `defineCommand(...)` and call `validateCommand(...)` from tests or CI before submitting changes.
- Add `commandReferences` and `exampleReferences` so `openruntime --help` stays useful.
