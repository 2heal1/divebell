import assert from "node:assert/strict";
import test from "node:test";

import extension from "./index.mjs";

function createOptions({ command, optionEntries = [], page } = {}) {
  return {
    options: {
      args: {
        command: command ?? ["extension-demo"],
        options: new Map(optionEntries)
      },
      ...(page === undefined ? {} : { page }),
      divebell: {
        browser: {
          getWindow: async path => ({
            path,
            found: true,
            value: path === "document.title" ? "Demo Page" : { loaded: true, version: 1 }
          })
        }
      },
      fetcher: async () => {
        throw new Error("demo test should not call fetcher directly");
      }
    }
  };
}

test("runs the command declared by the entry point on demand", async () => {
  assert.equal(extension.name, "cli-extension-demo");
  assert.equal(extension.commands[0].name, "extension-demo");

  const fixture = createOptions({
    command: ["extension-demo", "hello"],
    optionEntries: [["name", ["Codex"]]]
  });
  const result = await extension.commands[0].run(fixture.options);

  assert.deepEqual(result, {
    greeting: "Hello, Codex!",
    openedPage: null
  });
});

test("provides a next step when a page is required", async () => {
  const fixture = createOptions({ command: ["extension-demo", "page"] });
  await assert.rejects(
    extension.commands[0].run(fixture.options),
    /divebell open/
  );
});

test("reads the title and marker injected by the open hook", async () => {
  const fixture = createOptions({
    command: ["extension-demo", "page"],
    page: { url: "https://example.com" }
  });
  const result = await extension.commands[0].run(fixture.options);

  assert.equal(result.url, "https://example.com");
  assert.equal(result.title.value, "Demo Page");
  assert.equal(result.marker.value.loaded, true);
});

test("hooks return verifiable initialization scripts and stack detection results", async () => {
  const openResult = await extension.hooks.open({});
  assert.match(openResult.scripts[0], /__DIVEBELL_CLI_EXTENSION_DEMO__/);

  const fixture = createOptions();
  const detection = await extension.hooks.detectStack(fixture.options);
  assert.equal(detection.id, "divebell-cli-extension-demo");
  assert.equal(detection.version, "1");
});
