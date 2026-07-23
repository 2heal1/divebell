import assert from "node:assert/strict";
import test from "node:test";

import extension from "./index.mjs";

function createOptions({ command, optionEntries = [], page } = {}) {
  const results = [];
  return {
    results,
    options: {
      args: {
        command: command ?? ["extension-demo"],
        options: new Map(optionEntries)
      },
      ...(page === undefined ? {} : { page }),
      openruntime: {
        browser: {
          getWindow: async path => ({
            path,
            found: true,
            value: path === "document.title" ? "Demo Page" : { loaded: true, version: 1 }
          })
        }
      },
      output: {
        ok: (data, message) => results.push({ status: "ok", data, message }),
        needsInput: (message, choices, data) =>
          results.push({ status: "needs_input", message, choices, data }),
        error: error => results.push({ status: "error", error })
      },
      stdout: { write() {} },
      stderr: { write() {} },
      fetcher: async () => {
        throw new Error("demo test should not call fetcher directly");
      }
    }
  };
}

test("入口声明的命令可以按需运行", async () => {
  assert.equal(extension.name, "cli-extension-demo");
  assert.equal(extension.commands[0].name, "extension-demo");

  const fixture = createOptions({
    command: ["extension-demo", "hello"],
    optionEntries: [["name", ["Codex"]]]
  });
  const exitCode = await extension.commands[0].run(fixture.options);

  assert.equal(exitCode, 0);
  assert.deepEqual(fixture.results, [{
    status: "ok",
    data: { greeting: "你好，Codex！", openedPage: null },
    message: "本地 Extension 已成功运行。"
  }]);
});

test("需要页面时给出下一步，而不是直接失败", async () => {
  const fixture = createOptions({ command: ["extension-demo", "page"] });
  const exitCode = await extension.commands[0].run(fixture.options);

  assert.equal(exitCode, 1);
  assert.equal(fixture.results[0].status, "needs_input");
  assert.match(fixture.results[0].message, /openruntime open/);
});

test("打开页面后读取标题和 open Hook 注入的标记", async () => {
  const fixture = createOptions({
    command: ["extension-demo", "page"],
    page: { url: "https://example.com" }
  });
  const exitCode = await extension.commands[0].run(fixture.options);

  assert.equal(exitCode, 0);
  assert.equal(fixture.results[0].data.url, "https://example.com");
  assert.equal(fixture.results[0].data.title.value, "Demo Page");
  assert.equal(fixture.results[0].data.marker.value.loaded, true);
});

test("Hook 返回可验证的初始化脚本和技术栈识别结果", async () => {
  const openResult = await extension.hooks.open({});
  assert.match(openResult.scripts[0], /__OPENRUNTIME_CLI_EXTENSION_DEMO__/);

  const fixture = createOptions();
  const detection = await extension.hooks.detectStack(fixture.options);
  assert.equal(detection.id, "openruntime-cli-extension-demo");
  assert.equal(detection.version, "1");
});
